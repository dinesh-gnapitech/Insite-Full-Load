import { Reference } from './reference';
import { ReadonlyFeatureView } from './readonlyFeatureView';

/* Note that unlike the Python version of this class, it needs to deal with accessing records for non myworld
 * datasources, hence an additional dsName parameter on some methods
 */

/**
  * Manager for accessing a specified version of the myWorld database's feature data
  *
  * Provides facilities for accessing feature tables (.table()). Also has
  * helpers for retrieving records direct from URNs etc (.get())
  * @example
class MyController extends BaseController {
    async myService(params) {
        await this.currentUser.assertAuthorized('myworld', featureType);
        const table = this.view.table('mytable');
        const feature = await this.view.table(featureType).get(params.id);
    }
 */
export class FeatureView {
    /**

     * @param {MyWorldDatabase} db
     * @param {string} [delta='']
     * @param {string} [schema='data'] 'data' or 'delta'
     */
    constructor(db, delta = '', schema = 'data') {
        /**
         * @type {MyWorldDatabase}
         */
        this.db = db;
        this.dd = db.dd;
        /**
         * Version identifier
         * @type {string}
         */
        this.delta = delta;
        /**
         * 'data' or 'delta'
         * @type {string}
         */
        this.schema = schema;
    }

    /**
     * Returns a feature table object to access features for self's delta (and schema)
     * @param {string} featureType
     * @param {string} [dsName='myworld']
     * @returns {FeatureTable}
     */
    table(featureType, dsName = 'myworld') {
        // for non myworld data (but stored in extract), a normal FeatureTable is always returned as there is no support for versioning
        if (dsName !== 'myworld') return this.dd.getFeatureTable(dsName, featureType);
        return this.dd.getFeatureTableForView(featureType, this);
    }

    /**
     * Returns a readonly, cached view of self
     * @returns {ReadonlyFeatureView}
     */
    getReadonlyView() {
        return new ReadonlyFeatureView(this);
    }

    // ==============================================================================
    //                                  RECORD ACCESS
    // ==============================================================================

    /**
     * Returns records referenced by REFS
     * Missing records are ignored. Order of result is undefined
     * @param {Array<string|Reference>} refs a list of References or URNs
     * @param {object} [options]
     * @param {boolean} [options.errorIfBad=false] If True, raises ValueError on malformed URNs
     * @returns {FeatureModel[]}
     */
    async getRecs(refs, options = {}) {
        // Group IDs by feature type (for speed)
        const idsByType = {};
        for (let ref of refs) {
            // Convert URN -> Ref (if necessary)
            if (!(ref instanceof Reference)) {
                ref = Reference.parseUrn(ref, options.errorIfBad);
                if (!ref) {
                    continue;
                }
            }

            // Add to list
            const typeKey = ref.datasource + '/' + ref.feature_type;
            let ids = idsByType[typeKey];
            if (!ids) {
                ids = idsByType[typeKey] = new Set();
            }
            ids.add(ref.id);
        }

        // Get features
        const recs = [];
        for (const [typeKey, ids] of Object.entries(idsByType)) {
            const [dsName, featureType] = typeKey.split('/');
            try {
                const table = this.table(featureType, dsName);
                const tableRecs = await table.getRecs(ids, options);
                recs.push(...tableRecs);
            } catch (error) {
                console.warn(`Failed to get records for `, ...ids);
            }
        }

        return recs;
    }

    /**
     * Returns the record referenced by REF (a MywReference or URN) if there is one
     * @param {Array<string|Reference>} refs a list of References or URNs
     * @param {object} [options]
     * @param {boolean} [options.errorIfBad=false] If True, raises ValueError on malformed URNs
     * @returns {FeatureModel}
     */
    async get(ref, options = {}, dsName = 'myworld') {
        // Cast to reference
        if (!ref.feature_type) {
            ref = Reference.parseUrn(ref, options.errorIfBad);
            if (!ref) {
                return undefined;
            }
        }

        // Get record (if it exists)
        const tab = await this.table(ref.feature_type, dsName);
        return tab.get(ref.id, options);
    }

    /**
     *
     * @param {Feature} feature
     * @param {string} relationshipName
     * @param {object} options
     * @returns {FeatureModel[]}
     */
    async followRelationship(feature, relationshipName, options) {
        const fieldDD = feature.featureDef.fields[relationshipName];
        const value = feature.properties[fieldDD.internal_name];
        if (value === null) return [];

        const fieldType = fieldDD.type;
        const mywType = this.dd.parseFieldType(fieldType);

        if (fieldDD.value?.startsWith('select(')) {
            //query reference or reference_set
            const foreignKeys = fieldDD.value.split('(')[1].split(')')[0].split(',');
            return this.dd.queryReferenceSet(feature, foreignKeys, options, this);
        } else if (mywType.baseType == 'foreign_key') {
            const dsName = 'myworld'; //foreign keys are always to myWorld datasource
            const featureType = mywType.params;
            const rec = await this.get(new Reference(dsName, featureType, value), options);
            return rec ? [rec] : [];
        } else if (mywType.baseType == 'reference' && !fieldDD.value) {
            const rec = await this.get(value, options);
            return rec ? [rec] : [];
        } else if (mywType.baseType == 'reference_set' && !fieldDD.value) {
            return (await this.getRecs(value, options)).filter(Boolean);
        }
    }

    /**
     * Run a given function in a database transaction and ensuring it doesn't interleave with other write operations
     * @param {function} func
     * @returns {Promise}
     */
    async runInTransaction(func) {
        return this.db.runWithinWriteLock(async () => {
            try {
                await this.beginTransaction();
                const result = await func();
                await this.commit();
                return result;
            } catch (error) {
                await this.rollback();
                throw error;
            }
        });
    }

    /**
     * Run a given function ensuring it doesn't interleave with other write operations
     * For more than one write operation consider using runInTransaction instead
     * @param {function} func
     * @returns {Promise}
     */
    runWithinWriteLock(func) {
        return this.db.runWithinWriteLock(func);
    }

    /**
     * Starts a database transaction
     * @returns {Promise}
     * @example
     *  try {
            await this.view.beginTransaction();
            const result = await this.runMyDbChanges();
            await this.view.commit();
            return result;
        } catch (error) {
            await this.view.rollback();
            throw error;
        }
     */
    beginTransaction() {
        return this.db.beginTransaction();
    }

    /**
     * Commits the current database transaction
     * @returns {Promise}
     */
    commit() {
        return this.db.commit();
    }

    /**
     * Rolls back the current database transaction
     * @returns {Promise}
     */
    rollback() {
        return this.db.rollback();
    }

    /*
     * Add comms-specific properties and methods to 'rec'
     *  Should not be necessary but kept for symmetry with Python code
     */
    augment(rec) {
        rec._view = this;
    }
}
