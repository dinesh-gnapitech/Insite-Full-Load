// Copyright: IQGeo Limited 2010-2023
import { groupBy, mapObject } from 'underscore';
import myw from 'myWorld/base/core';
import MywClass from 'myWorld/base/class';
import { trace as mywTrace } from 'myWorld/base/trace';
import Events from './eventsMixin';
import { Semaphore } from './semaphore';
import { Transaction } from './transaction';

const trace = mywTrace('database');

//this function generates 'redirect' methods
//these methods all receive a feature or feature type as the first argument and direct
//the call to the corresponding datasource
const getProxyMethod = methodName =>
    function (featureOrType, ...args) {
        const featureType = typeof featureOrType == 'string' ? featureOrType : featureOrType.type;

        if (!featureType)
            throw new Error(
                `First argument to ${methodName}() should be a string with the feature type`
            );

        const { dsName, typeInDs } = this._decomposeFeatureType(featureType);
        const datasource = this.getDatasource(dsName);
        if (typeof featureOrType == 'string') featureOrType = typeInDs;
        return datasource
            .ensureLoggedIn()
            .then(() => datasource[methodName](...[featureOrType, ...args]));
    };

export class Database extends MywClass {
    static {
        this.include(Events);

        /**
         * Obtains a feature
         * @param  {string}     featureType
         * @param  {string|number}     featureId   Key that identifies feature in table
         * @return {Promise<Feature>}
         * @method
         */
        this.prototype.getFeature = getProxyMethod('getFeature');

        /**
         * Get features of a given table optionally constrained by bounding box
         * @param  {univFeatureType}    featureType
         * @param  {queryParameters}    [options]      Filters to apply on results. Check the corresponding datasource for documentation on non-supported options
         * @return {Promise<Array<Feature>>}    Promise to resolve with a list of the matched features
         * @method
         */
        this.prototype.getFeatures = getProxyMethod('getFeatures');

        /**
         * Queries the database for features filtered on a field criteria
         * @param  {univFeatureType}   featureType  Name of the table/feature type
         * @param  {string}   field     Name of the field to filter on
         * @param  {string}   operator  Operator to use on the filter: "=" or "like"
         * @param  {string}   value     Value to filter on
         * @return {Promise<Array<Feature>>}  Promise for the resulting features
         * @method
         */
        this.prototype.getFeaturesByValue = getProxyMethod('getFeaturesByValue');

        /**
         * Create a new detached feature
         * @param  {univFeatureType}   featureType     feature type
         * @return {Promise<Feature>} Promise for a newly created detached feature
         * @method
         */
        this.prototype.createDetachedFeature = getProxyMethod('createDetachedFeature');

        /**
         * Insert a feature to a datasource. <br/>
         * Receives either a detached feature or a feature type and geojson
         * @param  {Feature|string}   detachedFeatureOrFeatureType
         * @param  {featureData}  [insertData]
         * @return {Promise<number|string>}    Promise for the id of the inserted feature
         * @method
         */
        this.prototype.insertFeature = getProxyMethod('insertFeature');

        /**
         * Updates a feature in a datasource. <br/>
         * Receives either an existing feature or a feature type, feature id and geojson with the changes to apply
         * @param  {Feature|string}   featureOrType
         * @param  {string}   [featureId]
         * @param  {featureData}   [updateData]
         * @return {Promise<boolean>}    Promise for the success of the operation
         * @method
         */
        this.prototype.updateFeature = getProxyMethod('updateFeature');

        /**
         * Delete a feature<br/>
         * Receives either an existing feature or a feature type and id
         * @param  {Feature|string}   featureOrType
         * @param  {string}   [featureId]
         * @return {Promise}    Promise which will resolve when the operation has completed
         * @method
         */
        this.prototype.deleteFeature = getProxyMethod('deleteFeature');

        /**
         * Count features of a given type with optional constraints
         * @param  {univFeatureType}    featureType
         * @param  {queryParameters}    [options]      Filters to apply on results. Check the corresponding datasource for documentation on non-supported options
         * @return {Promise<number>}    Promise to resolve with a number of the matched features
         * @method
         */
        this.prototype.countFeatures = getProxyMethod('countFeatures');
    }

    /**
     * @class Provides access to the several datasources configured in the system
     * @param  {System} system
     * @param  {string} applicationName
     * @constructs
     * @extends MywClass
     * @fires datasourceState-changed
     * @fires internetStatus-changed
     */
    constructor(system, applicationName) {
        super();
        this.applicationName = applicationName;
        this.system = system;

        this._datasourceDefs = {};
        this._datasources = {};

        //to keep interest of application components in feature details. Keyed on aspect name
        this._aspectsInterest = {};

        /** Mode used by nativeApp. Either 'local' or 'master'.
         *   Only used in NativeApp enviroment
         * @type {string} */
        this.nativeAppMode = 'local';

        this._semaphore = new Semaphore();
        trace(1, 'initializing');

        this.getSessionVars = this.getSessionVars.bind(this);

        /**
         * Promise that becomes fulfilled when the initialization has completed
         * @type {Promise}
         */
        this.initialized = this.system
            .getStartupInfo(applicationName)
            .then(startupInfo => {
                this.startupInfo = startupInfo;
                return this._ensureDatasourceDefs(startupInfo);
            })
            .then(() => {
                trace(1, 'initialized');
                return this;
            });
    }

    /**
     * Obtains feature DD information for the given feature type
     * @param  {Array<univFeatureType>} types
     * @return {Promise<Object<univFeatureType,featureDD>>} Promise for feature DDs keyed on (universal) feature type
     */
    async getDDInfoFor(types) {
        if (!types || types.length === 0) return {};

        const featuresDD = {};
        const typesPerDs = groupBy(types, type => {
            const ds = this.getDatasourceForType(type);
            return ds?.name;
        });
        delete typesPerDs[undefined];
        const typeInDsFunc = type => this._decomposeFeatureType(type).typeInDs;

        const promisePerDs = mapObject(typesPerDs, async (types, dsName) => {
            const datasource = this.getDatasource(dsName);
            //convert univFeatureType into "featureTypeInDatasource"
            types = types.map(typeInDsFunc);
            const ds = await datasource.ensureLoggedIn();
            const results = await ds.getDDInfoFor(types);
            //attach  datasource reference to each feature dd
            //ENH: move this to datasource._ensureDDInfoFor
            Object.entries(results).forEach(([featureType, result]) => {
                result.datasource = datasource;
                result.ufn = dsName == 'myworld' ? featureType : `${dsName}/${featureType}`;
                featuresDD[result.ufn] = result;
            });
        });

        await Promise.all(Object.values(promisePerDs));
        return featuresDD;
    }

    /**
     * Returns a new transaction object
     * @return {Transaction}
     */
    transaction() {
        return new Transaction(this);
    }

    /**
     * Run (insert, delete, update) operations on multiple features on one datasource within one transaction
     * @param {Transaction} transaction     Operations to be executed
     * @return {Promise<Array<number|string>>}  Lists of feature ids
     */
    async runTransaction(transaction) {
        const operations = await transaction.getOperations();
        const operationsPerDs = groupBy(operations, operation => {
            const ds = this.getDatasourceForType(operation[1]);
            return ds?.name;
        });
        delete operationsPerDs[undefined];
        const names = Object.keys(operationsPerDs);
        if (names.length > 1)
            throw new Error(`Can only run transaction on one datasource (${names.join(',')})`);
        const ds = this.getDatasource(names[0]);
        if (!ds.ensureLoggedIn || !ds.runTransaction)
            throw new Error(`Datasource ${names[0]} does not support transactions`);

        await ds.ensureLoggedIn();
        return ds.runTransaction(transaction);
    }

    /**
     * Signal the start of a user transaction - a set of database operations that shouldn't be intertwined with other processes
     * If successful this will ensure no other user transactions run simultaneously
     * If another user transaction has already been started this call will return a rejected promise
     * @param  {string}  msg                A name/description of the user process to start
     * @param  {boolean} [toWait=false]     If true and there is a current transaction running, the returned promise will not be
     *                                      rejected and will instead be resolved when there is no longer a current user transaction
     * @return {Promise} Resolves if/when the there is no current user transaction. See parameter 'toWait' for behaviour if there is another transaction already running
     */
    beginUserTransaction(msg, toWait = false) {
        if (!this._semaphore.isLocked()) {
            //free to start transaction
            this.currentTransactionName = msg;
            return this._semaphore.lock();
        }

        //there is another transaction running

        if (toWait) {
            return this._semaphore.lock().then(() => {
                this.currentTransactionName = msg;
            });
        } else {
            const message = `${this.msg('not_able_to_start')} ${msg} (${
                this.currentTransactionName
            } ${this.msg('running')})`;
            return Promise.reject(new Error(message));
        }
    }

    /**
     * Signal the end of the current user transaction
     *  @see  beginUserTransaction
     */
    endUserTransaction() {
        this._semaphore.unlock();
    }

    /**
     * Obtains information about accessible features types
     * @return {Object<univFeatureType,object>} Keyed on universal feature type
     */
    getFeatureTypes() {
        if (!this._featureTypes) {
            this._featureTypes = {};

            Object.entries(this._datasourceDefs).forEach(([dsName, dsDef]) => {
                Object.entries(dsDef.featureTypes ?? {}).forEach(([key, featureDD]) => {
                    const qualFeatureName = `${dsName}/${key}`;
                    this._featureTypes[qualFeatureName] = featureDD;
                });
            });
        }
        return this._featureTypes;
    }

    /**
     * Obtains information about editable feature types
     * @return {Object<univFeatureType,object>} Keyed on universal feature type
     */
    getEditableFeatureTypes() {
        const features = this.getFeatureTypes();
        const appEditableFeatureTypes = {};
        Object.entries(features).forEach(([featureDD, feature]) => {
            if (feature.editable) {
                //Only need to check if editable on datasource if editable on featureDD
                const featureInfo = this._decomposeFeatureType(featureDD);
                const ds = this.getDatasource(featureInfo.dsName);
                //Include features editable on datasource
                if (ds.appEditableFeatureTypes[featureInfo.typeInDs])
                    appEditableFeatureTypes[featureDD] = feature;
            }
        });
        return appEditableFeatureTypes;
    }

    /**
     * Finds the features selectable by a user map click
     * @param  {LatLng}   selectionPoint      Point the user clicked/selected
     * @param  {number}   zoomLevel           Zoom level at time of selection
     * @param  {number}   pixelTolerance  Number of pixels to use as tolerance for the selection
     * @param  {Array<Layer>}   layers      Layers relevant for selection (active and visible)
     * @param  {selectOptions}     [options]
     * @return {Promise<Array<Feature>>}  Promise for the features
     */
    async select(selectionPoint, zoomLevel, pixelTolerance, layers, options = {}) {
        const { worldId } = options;
        const features = await this._callWithLayersByDatasource(layers, (ds, layers) =>
            ds.select(selectionPoint, zoomLevel, pixelTolerance, layers, options)
        );

        const geomTypeMatches = (types, feature) => {
            let type;
            try {
                type = feature.getGeometryType(worldId);
            } catch (error) {
                console.warn(error);
            }
            return types.includes(type);
        };

        //if we have point features, return only point features
        //ENH: Do this on the datasource
        const points = features.filter(geomTypeMatches.bind(null, ['Point', 'MultiPoint']));
        if (points.length) return points;
        //if we have linestring features, return only those
        const lines = features.filter(
            geomTypeMatches.bind(null, ['LineString', 'MultiLineString'])
        );
        if (lines.length) return lines;
        else return features; // this will be empty or polygons
    }

    /**
     * Finds the features selectable by a user inside the given geom
     * @param {LatLngBounds} bounds          Bounds to select inside of
     * @param {number} zoomLevel  Zoom level at time of selection
     * @param {Array<Layer>} layers Layers relevant for selection (active and visible)
     * @param {selectOptions}     [options]
     * @returns selectable features intersecting bounds
     */
    selectBox(bounds, zoomLevel, layers, options) {
        return this._callWithLayersByDatasource(layers, (ds, layers) =>
            ds.selectBox(bounds, zoomLevel, layers, options)
        );
    }

    /**
     * Call a given function on the datasources of the given layers
     * @param {Array<Layer>} layers
     * @param {function} perDsCallback function to be called per datasource with arguments (ds, layers),
     *                                 layers will only contain the layers of that datasource
     * @private
     */
    async _callWithLayersByDatasource(layers, perDsCallback) {
        const requests = [];
        const layersPerDs = {}; //per datasource name
        const errorHandler = reason => {
            //make sure an error doesn't "stop" the selection flow
            console.warn('External selection failure. Reason:', reason);
            return [];
        };

        //get datasources to send selection requests
        layers.forEach(layer => {
            const ds = layer.datasource;
            if (typeof ds.select !== 'function') return; //datasource doesn't support selection, continue

            if (!layersPerDs[ds.name]) {
                layersPerDs[ds.name] = [];
            }
            layersPerDs[ds.name].push(layer);
        });

        //send requests
        Object.entries(layersPerDs).forEach(([dsName, layers]) => {
            const request = this.getDatasource(dsName)
                .ensureLoggedIn()
                .then(ds => perDsCallback(ds, layers))
                .catch(errorHandler);

            //put the myWorld request in the first position so that myw results are listed first
            if (dsName == 'myworld') requests.unshift(request);
            else requests.push(request);
        });

        const results = await Promise.allSettled(requests);
        const features = results
            .filter(r => r.status == 'fulfilled')
            .map(r => r.value)
            .flat();
        return features;
    }

    /**
     * Obtains a feature identified by its urn
     * @param  {urn}   urn      Urn of the desired feature
     * @return {Promise<Feature>}  Promise for the specified feature
     */
    async getFeatureByUrn(urn) {
        const parts = urn.split('/');
        const featureType = parts.slice(0, parts.length - 1).join('/');
        const datasource = this.getDatasourceForType(featureType);

        await datasource.ensureLoggedIn();
        return datasource.getFeatureByUrn(urn);
    }

    /**
     * Obtains features of a given type that are close to a point and within a tolerance
     * @param  {string[]}   featureTypes     Types of features to obtain
     * @param  {LatLng}   position
     * @param  {Integer}    tolerance       Tolerance in meters
     * @return {Promise<Feature[]>}    Promise for a list with the features which are close to the given point within the specified tolerance
     * @method
     */
    getFeaturesAround(featureTypes, position, tolerance) {
        const decomposed = featureTypes.map(featureType => this._decomposeFeatureType(featureType));
        const byDs = groupBy(decomposed, 'dsName');

        const requests = Object.entries(byDs).map(([dsName, featureTypes]) => {
            const typesInDs = featureTypes.map(f => f.typeInDs);
            const datasource = this.getDatasourceForType(dsName);
            return datasource.getFeaturesAround(typesInDs, position, tolerance);
        });

        return Promise.all(requests).then(res => res.flat());
    }

    /**
     * Get features given a list or urns
     * @param {string[]} urns
     * @param {queryParameters} [options] Only options controlling aspects to obtain are used
     */
    async getFeaturesByUrn(urns, options) {
        const decomposedUrns = urns.map(urn => this._decomposeUrn(urn));
        const byDs = groupBy(decomposedUrns, 'dsName');

        const requests = Object.entries(byDs).map(([dsName, decomposedUrns]) => {
            const datasource = this.getDatasourceForType(dsName);
            const dsUrns = decomposedUrns.map(dUrn => dUrn.typeInDs + '/' + dUrn.id);
            return datasource.getFeaturesByUrn(dsUrns, options);
        });

        return Promise.all(requests).then(res => res.flat());
    }

    /**
     * Sends a query request on a given feature type
     * @param  {queryDefinition}  queryDef
     * @param  {queryOptions}     [options]
     * @return {Promise<array<DDFeature>>} Promise for a list of features
     */
    async runQuery(queryDetails, options) {
        const datasource = this.getDatasourceForType(queryDetails.featureType);
        // For features with no geometry, remove bounds and geom in search
        const ddInfo = await this.getDDInfoFor([queryDetails.featureType]);
        const featureDD = ddInfo[queryDetails.feature_type] || ddInfo[queryDetails.featureType];
        if (!featureDD.geometry_type) {
            delete options.bounds;
            delete options.geom;
        }
        await datasource.ensureLoggedIn();
        return datasource.runQuery(queryDetails, options);
    }

    /**
     * Switches native app mode.
     * Will ask the user for login credentials if necessary
     * @param {string} mode 'local' or 'master'
     */
    setNativeAppMode(mode) {
        if (mode === this.nativeAppMode) return; //no change

        const oldMode = this.nativeAppMode; //so we can revert if necessary

        //set the new mode. This needs to be done before asking datasources if they are logged in,
        //otherwise the question would go to the wrong instance
        this.nativeAppMode = mode;

        const loginPromises = Object.values(this._datasources).map(datasource => {
            if (datasource.supportsReplication) {
                return datasource.ensureLoggedIn();
            }
        });

        return Promise.all(loginPromises)
            .then(() => {
                //success, inform other components (layers)
                this.fire('nativeAppMode-changed');
            })
            .catch(reason => {
                //some datasource is not logged in
                //revert mode switch
                this.nativeAppMode = oldMode; //change to local mode should never fail, so this should always be 'local'

                throw reason;
            });
    }

    /**
     * Returns an external datasource instance
     * @param  {object}     name    Name of datasource
     * @return {IDatasource}
     */
    getDatasource(name) {
        let datasource = this._datasources[name];

        if (!datasource) {
            const datasourceDef = this._datasourceDefs[name];
            const Datasource = datasourceDef && myw.datasourceTypes[datasourceDef.type];

            if (!datasourceDef)
                throw new Error(`Unable to get definition for datasource "${name}"`);
            if (!datasourceDef.type)
                throw new Error(`Definition of  datasource '${name}' doesn't specify a type`);
            if (!Datasource)
                throw new Error(`Unable to get datasource class for type "${datasourceDef.type}"`);

            datasource = this._datasources[name] = new Datasource(this, datasourceDef);

            datasource.on('changed', e => {
                this.fire('datasourceState-changed', e);
            });
        }

        return datasource;
    }

    /**
     * Returns the name of the datasource for the given urn
     * @param  {urn}     urn
     * @return {string}
     */
    getDatasourceNameForUrn(urn) {
        return this._decomposeUrn(urn).dsName;
    }

    /**
     * Returns an external datasource instance corresponding to a given feature type
     * @param  {univFeatureType}     featureType
     * @return {IDatasource}
     */
    getDatasourceForType(featureType) {
        const dsName = this._decomposeFeatureType(featureType).dsName;
        return this.getDatasource(dsName);
    }

    saveUserDatasource(def) {
        //ENH: ignore if already datasource def with same name?
        this._datasourceDefs[def.name] = def;
        delete this._datasources[def.name]; //so a future getDatasource returns an instance from the new definition
    }

    removeUserDatasource(name) {
        delete this._datasourceDefs[name];
        delete this._datasources[name];
    }

    /**
     * Registers interest in an aspect of feature details
     * When performing queries, this information can be used to optimize requests
     * @param  {string}     aspect  Aspect of feature information that a component is interested in (display_values, lobs,...)
     */
    registerInterest(aspect) {
        this._aspectsInterest[aspect] = (this._aspectsInterest[aspect] || 0) + 1;
    }

    /**
     * Deregisters interest in an aspect of feature details
     * @param  {string}     aspect  Aspect of feature's details
     */
    unregisterInterest(aspect) {
        this._aspectsInterest[aspect] = (this._aspectsInterest[aspect] || 1) - 1;
    }

    /**
     * Whether there is registered interest in a given aspect or not
     * @param  {string}     aspect  Aspect of feature's details
     * @return {boolean}
     * @private
     */
    existsInterestIn(aspect) {
        return this._aspectsInterest[aspect] > 0;
    }

    /**
     * Sets the current online status (ie. is connected to the internet) of the database
     * @param  {boolean} hasInternetAccess Whether the database should think it's online or not
     */
    setInternetStatus(hasInternetAccess) {
        if (this.hasInternetAccess !== hasInternetAccess) {
            this.hasInternetAccess = hasInternetAccess;
            this.fire('internetStatus-changed', { hasInternetAccess: hasInternetAccess });
        }
    }

    /**
     * Sets the value of a session variable
     * Session variables will be included in following types of requests:
     *        feature, select, search, render
     * @param {string} key
     * @param {literal|literal[]} value
     */
    setSessionVar(key, value) {
        if (!this._sessionVars) this._sessionVars = {};

        if (typeof value == 'undefined') {
            delete this._sessionVars[key];
        } else {
            this._sessionVars[key] = value;
        }

        if (!Object.entries(this._sessionVars).length) this._sessionVars = {};
    }

    /**
     * Returns an object with the current session variables
     * @param {object}  options
     * @param {boolean}  [options.includeSystem=true]
     * @return {object}
     */
    getSessionVars(options = {}) {
        const { includeSystem = true } = options;
        if (includeSystem) {
            const ds = this.getDatasource('myworld');
            const activeDelta = ds ? ds.getDelta() : '';
            return {
                user: myw.currentUser.username,
                application: this.applicationName,
                roles: this.startupInfo.roles,
                rights: this.startupInfo.rights,
                activeDelta,
                ...this._sessionVars
            };
        } else return { ...this._sessionVars };
    }

    /**
     * @param  {univFeatureType}     univFeatureType
     * @return {object}     With properties dsName and typeInDs
     * @private
     */
    _decomposeFeatureType(univFeatureType) {
        const parts = univFeatureType.split('/');
        if (parts.length <= 1) parts.unshift('myworld');
        return {
            dsName: parts[0],
            typeInDs: parts.slice(1).join('/')
        };
    }

    /**
     * @param  {urn}     urn
     * @return {object}     With properties dsName and typeInDs and id
     * @private
     */
    _decomposeUrn(urn) {
        const parts = urn.split('/');
        if (parts.length <= 2) parts.unshift('myworld');
        return {
            dsName: parts[0],
            typeInDs: parts.slice(1, -1).join('/'),
            id: parts.slice(-1)[0]
        };
    }

    /**
     * Ensures that datasource definitions are available.
     * This ensures that 'getDatasource()' can subsequently be called synchronously
     * @return {Promise}
     * @private
     */
    _ensureDatasourceDefs(startupInfo) {
        //store keyed on datasource name
        startupInfo.datasources.forEach(def => {
            def.layerDefs = startupInfo.layers.filter(layerDef => layerDef.datasource == def.name);
            this._datasourceDefs[def.name] = def;
        });
    }
}

/**
 * A string specifiyng a feature type across all datasources. <br/>
 * Format is '&lt;datasourceName&gt;/&lt;featureTypeInDatasource&gt;' <br/>
 * For the myworld datasource, its name is ommited and the format is only '&lt;featureTypeInDatasource&gt;'
 * @typedef {string} univFeatureType
 */

/**
 * A string specifiyng a universal feature identifier <br/>
 * Format is '&lt;datasourceName&gt;/&lt;featureTypeInDatasource&gt;/&lt;featureId&gt;' <br/>
 * For the myworld datasource, its name is ommited and the format is only '&lt;featureTypeInDatasource&gt;/&lt;featureId&gt;'
 * @typedef {string} urn
 */

/**
 * Data dictionary of a feature type
 * @typedef featureDD
 * @property  {Datasource}  datasource          Datasource instance for features of this type
 * @property  {string}          name                Name of feature type ()
 * @property  {univFeatureType} ufn                 Feature type identifier across all datasources
 * @property  {string}          external_name
 * @property  {Object<FieldDD>} fields              Keyed on field name
 * @property  {string}          geometry_type       'point', 'linestring', 'polygon'
 * @property  {Array<fieldGroup>} field_groups
 * @property  {Array<string>}   fields_order
 * @property  {Object}          defaults
 * @property  {boolean}         editable
 * @property  {boolean}         insert_from_gui
 * @property  {boolean}         update_from_gui
 * @property  {boolean}         delete_from_gui
 * @property  {boolean}         track_changes
 * @property  {boolean}         versioned
 */

/**
 * Data dictionary of a feature type
 * @typedef fieldGroup
 * @property  {string}          display_name
 * @property  {number}        position
 * @property  {Array<{field_name: string, position:number}>}          fields
 * @property  {boolean}         is_expanded
 */

/**
 * Details about the results of a query
 * @typedef queryDetails
 * @property  {queryDefinition} def         Query definition as generated by its datasource
 * @property  {queryOptions}    options
 * @property  {Array<Feature>} result
 * @property  {number}        count       Number or records included in the query result
 * @property  {number}        totalCount  Total number of records if a limit was not specified. A value of Infinity means that this value was not determined
 * @property  {number}        limit       Max number of records requested
 * @property  {number}        offset      Requested offset (value of 'offset' in queryParams)
 */

/**
 * Definition of a query.
 * Aditional properties may be present - these will be specific to the corresponding datasource
 * @typedef queryDefinition
 * @property {string}               feature_type             Type of features to query
 * @property {string}               [spatial_restriction]    'window' or 'selection'
 * @property {Array<queryClause>}   [clauses]                Clauses that restrict the features to include in results
 */

/**
 * An attribute clause to use when querying a feature table
 * @typedef queryClause
 * @property {string}           fieldName       Field name to filter on
 * @property {string}           operator        operator to use. One of =, <>, >=, <=, >, <, like, ilike
 * @property {string}           value           Value to filter on
 */

/**
 * Context options for a query
 * @typedef queryOptions
 * @property  {LatLngBounds}   [bounds]   Bounds to restrict results to
 * @property  {geojsonGeom}      [polygon]  Polygon to restrict results to
 * @property  {boolean}          [displayValues=false]
 */

/**
 * Parameters for a query
 * @typedef queryParameters
 * @property  {LatLngBounds}   [bounds]    Bounding box to filter the results on
 * @property  {geojsonGeom}    [geom]      Geometry to filter results on (results have to interact with geometry)
 * @property  {Predicate}      [predicate] Predicate to filter results on (myWorld datasource only). Recommended alternative to using 'clauses', 'filter'. Also supports geometry predicates
 * @property  {Array<queryClause>}  [clauses]   List of attribute clauses to use in filter
 * @property  {string}         [filter]    Expression in myworld query language to filter results (myWorld datasource only)
 * @property  {number}       [limit]     Max number of records to return.
 *                                         If the provided value is null then no limit will be applied.
 *                                         If no value is provided, defaults to the 'queryResultLimit' database setting.
 * @property  {number}       [offset]    Return the results starting from the given offset
 * @property  {boolean}        [includeTotal=false]     Whether to calculate the total number of results (without the limit) even if it is costly. Defaults to false. (myWorld datasource only)
 * @property  {boolean}        [displayValues=false]     Whether to include additional information about some of the fields (for display purposes). Defaults to true. (myWorld datasource only)
 * @property  {boolean}        [includeLobs=false]      Whether to include 'large object' (eg. image) fields or not. Defaults to false. (myWorld datasource only)
 * @property  {boolean}        [includeGeoGeometry=false]  Whether to include geo location geometry for internals objects. Defaults to false. (myWorld datasource only)
 * @property  {Array<orderClause>}   [orderBy] Columns to sort on and options
 */

/**
 * An attribute clause to use when querying a feature table
 * @typedef orderClause
 * @property {string}           fieldName       Field name to filter on
 * @property {boolean}          [descending=false]  Controls sort order
 */

/**
 * An attribute clause to use when querying a feature table
 * @typedef selectOptions
 * @property  {string}     [options.worldId]           Map's World. Defaults to geographical world
 * @property  {string}     [options.featureTypes]      Feature types to consider. Any others are ignored
 */

export default Database;
