// Copyright: IQGeo Limited 2010-2023
import { difference, findLastIndex, groupBy, pick } from 'underscore';
import myw, { Datasource, MissingFeatureDD, EventsMixin } from 'myWorld-base';
import { ProxyLayer } from './proxyLayer';

export class ProxyDatasource {
    //doesn't inherit from myw.Datasource's because some concepts don't make sense
    // (i.e properties, wrapping methods with error handling... )

    static {
        this.prototype.LocalDatasource = undefined;
        this.prototype.MasterDatasource = undefined; //to be overridden in subclasses if necessary
        this.prototype.supportsReplication = true; //to be defined in subclasses
    }

    /**
     * @class (Abstract class) Datasource to provide local/master mode functionality </br>
     * Directs requests to the appropriate datasource (local or master)
     * It will consider the application's nativeAppMode as well as any layer specific configuration
     * Subclasses should specify which classes to use for LocalDatasource and MasterDatasource
     * @param  {object}    options  Options for the original datasource that is being replaced
     * @constructs
     * @augments IDatasource
     */
    constructor(database, options) {
        this.setOptions(options);
        this.database = database;
        this.system = database.system;
        this.name = options.name;
        this.type = options.type;
        this.featuresDD = options.featureTypes;
        this.layerDefs = options.layerDefs;
        //ENH: this.enumerators = {}; //this isn't being populated. either have a method or populate it

        this._layers = {};

        this.localDs = new this.LocalDatasource(database, options);
        this.appEditableFeatureTypes = this.localDs.appEditableFeatureTypes;

        const masterDsOptions = Object.assign({}, options, {
            masterMode: true
        });
        this.masterDs = new this.MasterDatasource(database, masterDsOptions);

        this._setupExtensions();

        //channel through events from the two datasources
        const fireChangedEvent = this.fire.bind(this, 'changed');
        this.localDs.on('changed', fireChangedEvent);
        this.masterDs.on('changed', fireChangedEvent);

        this.maps = this.masterDs.maps; //for Esri. ENH: replace with configuration

        this.initialized = this.localDs.initialized.then(() => this);
    }

    get delta() {
        const ds = this._datasourceForMode(this.database.nativeAppMode);
        return ds.server.delta;
    }

    set delta(value) {
        this.localDs.server.delta = value;
        this.masterDs.initialized.then(() => (this.masterDs.server.delta = value));
    }

    /**
     * Returns the definition of a given layerName
     * @param  {string} layerName
     * @return {layerDefinition}
     */
    getLayerDef(layerName) {
        return this.layerDefs.find(l => l.name === layerName);
    }

    /**
     * Returns the mode to use for a given layer
     * @param  {string}  layerName Name of layer
     * @return {Boolean}
     */
    modeForLayer(layerName) {
        const layerDef = this.getLayerDef(layerName);
        const isExtracted = this.isLayerExtracted(layerDef.name);
        const hasLocalStorage = isExtracted || this.getName() == 'myworld';
        //determine mode as per configuration
        //a layer that isn't extracted is not necessarily master - this is the asymetric sync
        // scenario where features are not downloaded to the device but can be created and uploaded
        // in this case, the layer should show be able to show the local data (will depend also on layer mode and application mode)
        const layerConfigMode = hasLocalStorage ? layerDef.nativeAppMode || 'switchable' : 'master';
        const mode =
            layerConfigMode == 'switchable' ? this.database.nativeAppMode : layerConfigMode;
        return mode;
    }

    /**
     * Returns whether a layer is included in the current extract or not
     * @param  {string}  layerName Name of layer
     * @return {Boolean}
     */
    isLayerExtracted(layerName) {
        const layerDef = this.getLayerDef(layerName);
        return this.system.isLayerExtracted(layerDef);
    }

    /**
     * True if this datasource is accessible
     * @param  {string}  [layerName] Name of a layer. If given, current app view mode for the layer will be taken into consideration
     * @return {Boolean}
     */
    isOk(layerName) {
        const mode = layerName ? this.modeForLayer(layerName) : this.database.nativeAppMode;
        const ds = this._datasourceForMode(mode);
        return ds.isOk(layerName);
    }

    /**
     * Overriden because we only want it to happen for master ds when there is an operation on it
     * Local ds is always logged in.
     * @return {Promise} Resolves to self
     */
    ensureLoggedIn() {
        return Promise.resolve(this);
    }

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {ILayer}  The instantiated layer
     * @private
     */
    createLayer(layerDef, map) {
        let layer;
        layer = new ProxyLayer(this, layerDef, map);

        this._layers[layerDef.name] = layer;

        return layer;
    }

    /**
     * Finds the features selectable by a user map click. <br/>
     * Considers layers' app view mode
     * @param  {LatLng}   selectionPoint      Point the user clicked/selected
     * @param  {number}   zoomLevel           Zoom level at time of selection
     * @param  {number}   pixelTolerance  Number of pixels to use as tolerance for the selection
     * @param  {Array<Layer>}   layers      Layers relevant for selection (active and visible)
     * @param  {selectOptions}     [options]
     * @return {Promise<Array<Feature>>}  Promise for the features
     */
    select(selectionPoint, zoomLevel, pixelTolerance, layers, options) {
        const localLayers = layers.filter(layer => layer.appViewMode() == 'local');
        const masterLayers = layers.filter(layer => layer.appViewMode() != 'local');

        const localSelect = localLayers.length
            ? this.localDs.select(selectionPoint, zoomLevel, pixelTolerance, localLayers, options)
            : [];

        const masterSelect = masterLayers.length
            ? this.masterDs
                  .ensureLoggedIn()
                  .then(ds =>
                      ds.select(selectionPoint, zoomLevel, pixelTolerance, masterLayers, options)
                  )
                  .catch(error => []) //failure to connect to master shouldn't prevent local results
            : [];

        return Promise.all([localSelect, masterSelect]).then(results => {
            const [localFeatures, masterFeatures] = results;
            return localFeatures.concat(masterFeatures);
        });
    }

    /**
     * Finds the features selectable by a user map click. <br/>
     * Considers layers' app view mode
     * @param  {LatLngBounds} bounds          Bounds to select inside of
     * @param  {number}   zoomLevel           Zoom level at time of selection
     * @param  {Array<Layer>}   layers      Layers relevant for selection (active and visible)
     * @param  {string}     [worldId]           Defaults to geographical world
     * @return {Promise<Array<Feature>>}  Promise for the features
     */
    selectBox(selectionPoint, zoomLevel, layers, worldId) {
        const localLayers = layers.filter(layer => layer.appViewMode() == 'local');
        const masterLayers = layers.filter(layer => layer.appViewMode() != 'local');

        const localSelect = localLayers.length
            ? this.localDs.selectBox(selectionPoint, zoomLevel, layers, worldId)
            : [];

        const masterSelect = masterLayers.length
            ? this.masterDs
                  .ensureLoggedIn()
                  .then(ds => ds.selectBox(selectionPoint, zoomLevel, masterLayers, worldId))
                  .catch(error => []) //failure to connect to master shouldn't prevent local results
            : [];

        return Promise.all([localSelect, masterSelect]).then(results => {
            const [localFeatures, masterFeatures] = results;
            return localFeatures.concat(masterFeatures);
        });
    }

    /**
     * Sends a search request
     * @param  {string}         searchTerm      Text to search for
     * @param  {searchOptions}  [options]       Options to influence the search
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    runSearch(searchTerm, options) {
        const featureTypes = Object.keys(this.featuresDD ?? {});
        //ENH: at initialization make a list of local, master and switchable types
        const masterTypes = featureTypes.filter(type => {
            const mode = this._appModeForFeatureType(type);
            return mode == 'master';
        });
        const localTypes = difference(featureTypes, masterTypes);

        const localRequest = this._runLocalSearch(localTypes, searchTerm, options);
        //master search doesn't return bookmarks or 'feature_search' suggestions
        const masterRequest = this._runMasterSearch(masterTypes, searchTerm, options);

        return Promise.all([localRequest, masterRequest]).then(results => {
            const [localSuggestions, masterSuggestions] = results;
            return this._mergeSuggestions(localSuggestions, masterSuggestions);
        });
    }

    /*
     * We need to override getDDInfoFor instead of _fetchDDInfoForTypes because
     * we can't use results cached results in a proxyDatasource instance.
     * Reason is the dd for a given feature type can be different between master and local
     * so we need to get the right one for each call
     */
    getDDInfoFor(types) {
        //split types - non existing types should be handled by local ds
        const masterTypes = types.filter(type => this._appModeForFeatureType(type) == 'master');
        const localTypes = difference(types, masterTypes);
        let localRequest, masterRequest;

        localRequest = localTypes.length ? this.localDs.getDDInfoFor(localTypes) : [];
        masterRequest = masterTypes.length
            ? this.masterDs
                  .ensureLoggedIn()
                  .then(res => res['getDDInfoFor'].call(res, masterTypes))
                  .catch(error => {
                      if (error instanceof MissingFeatureDD) throw error;
                      //not accessible or user didn't login in - don't include any DD for features in master
                      return [];
                  })
            : [];

        return Promise.all([localRequest, masterRequest]).then(results => {
            let [localDD, masterDD] = results;
            return {
                ...pick(localDD, localTypes),
                ...pick(masterDD, masterTypes)
            };
        });
    }

    /*
     * Directs transaction to appropriate datasource (local or master)
     * Simultaneous local and master operations are not supported
     * @param {Transaction} transaction     Operations to be executed
     * @return {Promise<object<Array<number|string>>>}  Lists of feature ids, keyed on datasource name
     */
    runTransaction(transaction) {
        return transaction.getOperations().then(operations => {
            const masterOperations = operations.filter(operation => {
                const mode = this._appModeForFeatureType(operation[1]);
                return mode == 'master';
            });
            const localOperations = difference(operations, masterOperations);

            if (localOperations.length && masterOperations.length)
                throw new Error('Simultaneous local and master operations not supported');
            else if (localOperations.length) return this.localDs.runTransaction(transaction);
            else
                return this.masterDs
                    .ensureLoggedIn()
                    .then(res => res['runTransaction'].call(res, transaction));
        });
    }

    /**
     * Executes the given transaction in the local database without change tracking.
     * Disabling of change tracking means these changes won't trigger an upload of these changes from the device back to the master server.
     * Meant to be used with operational data that updates too frequently to be updated via the regular sync process.
     * Will throw an error if used with versioned or non-myWorld features types.
     * @param {Transaction} transaction elements can instances of Feature or feature data objects
     * @returns {Promise<void>} resolves when the features have been recorded in the local database
     */
    async runTransactionWithoutChangeTracking(transaction) {
        const operations = await transaction.getOperations();
        return this.localDs.server.runTransactionWithoutChangeTracking(operations);
    }

    /*
     * Directs transaction to appropriate datasource (local or master)
     * Simultaneous local and master operations are not supported
     * @param  {MyWorldFeature[]}   features    Features to update
     * @param  {object}   properties    Changes to apply
     * @param  {object}   [triggerChanges]
     * @return {string[]}     List with urns of updated features {updated_features}
     */
    bulkUpdateFeatures(features, properties, triggerChanges) {
        const masterFeatures = features.filter(feature => {
            const mode = this._appModeForFeatureType(feature);
            return mode == 'master';
        });
        const localFeatures = difference(features, masterFeatures);

        if (localFeatures.length && masterFeatures.length)
            throw new Error('Simultaneous local and master operations not supported');
        else if (localFeatures.length)
            return this.localDs.bulkUpdateFeatures(features, properties, triggerChanges);
        else
            return this.masterDs
                .ensureLoggedIn()
                .then(masterDs =>
                    masterDs.bulkUpdateFeatures(features, properties, triggerChanges)
                );
    }

    async runQuery(queryDef, options) {
        const featureType = queryDef.feature_type;
        const mode = this._appModeForFeatureType(featureType);
        const ds = this._datasourceForMode(mode);

        //since a query on a feature can be executed without the layer being on, we need
        // to ensure the corresponding datasource is logged in
        await ds.ensureLoggedIn();
        return ds.runQuery(queryDef, options);
    }

    async getLayerFeatures(params) {
        const mode = this.modeForLayer(params.layerName);
        const ds = this._datasourceForMode(mode);
        await ds.ensureLoggedIn();
        return ds.getLayerFeatures(params);
    }

    getFeaturesAround(featureTypes, position, tolerance) {
        //ENH: share code with getDDInfoFor
        //different feature types may be on different modes
        const masterTypes = featureTypes.filter(type => {
            const mode = this._appModeForFeatureType(type);
            return mode == 'master';
        });
        const localTypes = difference(featureTypes, masterTypes);
        let localRequest, masterRequest;

        localRequest = localTypes.length
            ? this.localDs.getFeaturesAround(localTypes, position, tolerance)
            : [];
        masterRequest = masterTypes.length
            ? this.masterDs
                  .ensureLoggedIn()
                  .then(res => res['getFeaturesAround'].call(res, masterTypes, position, tolerance))
                  .catch(error => []) //failure to connect to master shouldn't prevent local results
            : [];

        return Promise.all([localRequest, masterRequest]).then(results => {
            let [localFeatures, masterFeatures] = results;
            return localFeatures.concat(masterFeatures);
        });
    }

    _datasourceForMode(mode) {
        return mode == 'local' ? this.localDs : this.masterDs;
    }

    getDelta() {
        return this.database.nativeAppMode == 'local'
            ? this.localDs.getDelta()
            : this.masterDs.getDelta();
    }

    /**
     * Returns the native app mode to use for a given feature type
     * @param  {string} featureTypeName
     * @return {string}  'external', 'local' or 'master'. undefined if no access to feature
     */
    _appModeForFeatureType(featureTypeName) {
        const layerDef = this.options.layerDefs.find(def =>
            def.feature_types.find(f => f.name === featureTypeName)
        );

        if (!layerDef) {
            return undefined;
        } else if (layerDef.datasource == 'myworld') {
            const layerMode = layerDef.nativeAppMode || 'switchable';
            if (layerMode == 'switchable') return this.database.nativeAppMode;
            else return layerMode;
        } else {
            if (this.isLayerExtracted(layerDef.name)) return this.database.nativeAppMode;
            else return 'external';
        }
    }

    //performs a local search for the given feature types
    _runLocalSearch(localTypes, searchTerm, options) {
        const isMyWorldDs = this.getName() == 'myworld';

        //for the myworld datasource we always need to run a local search to look for bookmarks
        if (!localTypes.length && !isMyWorldDs) return [];

        return this.localDs
            .runSearch(searchTerm, options)
            .then(suggestions =>
                suggestions.filter(this._isSuggestionFeatureTypeIn.bind(this, localTypes))
            );
    }

    //performs a search in the master datasource for the given feature types
    //excludes feature_search and bookmarks suggestions
    _runMasterSearch(masterTypes, searchTerm, options) {
        if (!masterTypes.length) return [];

        return this.masterDs
            .ensureLoggedIn()
            .then(() => this.masterDs.runSearch(searchTerm, options))
            .then(suggestions => {
                //exclude non master feature types
                suggestions = suggestions.filter(
                    this._isSuggestionFeatureTypeIn.bind(this, masterTypes)
                );
                //and exclude feature_search and bookmark suggestions as these come from the local request
                return suggestions.filter(s => !['feature_search', 'bookmark'].includes(s.type));
            })
            .catch(reason => []);
    }

    /*
     * Whether a suggestion's featureType is included in a given list
     * Returns true if the suggestions isn't of type 'feature' or 'query'
     * @param  {string[]}  types
     * @param  {autoCompleteResult}  suggestion
     * @return {Boolean}
     */
    _isSuggestionFeatureTypeIn(types, suggestion) {
        const urn = suggestion.type == 'feature' && suggestion.data.urn;
        const featureType =
            (suggestion.type == 'query' && suggestion.data.feature_type) ||
            (urn && this.database._decomposeUrn(urn).typeInDs);

        return !featureType || types.includes(featureType);
    }

    /*
     * Merge two sets of suggestions keeping order
     * Assumes master suggestions only include 'query' and 'feature' suggestions
     */
    _mergeSuggestions(localSuggestions, masterSuggestions) {
        let lastQueryI = findLastIndex(
            localSuggestions,
            sug => sug.type == 'query' || sug.type == 'bookmark'
        );
        const lastFeatureI = findLastIndex(localSuggestions, sug => sug.type === 'feature');
        const masterByType = groupBy(masterSuggestions, 'type');
        let suggestions = localSuggestions;
        if (lastQueryI < 0) lastQueryI = 0;

        //merge master query suggestions after the last local query suggestion
        suggestions = suggestions
            .slice(0, lastQueryI)
            .concat(masterByType.query || [])
            .concat(suggestions.slice(lastQueryI));

        if (lastFeatureI >= 0) {
            //merge master query suggestions after the last local feature suggestion
            suggestions = suggestions
                .slice(0, lastFeatureI)
                .concat(masterByType.query || [])
                .concat(suggestions.slice(lastFeatureI));
        } else {
            // no local feature suggestions. just add master ones
            suggestions = suggestions.concat(masterByType.feature || []);
        }

        return suggestions;
    }

    _getFilters(...args) {
        //using local ds as DD will be same as master. no data being accessed
        return this.localDs._getFilters(...args);
    }

    //for Esri. ENH: replace with configuration
    async getLegendInfo(arg1) {
        const ds = this.masterDs;
        await ds.initialized;
        await ds.ensureLoggedIn();
        return ds.getLegendInfo(arg1);
    }

    /*
     * creates a getter on self for each registered datasource extension.
     * the getter returns the extension from the appropriate datasource (local or master) depending on current mode
     */
    _setupExtensions() {
        if (!this.LocalDatasource.extensions) return;
        for (let extensionName of Object.keys(this.LocalDatasource.extensions)) {
            Object.defineProperty(this, extensionName, {
                get: function () {
                    const ds = this._datasourceForMode(this.database.nativeAppMode);
                    return ds[extensionName];
                }
            });
        }
    }
}

//ProxyDatasource doesn't inherit from Datasource because some concepts don't make sense in constructor but we do want to inherit the prototype
Object.setPrototypeOf(ProxyDatasource, Datasource);
Object.setPrototypeOf(ProxyDatasource.prototype, Datasource.prototype);
ProxyDatasource.include(EventsMixin ?? myw.Events);

//generate api methods that depend only on the current mode
const getProxyMethod = methodName =>
    function (...args) {
        const ds = this._datasourceForMode(this.database.nativeAppMode);
        return ds[methodName](...args);
    };

//add the methods to the prototype
[
    'isLoggedIn',
    'getAuthOptions',
    'login',
    'isEditable',
    'transaction',
    'getRelationship',
    'getFeaturesMatching',
    'getNetworksFor',
    'traceOut',
    'shortestPath',
    'getFeaturesByUrn',
    'getVersionedFeatureTypes',
    'deltaFeatures',
    'deltaHasConflicts',
    'deltaConflicts',
    'deltaResolve',
    'deltaPromote',
    'deltaDelete',
    'moduleGet',
    'modulePut',
    'modulePost'
].forEach(funcName => {
    ProxyDatasource.prototype[funcName] = getProxyMethod(funcName);
});

//generate api methods that depend only on feature type and the corresponding layer's mode
const getLoginRequiredProxyMethod = methodName =>
    async function (featureOrfeatureType, ...args) {
        const featureType = featureOrfeatureType.getType?.() ?? featureOrfeatureType;
        const mode = this._appModeForFeatureType(featureType);
        const ds = this._datasourceForMode(mode);

        await ds.ensureLoggedIn();
        return ds[methodName].call(ds, featureOrfeatureType, ...args);
    };
//add the methods to the prototype
[
    'getFeature',
    'getFeatures',
    'countFeatures',
    'createDetachedFeature',
    'createDetachedFrom',
    'createDetachedFromJson',
    '_insertFeature',
    '_updateFeature',
    '_deleteFeature'
].forEach(funcName => {
    ProxyDatasource.prototype[funcName] = getLoginRequiredProxyMethod(funcName);
});
