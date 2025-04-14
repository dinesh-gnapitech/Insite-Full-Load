// Copyright: IQGeo Limited 2010-2023

export class Transaction {
    /**
     * @class Transaction to support operations on multiple features within one transaction
     * (the following operations are supported: insert, update, delete, deleteIfExists)
     * @param  {Database} database
     * @constructs
     */
    constructor(database) {
        if (!database)
            throw new Error(`Database argument is required ( Tip: use Datasource.transaction() ) `);

        this._db = database;
        this._operations = [];
    }

    /**
     * Runs the transaction
     * Transaction operations need to all be in the same datasource
     * @return {Promise<Array<number|string>>}  Lists of feature ids
     */
    run() {
        return this._db.runTransaction(this);
    }

    /**
     * Add an insert feature operation.
     * @param  {Feature|featureType} featureTypeOrFeature
     * @param  {geoJson} [feature]  Needs to be provided if first argument is the feature type
     * @returns {transactionPlaceholder}
     */
    addInsert(featureTypeOrFeature, feature) {
        this._addOp('insert', featureTypeOrFeature, feature);
        return { operation: this._operations.length - 1 };
    }

    /**
     * Add an insert feature operation which becomes an update if a feature with the same id already exists.
     * @param  {Feature|featureType} featureTypeOrFeature
     * @param  {geoJson} [feature]  Needs to be provided if first argument is the feature type
     * @returns {transactionPlaceholder}
     */
    addInsertOrUpdate(featureTypeOrFeature, feature) {
        this._addOp('insertOrUpdate', featureTypeOrFeature, feature);
        return { operation: this._operations.length - 1 };
    }

    /**
     * Add an update feature operation.
     * @param  {Feature|featureType} featureTypeOrFeature
     * @param  {geoJson} [feature] Needs to be provided if first argument is the feature type
     */
    addUpdate(featureTypeOrFeature, feature) {
        this._addOp('update', featureTypeOrFeature, feature);
    }

    /**
     * Add a delete feature operation.
     * @param  {Feature|featureType} featureTypeOrFeature
     * @param  {geoJson|string|number} [featureOrKey] Needs to be provided if first argument is the feature type
     */
    addDelete(featureTypeOrFeature, featureOrKey) {
        this._addOp('delete', featureTypeOrFeature, featureOrKey);
    }

    /**
     * Add a deleteIfExists feature operation. if the feature doesn't exist returns empty string
     * @param  {Feature|featureType} featureTypeOrFeature
     * @param  {geoJson|string|number} [featureOrKey] Needs to be provided if first argument is the feature type
     */
    addDeleteIfExists(featureTypeOrFeature, featureOrKey) {
        this._addOp('deleteIfExists', featureTypeOrFeature, featureOrKey);
    }

    /**
     * Get list of all operations
     * @return {Promise<Array<transactionItem>>}
     */
    getOperations() {
        return Promise.all(this._operations);
    }

    /**
     * Set list of all operations
     * @param {Array<transactionItem>} operations  List of operations to be performed in the transaction
     */
    setOperations(operations) {
        this._operations = operations;
    }

    /**
     * Adds an operation to be executed as part of the transaction
     * @param  {string}                   operation
     * @param  {Feature|featureType}  featureTypeOrFeature
     * @param  {geoJson|string|number}   featureOrKey
     * @private
     */
    _addOp(operation, featureTypeOrFeature, featureOrKey) {
        const promise = new Promise((resolve, reject) => {
            let featureType;
            if (typeof featureTypeOrFeature !== 'string') {
                featureType = featureTypeOrFeature.getType();
                featureOrKey = featureTypeOrFeature.asGeoJson();
            } else {
                featureType = featureTypeOrFeature;
            }
            if (!(featureOrKey instanceof Object)) {
                this._db.getDDInfoFor([featureTypeOrFeature]).then(featuresDD => {
                    const keyName = featuresDD[featureTypeOrFeature].key_name;
                    const properties = {};
                    properties[keyName] = featureOrKey;
                    const object = {};
                    object.properties = properties;
                    featureOrKey = object;
                    featureType = featureTypeOrFeature;
                    featureOrKey.type = 'Feature';
                    return resolve([operation, featureType, featureOrKey]);
                });
            } else {
                resolve([operation, featureType, featureOrKey]);
            }
        });
        this._operations.push(promise);
    }
}

/**
 * transactionItem -array returned by getOperations method
 * @typedef transactionItem
 * @property {string} operation     name of operation(insert,update,delete, deleteIfExists)
 * @property {string} featureType   type of feature
 * @property {GeoJson} feature geoJson feature
 */

/**
 * transactionPlaceholder - Placeholder for key created during transaction.
 * @example
 *  //Create a transaction inserting two related features
const transaction = new Transaction(db);
const placeholder = transaction.addInsert('damage_assessment', damageAssessmentFeature);
noteFeature.properties.referenced_feature = placeholder;
transaction.addInsert('note', noteFeature);
const results = await transaction.run();
const resultsids = results.ids;
 * @typedef transactionPlaceholder
 * @property {number} operation   index of the operation that will create the referenced key
 */
