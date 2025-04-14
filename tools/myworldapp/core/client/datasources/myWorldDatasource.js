// Copyright: IQGeo Limited 2010-2023
import { groupBy, indexBy } from 'underscore';
import myw from 'myWorld/base/core';
import config from 'myWorld/base/config';
import { processOptionsFromJson, evalAccessors } from 'myWorld/base/util';
import { Datasource } from './datasource';
import './dsExtension';
import { URLNotDefinedError } from 'myWorld/base/errors';
import { Transaction } from 'myWorld/base/transaction';
import { Feature } from 'myWorld/features/feature';
import { MyWorldFeature } from 'myWorld/features/myWorldFeature';
import { TraceResult } from 'myWorld/features/traceResult';
import 'myWorld/layers/tileLayer';
import MywVectorLayer from 'myWorld/layers/mywVectorLayer';
import MywVectorSharedSourceLayer from 'myWorld/layers/mywVectorSharedSourceLayer';
import MywSharedVectorSource from 'myWorld/layers/mywSharedVectorSource';
import HybridLayer from 'myWorld/layers/hybridLayer';
import 'myWorld/layers/mywVectorLayerLabeled';
import { VectorTileLayer } from 'myWorld/layers/vectorTileLayer';
import GeoserverLayer from 'myWorld/layers/geoserverLayer';
import GeoserverCombinedLayer from 'myWorld/layers/geoserverCombinedLayer';
import { latLng } from 'myWorld/base/latLng';
import { CONNECTION_METHODS } from 'myWorld/layers/geoserverImgRequest';
import { FilterParser } from 'myWorld/base/filterParser';
import TopoJSON from 'ol/format/TopoJSON';
import MVT from 'ol/format/MVT';
import Conflict from 'myWorld/features/conflict';

export class MyWorldDatasource extends Datasource {
    static supportsFeatureDefs = true;
    static supportsNewFeatureTypes = true;
    static supportsFeatureUpdating = true;
    static supportsTrackChanges = true;
    static supportsMultiGeomFields = true;
    static supportsVersioning = true;
    static supportsGeomIndexing = true;
    static supportsFeatureFilters = true;
    static {
        this.prototype.defaultFeatureModel = MyWorldFeature;

        this.mergeOptions({
            maxSuggestionsPerType: 10,
            geoserverUrls: {}
        });
    }

    static layerDefFields = [
        {
            name: 'rendering',
            type: 'string',
            enumerator: {
                vector: { group: 'datasourceConfigOptions', key: 'vector' },
                tilestore: { group: 'datasourceConfigOptions', key: 'tilestore' },
                hybrid: { group: 'datasourceConfigOptions', key: 'hybrid' },
                geoserver: { group: 'datasourceConfigOptions', key: 'geoserver' }
            },
            default: 'vector',
            viewClass: 'RenderingEditor',
            onChange: 'rebuildForm'
        },
        {
            name: 'tileType',
            type: 'enumerator',
            enumerator: {
                raster: 'Raster',
                mvt: 'Vector (MVT)',
                topojson: 'Vector (TopoJSON)'
            },
            default: 'raster',
            condition: def => ['tilestore', 'hybrid'].includes(def.spec?.rendering)
        },
        {
            name: 'maxTileZoom',
            type: 'enumerator',
            enumerator: Array.from({ length: 21 }, (v, i) => i + 10), //10->30
            width: '100px',
            condition: def => ['tilestore', 'hybrid'].includes(def.spec?.rendering)
        },
        {
            name: 'layer',
            type: 'string',
            condition: def =>
                ['overlay', 'basemap'].includes(def.category) &&
                ['tilestore', 'hybrid'].includes(def.spec?.rendering)
        },
        {
            name: 'jsClass',
            type: 'string'
        },
        {
            name: 'extraOptions',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value', valType: 'json' }
        },
        {
            name: 'isStatic',
            type: 'boolean',
            default: true,
            condition: def => def.spec?.rendering == 'vector'
        },
        {
            name: 'useImageCanvas',
            type: 'boolean',
            default: true,
            condition: def => def.spec?.rendering == 'vector'
        },
        {
            name: 'nativeAppMode',
            type: 'string',
            default: 'switchable',
            enumerator: {
                switchable: { group: 'datasourceConfigOptions', key: 'switchable' },
                master: { group: 'datasourceConfigOptions', key: 'master' },
                local: { group: 'datasourceConfigOptions', key: 'local' }
            },
            condition: def => ['vector', 'tilestore'].includes(def.spec?.rendering)
        },
        {
            name: 'render_order_point_offset',
            type: 'string',
            enumerator: [...Array(51).keys()],
            width: '100px',
            default: 0,
            condition: def => def.spec?.rendering == 'vector'
        },
        {
            name: 'geoserverName',
            type: 'string',
            enumerator: 'datasource.geoserverNames',
            condition: def => def.spec?.rendering == 'geoserver'
        },
        {
            name: 'geoserverWorkspace',
            type: 'string',
            condition: def => def.spec?.rendering == 'geoserver'
        },
        {
            name: 'geoserverLayer',
            type: 'string',
            condition: def => def.spec?.rendering == 'geoserver'
        }
    ];

    static specFields = [
        {
            name: 'tilestore',
            type: 'json',
            viewClass: 'KeyValueView',
            args: {
                isArray: true,
                keyProp: 'layers',
                valueProp: 'file',
                keyTitle: 'layers',
                valueTitle: 'file'
            }
        },
        {
            name: 'geoserverUrls',
            type: 'json',
            viewClass: 'GeoserverURLTable',
            args: { keyTitle: 'name', valueTitle: 'url' }
        },
        {
            name: 'combineGeoserverRequests',
            type: 'boolean',
            default: false
        },
        {
            name: 'combineGeoserverJsClass',
            type: 'string'
        }
    ];

    /**
     * @class Datasource to provide visualisation, selection and search on a remote myWorld server </br>
     * @param  {myWorldDatasourceOptions}    options
     * @constructs
     * @augments IDatasource
     * @augments Datasource
     */
    constructor(database, options) {
        super(database, options);

        this.layerCodes = [];
        this.layerNames = [];
        this.featureTypes = [];

        //initialise registered extensions
        for (let [extensionName, ExtensionClass] of Object.entries(MyWorldDatasource.extensions)) {
            try {
                this[extensionName] = new ExtensionClass(this);
            } catch (e) {
                console.warn(`Failed to initialize extension '${extensionName}':`, e);
            }
        }

        this.geoserverNames = Object.keys(this.options.geoserverUrls ?? {});

        //bind methods so we don't need to do it later
        ['asFeatures', 'asTraceResult', 'getDelta'].forEach(
            method => (this[method] = this[method].bind(this))
        );

        this.initialized = this._getServer()
            .then(database.system.getStartupInfo.bind(database.system, database.applicationName))
            .then(startupInfo => {
                this.startupInfo = startupInfo;
                return this;
            });
    }

    /**
     * Determines database version for all operations. empty string means master
     * @type {string}
     */
    get delta() {
        return this.server.delta;
    }

    set delta(value) {
        if (value) this.system.consumeLicence(this.database.applicationName, 'core.versioning');
        this.server.delta = value;
    }

    /**
     * Obtains the JavaScript class to instantiate a feature of the given type <br/>
     * _ensureDDInfoFor() should be called beforehand
     *  Overridden to create an 'unahtorized' dd for feature types that we couldn't obtain a dd
     * @param  {string}     [featureType]     Type of feature
     * @return {Class}
     * @protected
     */
    _getFeatureClassFor(featureType) {
        const featureDD = this.featuresDD[featureType];
        if (!featureDD) {
            this.featuresDD[featureType] = {
                unauthorized: true
            };
        }

        return super._getFeatureClassFor(featureType);
    }

    /* ****************************** Interface methods **************************** */

    /**
     * Returns the credentials to use for the login request
     * Returns true if it needs credentials by user
     * Returns false if login is not necessary
     * @return {Promise<boolean>}  Keyed on field name
     */
    getLoginCredentials() {
        return this.server.isLoggedIn().then(
            (
                isLoggedIn //if not logged in we need credentials from user
            ) =>
                //if already logged in, no credentials are necessary
                !isLoggedIn
        );
    }

    /**
     * Obtain details about fields necessary to perform a login request
     * @return {Promise}
     */
    getAuthOptions() {
        return this.server.getAuthOptions();
    }

    /**
     * Logs in to the datasource
     * @param  {object} credentials
     * @return {Promise}
     */
    login(credentials) {
        return this.server.login(credentials);
    }

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {TileLayer|MywVectorLayer}  The instantiated layer
     * @private
     */
    createLayer(layerDef, map) {
        let layer;
        const layerDefFixedOptions = processOptionsFromJson(layerDef.extraOptions ?? {});
        Object.assign(layerDef.options, layerDefFixedOptions); //ENH: move to Layer.initialize

        const isAnywhereLocal = myw.isNativeApp && layerDef.mode === 'local';

        if (isAnywhereLocal && layerDef.nativeAppVector) {
            // tilestore layer with "as vector" after certain zoom level
            layer = this._createNativeAppLayer(layerDef);
        } else if (layerDef.rendering == 'tilestore') {
            //tiles myWorld tile datastore
            layer = this._createTileLayer(layerDef);
        } else if (layerDef.rendering == 'geoserver') {
            //tiles server via geoserver
            layer = this._createGeoserverLayer(layerDef);
        } else if (layerDef.rendering == 'hybrid') {
            //tiles and vector after a certain zoom level
            layer = this._createHybridLayer(layerDef);
        } else {
            //vector
            const defaultClass = isAnywhereLocal ? MywVectorLayer : MywVectorSharedSourceLayer;
            layer = this._createVectorLayer(layerDef, defaultClass);
        }

        this._registerLayer(layerDef);

        return layer;
    }

    /**
     * Whether this datasource allows editing of features
     * @return {Boolean}
     */
    isEditable() {
        return this.server.isMasterDatabase() || this.server.isReplicaDatabase();
    }

    /**
     * Obtains a feature
     * @param  {string}     featureType
     * @param  {string|number}    featureId    Key that identifies feature in table
     * @param  {boolean}    [includeLobs=true]  Whether large object fields should be included or not
     * @param  {string}     [delta]             Id of delta to obtain the feature from (overrides database's delta)
     * @return {Promise<MyWorldFeature>}
     */
    getFeature(featureType, featureId, includeLobs, delta) {
        includeLobs = includeLobs !== false; //default is true

        return this.server
            .getFeature(this.getName(), featureType, featureId, includeLobs, delta)
            .then(data => this.asFeatures(data, true, includeLobs))
            .then(features => {
                if (features.length > 0) return features[0];
            });
    }

    /**
     * Get features of a given table optionally constrained by bounding box
     * @param  {string}             featureType
     * @param  {queryParameters}    [options]       Filters to apply.
     * @return {Promise<Array<Feature>>}    Promise to resolve with a list of the matched features
     */
    getFeatures(featureType, options) {
        options = Object.assign({ dsName: this.getName() }, options);

        this._processGetFeaturesDefaultOptions(options);
        if (options.limit === null) delete options.limit;
        //null means not limited
        else options.limit = options.limit || config['core.queryResultLimit']; //ENH: receive in this.options instead of accesing config

        //ENH: convert clauses into filter so that server doesn't need to handle clauses

        return this.server.getFeatures(featureType, options).then(this.asFeatures);
    }

    /**
     * Get features given a list or urns
     * @param {string[]} urns
     * @param {queryParameters} options Only options controlling aspects to obtain are used
     */
    async getFeaturesByUrn(urns, options) {
        options = options || {};
        this._processGetFeaturesDefaultOptions(options);
        const urnsByType = groupBy(urns, urn => urn.split('/')[0]);
        const types = Object.entries(urnsByType);
        const results = await Promise.all(
            types.map(([type, urns]) => {
                const ids = urns.map(urn => urn.split('/')[1]);
                return this.server.getFeaturesByUrn(type, ids, options);
            })
        );
        const features = results.flatMap(r => r.features);
        return this.asFeatures({ features });
    }

    //sets defaults for getFeatures requests in a given 'options' object
    _processGetFeaturesDefaultOptions(options) {
        if (typeof options.displayValues == 'undefined')
            //unspecified, default to if there is any registered interest
            options.displayValues = this.database.existsInterestIn('display_values');
        else options.displayValues = !!options.displayValues; //ensure boolean
        options.includeLobs = !!options.includeLobs; //default false
        options.includeGeoGeometry = !!options.includeGeoGeometry; //default false
    }

    /**
     * Count features of a given table optionally constrained by bounding box
     * @param  {string}             featureType
     * @param  {queryParameters}    [options]       Filters to apply.
     * @return {Promise<number>}    Promise to resolve with a number of the matched features
     */
    countFeatures(featureType, options) {
        options = Object.assign({ dsName: this.getName() }, options);

        return this.server.countFeatures(featureType, options);
    }

    /**
     * Finds the features selectable by a user map click
     * @param  {LatLng}   selectionPoint      Point the user clicked/selected
     * @param  {number}   zoomLevel           Zoom level at time of selection
     * @param  {number}   pixelTolerance  Number of pixels to use as tolerance for the selection
     * @param  {Array<Layer|string>}   layers      Layers relevant for selection (active and visible)
     * @param  {selectOptions}     [options]
     * @return {Array<Feature>}  Promise for the features
     */
    async select(selectionPoint, zoomLevel, pixelTolerance, layers, options = {}) {
        const { worldId, featureTypes } = options;
        const layerIds = this._getLayerIds(layers);
        const args = [worldId, latLng(selectionPoint), zoomLevel];
        let features = [];
        if (layerIds.length) {
            const options = { featureTypes };
            const res = await this.server.selection(...args, layerIds, pixelTolerance, options);
            if (res?.features) features = features.concat(res.features);
        }

        //handle selection in layers configured for delta schema
        const deltaLayerIds = this._getLayerIds(layers, 'delta');
        if (deltaLayerIds.length) {
            const options = { schema: 'delta', featureTypes };
            const deltaArgs = [...args, deltaLayerIds, pixelTolerance, options];
            const res = await this.server.selection(...deltaArgs);

            if (res?.features) features = features.concat(res.features);
        }

        return this.asFeatures({ features }, false);
    }

    _getLayerIds(layers, schema = 'data') {
        return layers
            .map(layer => {
                if (typeof layer == 'string') return layer;
                const layerSchema = layer.layerDef.extraOptions?.schema || 'data';
                if (layerSchema == schema) return layer.getCode();
            })
            .filter(Boolean);
    }

    /**
     * Finds the features selectable by box select
     * @param  {LatLngBounds} bounds  Bounds to select inside of
     * @param  {number}   zoomLevel           Zoom level at time of selection
     * @param  {Array<Layer|string>}   layers      Layers relevant for selection (active and visible)
     * @param  {selectOptions}     [options]
     * @return {Promise<Array<Feature>>}  Promise for the features
     */
    async selectBox(bounds, zoomLevel, layers, options = {}) {
        const layerIds = this._getLayerIds(layers);

        const limit = config['core.queryResultLimit']; //max number of features selectable
        let features = [];

        if (layerIds.length) {
            const res = await this.server.selectBox(bounds, zoomLevel, layerIds, limit, options);
            if (res?.features) features = features.concat(res.features);
        }

        //handle selection in layers configured for delta schema
        const deltaLayerIds = this._getLayerIds(layers, 'delta');
        if (deltaLayerIds.length) {
            const args = [bounds, zoomLevel, deltaLayerIds, limit, { schema: 'delta', ...options }];
            const res = await this.server.selectBox(...args);
            if (res?.features) features = features.concat(res.features);
        }

        return this.asFeatures({ features }, false);
    }

    /**
     * Sends a search request
     * @param  {string}         searchTerm      Text to search for
     * @param  {searchOptions}  [options]       Options to influence the search
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    runSearch(searchTerm, options) {
        options = {
            limit: this.options.maxSuggestionsPerType,
            ...options
        };

        return this.server
            .runSearch(this.getName(), searchTerm.toLowerCase(), options)
            .then(this._addFeatureSearchSuggestion.bind(this, searchTerm, options.limit))
            .then(this._parseSuggestions.bind(this));
    }

    /**
     * Sends a query request on a given feature type
     * @param  {queryDefinition}  queryDef   As generated by results of runSearch()
     * @param  {queryOptions}     [options]
     * @return {Promise<array<MyWorldFeature>>} Promise for a list of features
     */
    runQuery(queryDef, options) {
        const params = {
            filter: queryDef.filter,
            includeGeoGeometry: true
        };

        if (options.bounds) params.bounds = options.bounds;
        if (options.polygon) params.geom = options.polygon;
        if (options.displayValues) params.displayValues = options.displayValues;

        return this.getFeatures(queryDef.feature_type, params);
    }

    /**
     * Sends a feature search request that covers multiple feature types
     * @param  {string}         text    Text to search for
     * @param  {searchOptions}  [options]  Note: bounds options is not used (won't bias results)
     * @return {Promise<array<MyWorldFeature>>} Promise for a list of features
     */
    getFeaturesMatching(text, options) {
        options = Object.assign({}, options);

        return this.server
            .getFeaturesMatching(this.getName(), text.toLowerCase(), options)
            .then(this.asFeatures);
    }

    /**
     * Obtains features of a given type that are close to a point and within a tolerance
     * @param  {string[]}   featureTypes     Types of features to obtain
     * @param  {LatLng}   position
     * @param  {Integer}    tolerance       Tolerance in meters
     * @return {Promise<MyWorldFeature[]>}    Promise for a list with the features which are close to the given point within the specified tolerance
     */
    async getFeaturesAround(featureTypes, position, tolerance) {
        //ENH: make this just one call
        const requests = featureTypes.map(async featureType => {
            const data = await this.server.getFeaturesAround(featureType, position, tolerance);
            return data.features;
        });

        const results = await Promise.all(requests);
        const features = {
            features: results.flat()
        };
        return this.asFeatures(features);
    }

    /**
     * Delete a feature by it's id
     * @param  {string}   featureType
     * @param  {string}   featureId
     * @return {Promise}    Promise which will resolve when the operation has completed
     */
    _deleteFeature(featureType, featureId) {
        return this.server.deleteFeature(featureType, featureId);
    }

    /**
     * Insert a feature into a table
     * @param  {string}   featureType
     * @param  {featureData}   insertData
     * @param  {boolean}   [update=false] If true, an id is provided and feature already exits, update it
     * @return {Promise<number>}    Promise for the id of the inserted feature
     */
    _insertFeature(featureType, insertData, update = false) {
        return this._prepareValues(featureType, true, insertData).then(convertedData =>
            this.server.insertFeature(featureType, convertedData, update)
        );
    }

    /**
     * Update a feature in a table
     * @param  {string}   featureType
     * @param  {string}   featureId
     * @param  {featureData}   updateData
     * @return {Promise<boolean>}    Promise for the success of the operation
     */
    _updateFeature(featureType, featureId, updateData) {
        return this._prepareValues(featureType, false, updateData).then(convertedData =>
            this.server.updateFeature(featureType, featureId, updateData)
        );
    }

    /**
     * Update a collections of features with a given set of field/value pairs
     * @param  {MyWorldFeature[]}   features
     * @param  {object}   properties
     * @param  {object}   [triggerChanges]
     * @return {Promise<Array<string>>}     List with urns of updated features
     */
    async bulkUpdateFeatures(features, properties, triggerChanges) {
        properties = await this._prepareBulkValues(features, properties);
        const response = await this.server.bulkUpdateFeatures(features, properties, triggerChanges);
        return response.updated_features;
    }

    /**
     * Returns the features in a relationship with a given feature
     * @param  {Feature} feature            Feature for which we want the related records
     * @param  {string} relationshipName    Name of relationship (field)
     * @param  {object} aspects
     * @property  {boolean}        [aspects.includeLobs=false]      Whether to include 'large object' (eg. image) fields or not. Defaults to false. (myWorld datasource only)
     * @property  {boolean}        [aspects.includeGeoGeometry=true]  Whether to include geo location geometry for internals objects. Defaults to true. (myWorld datasource only)
     * @return {Promise<Feature[]>}    Promise for a list with the features in the relationship
     */
    getRelationship(feature, relationshipName, aspects = {}) {
        const { includeGeoGeometry = true, includeLobs = false } = aspects;
        aspects = { includeGeoGeometry, includeLobs };
        const fieldDD = feature.featureDD.fields[relationshipName];

        if (!fieldDD) {
            throw new Error(
                `No relationship '${relationshipName}' for feature type: ${feature.getType()}`
            );
        } else if (fieldDD.value) {
            //calculated field
            return this._getCalculatedRelationship(feature, fieldDD, aspects);
        } else if (fieldDD.baseType == 'foreign_key') {
            //stored foreign_key to single (myWorld) feature
            return this.server
                .getRelationship(feature, relationshipName, aspects)
                .then(this.asFeatures);
        } else if (fieldDD.baseType == 'reference') {
            //stored reference to single feature
            const urn = feature.properties[relationshipName];
            if (!urn) return Promise.resolve([]);
            return this.database.getFeatureByUrn(urn).then(feature => (feature ? [feature] : []));
        } else {
            //stored reference to multiple features
            return this._getReferenceSetRelationship(feature, relationshipName, aspects);
        }
    }

    /**
     * Get features of a given table for vector rendering
     * @param  {renderParams}    params         Render parameters
     * @return {Promise<Array<Feature>>}    Promise to resolve with a list of the matched features
     */
    getLayerFeatures(params) {
        params.limit = params.limit || config['core.queryResultLimit'];

        return this.server
            .getLayerFeatures(params)
            .then(data =>
                this.asFeatures(data.featureCollection, true).then(features =>
                    Promise.resolve({ features: features, offset: data.offset })
                )
            );
    }

    /**
     * Returns a new transaction object
     * @return {Transaction}
     */
    transaction() {
        return new Transaction(this.database);
    }

    /**
     * Run (insert, delete, update) operations on multiple features within one transaction in the database
     * @param {Transaction} transaction     Operations to be executed
     * @return {Promise<Integer[]>}  Promise which resolves with ids
     */
    async runTransaction(transaction) {
        const ops = await transaction.getOperations();
        const opsPromises = ops.map(operation => {
            //adjust operation, converting values as necessary
            let toGenerate = false;
            const op = operation[0];
            const featureType = operation[1];
            const feature = operation[2];
            if (op == 'insert') {
                toGenerate = true;
            }
            if (op == 'delete' || op == 'deleteIfExists') {
                return operation;
            }

            return this._prepareValues(featureType, toGenerate, feature).then(convertedData => {
                convertedData.type = 'Feature';
                return [op, featureType, convertedData];
            });
        });

        const operations = await Promise.all(opsPromises);
        return this.server.runTransaction(operations);
    }

    /**
     * Returns the networks a given feature can be part of
     * @param  {MyWorldFeature} feature
     * @return {Promise}         Network properties keyed on network name
     */
    getNetworksFor(feature) {
        return this.server.getNetworksFor(feature);
    }

    /**
     * Find connected network objects
     * @param {string}    network  Name of network to trace through
     * @param {Feature|string}    feature  Start feature
     * @param {boolean}  [options.direction='downstream'] Direction to trace in (upstream|downstream|both)
     * @param {number}   [options.maxDist]  Max distance to trace to, in meters
     * @param {string}   [options.resultType='features']  Structure of results: 'features' or 'tree'
     * @param {string[]} [options.resultFeatureTypes]  Feature types to include in result
     * @param {Object<object>} [options.filters]  Filters keyed on feature type
     * @return {Promise<Array<Feature>>}  Connected features
     */
    traceOut(network, feature, options = {}) {
        // direction, maxDist, resultType, filters, returnTypes

        this.system.consumeLicence(this.database.applicationName, 'core.network_trace');

        let featureUrn = feature;
        if (typeof feature.getUrn === 'function') {
            featureUrn = feature.getUrn();
        }

        options = {
            direction: 'downstream',
            resultType: 'features',
            maxNodes: config['core.plugin.trace.limit'],
            ...options
        };

        const handleResult =
            options.resultType == 'tree' ? this.asTraceResult : result => this.asFeatures(result);

        return this.server.traceOut(network, featureUrn, options).then(handleResult);
    }

    /**
     * Find shortest path through a network
     * @param {string}    network  Name of network to trace through
     * @param {Feature}    feature  Start feature
     * @param {string}    toUrn  URN of destination feature
     * @param {number}   [options.maxDist]  Max distance to trace to, in meters
     * @param {string}   [options.resultType='features']  Structure of results: 'features' or 'tree'
     * @return {Promise<Array<Feature>>}  Path to destination feature (empty if not reachable)
     */
    shortestPath(network, feature, toUrn, options = {}) {
        this.system.consumeLicence(this.database.applicationName, 'core.network_trace');

        options = {
            resultType: 'features',
            maxNodes: config['core.plugin.trace.limit'],
            ...options
        };

        const handleResult =
            options.resultType == 'tree' ? this.asTraceResult : result => this.asFeatures(result);

        return this.server.shortestPath(network, feature, toUrn, options).then(handleResult);
    }

    /**
     * Invokes a custom module controller via a GET request
     * @param {string} url
     * @param {object} params
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     */
    moduleGet(url, params, taskOptions) {
        return this.server.moduleGet(url, params, taskOptions);
    }

    /**
     * Invokes a custom module controller via a PUT request
     * @param {string} url
     * @param {object} params
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     */
    modulePut(url, data, taskOptions) {
        return this.server.modulePut(url, data, taskOptions);
    }

    /**
     * Invokes a custom module controller via a POST request
     * @param {string} url
     * @param {object} params
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     */
    modulePost(url, data, taskOptions) {
        return this.server.modulePost(url, data, taskOptions);
    }

    /**
     * Returns an object containing information for connecting to a Geoserver URL
     * @param  {layerDefinition} layerDef
     * @returns {object} An object containing the url and the authentication options
     */
    geoserverOptionsFromLayerDef(layerDef) {
        const layerOptions = this.options.geoserverUrls[layerDef.geoserverName];
        let url, auth;
        if (typeof layerOptions === 'string') {
            //pre 5.2 it was a string - note that old layer definitions file can still be present
            url = layerOptions;
            auth = null;
        } else if (typeof layerOptions === 'object') {
            url = layerOptions.url;
            auth = layerOptions.auth;
        } else {
            throw new URLNotDefinedError();
        }
        if (!auth) {
            auth = { type: CONNECTION_METHODS.NONE };
        }
        return { url, auth };
    }

    /**
     * Gets the fields required to be uses in custom style methods
     * @param {string[]} featureNames  Names of feature types included in request
     * @returns {object<string, string[]>} Keyed on name of feature type
     */
    async getRequiredFieldsToRender(featureNames) {
        // If there are properties required for styling, then include them in the request
        // fields required for styling are defined via customStyleFieldNames prop in feature models
        const featureDDs = await this.getDDInfoFor(featureNames);

        //cache (per feature type) of fields to fetch/include with render requests  - same as render fields excluding calculated fields
        if (!this._fetchFieldsCache) this._fetchFieldsCache = {};

        const fetchFields = {};
        for (const featureName of featureNames) {
            if (!this._fetchFieldsCache[featureName]) {
                const featureDD = featureDDs[featureName];

                //ENH: this code should go to a (still to be created) FeatureDD class
                //obtain from DD excluding calculated fields as these are not available on the server
                const renderFieldsSet = new Set(featureDD.renderFields);

                //add fields used in filters. These aren't always necessary, as server will exclude features not matching filter,
                // but become necessary when responses include features present in more than one (filtered) layer
                for (const filterName of featureDD.styleFilterNames ?? []) {
                    const filter = featureDD.filters[filterName];
                    const parser = new FilterParser(filter).parse();
                    for (const fieldName of parser.fieldNames()) {
                        renderFieldsSet.add(fieldName);
                    }
                }
                const renderFields = [...renderFieldsSet];
                this._fetchFieldsCache[featureName] = renderFields.filter(fieldName => {
                    const fieldDD = featureDD.fields[fieldName];
                    return fieldDD && !fieldDD.value;
                });
                if (renderFields.length > this._fetchFieldsCache[featureName].length) {
                    //there are calculated fields used in rendering
                    featureDDs[featureName].hasRenderCalculatedFields = true;
                }
            }
            const featureStyleFields = this._fetchFieldsCache[featureName];

            if (featureStyleFields.length) fetchFields[featureName] = featureStyleFields;
        }

        return fetchFields;
    }

    async getRenderRequestArgs(featureNames) {
        const requiredFields = await this.getRequiredFieldsToRender(featureNames);
        const args = {
            application: this.database.applicationName
        };

        const delta = this.delta;
        if (delta) args.delta = delta;

        const sVars = this.database.getSessionVars({ includeSystem: false });
        if (Object.keys(sVars).length) args.svars = sVars;

        if (Object.keys(requiredFields ?? {}).length) args.required_fields = requiredFields;

        return args;
    }

    /**
     * Returns the elements of 'delta'
     * @param {string} delta
     * @returns {object[]} Returns a list of features
     */
    async deltaFeatures(delta) {
        const response = await this.server.getDeltaFeatures(delta);

        return this.asFeatures(response);
    }

    /**
     * True if delta has conflicts
     * @param {string} delta
     * @return {boolean} Returns if delta has conflicts
     */
    async deltaHasConflicts(delta) {
        const conflictLists = await this.deltaConflicts(delta);
        return Object.keys(conflictLists).length > 0;
    }

    /**
     * Conflict info for 'delta'
     * @param {string}
     * @return {object[]} Returns a list of conflict objects
     */
    async deltaConflicts(delta) {
        const response = await this.server.getDeltaConflicts(delta);

        const conflictPromises = Object.entries(response.conflicts).map(
            async ([featureType, conflictItems]) => {
                return this._getConflictsFrom(featureType, Object.values(conflictItems));
            }
        );
        return (await Promise.all(conflictPromises)).flat();
    }

    /**
     * Build conflict objects from data returned by service
     * @param {object[]} conflicts
     * @param {featureTypeDef} featureType
     * @param {*} conflictItems ConflictItems is a list of conflict infos, keyed by feature ID
     */
    async _getConflictsFrom(featureType, conflictItems) {
        await this.getDDInfoFor([featureType]);
        return Promise.all(
            conflictItems.map(async conflictItem => {
                const deltaFeature = await this._asFeature(conflictItem.delta, featureType); // Can't use createDetachedFromJson() as discards myw metadata

                const masterFeature = (await conflictItem.master)
                    ? await this.createDetachedFromJson(featureType, conflictItem.master)
                    : null;
                const baseFeature = (await conflictItem.base)
                    ? await this.createDetachedFromJson(featureType, conflictItem.base)
                    : null;

                return new Conflict(
                    deltaFeature,
                    masterFeature,
                    baseFeature,
                    conflictItem.master_change,
                    conflictItem.master_fields,
                    conflictItem.delta_fields
                );
            })
        );
    }

    /**
     * Update and rebase the supplied features (which must come from the current delta)
     * @param {object[]} features
     */
    async deltaResolve(features) {
        // Build table of features, keyed by feature type
        // ENH: Support include myw properties in GeoJSON and remove need for this
        const featureLists = {};
        for (let feature of features) {
            const featureType = feature.getType();
            if (!(featureType in featureLists)) featureLists[featureType] = [];
            featureLists[featureType].push(feature.asGeoJson());
        }

        await this.server.resolveDelta(this.getDelta(), featureLists);
    }

    /**
     * Publish the elements of 'delta'
     * @param {string} delta
     * @returns {number} Returns total number of changes made
     */
    async deltaPromote(delta) {
        const response = await this.server.promoteDelta(delta);

        let nChanges = 0;
        Object.values(response.counts).forEach(count => (nChanges += count));

        return nChanges;
    }

    /**
     * Delete the elements of 'delta'
     * @param {string} delta
     * @returns {number} Returns total number of records deleted
     */
    async deltaDelete(delta) {
        const response = await this.server.deleteDelta(delta);

        let nChanges = 0;
        Object.values(response.counts).forEach(count => (nChanges += count));

        return nChanges;
    }

    /* ******************************** Auxiliary methods ****************************** 
    /**
     * Sets 'this.server' to be a database instance for the url specified in options. <br/>
     * Performs a login request with the parameters specified in options
     * @return {Promise}  Promise fulfilled when the database is instantiated and initialized
     * @protected
     */
    _getServer() {
        if (this.options.server) {
            //use existing server (tests)
            this.server = this.options.server;
        } else {
            //no server given, use same server as system (application page)
            this.server = this.system.server;
        }
        //set applicationName on server as it needed for some requests
        this.server.applicationName = this.database.applicationName;
        return this.server.initialized;
    }

    /**
     * Instantiates a layer for native app - local mode to display tiles to a certain zoom level and as vector after that
     * @param  {layerDefinition} layerDef
     * @return {HybridLayer} The instantiated layer
     * @private
     */
    _createNativeAppLayer(layerDef) {
        layerDef.jsClass = layerDef.nativeAppVector.jsClass;
        layerDef.extraOptions = layerDef.nativeAppVector.extraOptions;

        return this._createHybridLayer(
            layerDef,
            layerDef.nativeAppVector.fromScale,
            MywVectorLayer
        );
    }

    /**
     * Instantiates a layer to display tiles served by myWorld
     * @param  {layerDefinition} layerDef
     * @return {TileLayer}  The instantiated layer
     * @private
     */
    _createTileLayer(layerDef) {
        //convert 'maxTileZoom' option into 'maxNativeZoom' as this is what layers expect
        layerDef.options.maxNativeZoom = layerDef.maxTileZoom ?? layerDef.options.maxNativeZoom;

        const layerOptions = this._getTileLayerOptions(layerDef);
        const Layer = this._getLayerClassFor(layerDef, layerOptions.classPrototype);
        return new Layer(layerOptions);
    }

    _getTileLayerOptions(layerDef) {
        const { tileType } = layerDef;
        const isVectorTile = ['mvt', 'topojson'].includes(tileType);
        const { worldName, layerName, ...commonOptions } = layerDef.options;
        const layerPath = worldName || layerDef.layer;
        let url = `${myw.baseUrl}tile/${layerPath}/`;
        let classPrototype = myw.TileLayer;
        let format;
        const options = { url, format, ...commonOptions, classPrototype };

        if (isVectorTile) {
            Object.assign(options, {
                url: url + `{z}/{x}/{y}.${tileType}`,
                classPrototype: VectorTileLayer,
                format: tileType == 'mvt' ? new MVT() : new TopoJSON({ layerName })
            });
        }

        return this.server.getTileLayerOptions(layerDef, options);
    }

    /**
     * @param {layerDefinition} layerDef
     * @param {number} [vectorFromZoomLevel] defaults to layerDef.maxTileZoom + 1
     * @returns {HybridLayer}
     * @private
     */
    _createHybridLayer(layerDef, vectorFromZoomLevel, defaultVectorClass) {
        layerDef.isStatic = true; //Alternate/hybrid vector layers are always static
        vectorFromZoomLevel = vectorFromZoomLevel ?? layerDef.maxTileZoom + 1;
        if (layerDef.min_scale >= vectorFromZoomLevel) {
            //tiles will never be shown so just create a vector layer
            return this._createVectorLayer(layerDef, defaultVectorClass);
        }
        const options = {
            switchZoomLevel: vectorFromZoomLevel,
            zoomedInLayerFn: this._createVectorLayer.bind(this, layerDef, defaultVectorClass),
            zoomedOutLayerFn: this._createTileLayer.bind(this, layerDef)
        };
        const Layer = this._getLayerClassFor(layerDef, HybridLayer);

        return new Layer(options);
    }

    /**
     * Instantiates a layer to display features, rendered as vector, from a myWorld server
     * @param  {layerDefinition} layerDef
     * @return {MywVectorLayer}  The instantiated layer
     * @private
     */
    _createVectorLayer(layerDef, defaultClass = MywVectorSharedSourceLayer) {
        const options = {
            name: layerDef.name, //used for debugging
            isStatic: !!layerDef.isStatic,
            useImageCanvas: layerDef.useImageCanvas ?? true,
            featureTypes: layerDef.feature_types,
            ...layerDef.options
        };

        // shared source service doesn't support schema parameter - use older entrypoint/class
        if (options.schema === 'delta') defaultClass = MywVectorLayer;

        let Layer = this._getLayerClassFor(layerDef, defaultClass);

        return new Layer(this, options);
    }

    /**
     * Returns a "ghost" layer to drive a vector tile source which serves a group of vector layers
     * @param  {MywMap} map
     * @return {MywSharedVectorSource}  The instantiated layer
     * @private
     */
    getVectorSharedSource(map) {
        if (!this._sharedSource) this._sharedSource = new Map();
        if (!this._sharedSource.has(map)) {
            const worldId = map.worldId ?? 'geo';
            const options = {
                url: this.server.baseUrl + `render_features?${worldId}/{z}/{x}/{y}`, //tile coords are important (although repeated in body) as url is key for the tile cache
                tileSize: 512,
                maxTileZoom: 17
            };
            this._sharedSource.set(map, new MywSharedVectorSource(this, options));
        }
        return this._sharedSource.get(map);
    }

    /**
     * Instantiates a layer to display features, rendered via a geoserver server
     * @param  {layerDefinition} layerDef
     * @return {Promise<GeoserverLayer>}  The instantiated layer
     * @private
     */
    async _createGeoserverLayer(layerDef) {
        const { url, ...options } = await this._getGeoserverOptions(layerDef);
        if (this.options.combineGeoserverRequests) {
            const combinedLayer = this._getGeoserverCombinedLayer(url, options);
            return combinedLayer.createSubLayer(layerDef, options);
        }

        const Layer = this._getLayerClassFor(layerDef, GeoserverLayer);
        return new Layer(url, options);
    }

    async _getGeoserverOptions(layerDef) {
        const filters = await this._getFilters(layerDef.feature_types, layerDef.options.schema);
        //  If we have a geoserver layer or set of geoserver layers specified, check to see if we have features with filters specified
        //  If we have the same number of filters as the same number of specified layers, we will assume that we can apply the filters to the layers
        //  This works under the assumption that the specified order of the layers matches the specified order of the filters
        if (layerDef.geoserverLayer) {
            const specifiedLayers = layerDef.geoserverLayer.split(',');
            if (specifiedLayers.length === filters.length) {
                for (let i = 0; i < specifiedLayers.length; ++i) {
                    filters[i].layerName = specifiedLayers[i];
                }
            }
        }
        const prefix = layerDef.geoserverWorkspace
            ? `${layerDef.geoserverWorkspace}:`
            : layerDef.options.schema == 'delta'
            ? 'myworld_delta:'
            : '';
        const { url, auth } = this.geoserverOptionsFromLayerDef(layerDef);

        const geoserverLayer = layerDef.geoserverLayer;

        const ret = {
            filters,
            prefix,
            getActiveDelta: this.getDelta,
            transparent: layerDef.options.zIndex ? layerDef.options.zIndex >= 0 : true,
            format: 'image/png',
            getSessionVars: this.database.getSessionVars,
            applicationName: this.database.applicationName,
            ds: this,
            url,
            auth,
            ...layerDef.options
        };
        if (geoserverLayer) {
            ret.wmsLayerGroup = prefix + geoserverLayer;
        } else {
            ret.featureItems = layerDef.feature_types;
        }
        return ret;
    }

    //obtain parent layer to hold all of the grouped layers on
    _getGeoserverCombinedLayer(url, options) {
        //we need a combined layer per geoserver instance and we use the url as the key
        if (!this._combinedGeoserverLayer) this._combinedGeoserverLayer = {};
        if (!this._combinedGeoserverLayer[url]) {
            const geoserverCombinedLayerClass =
                evalAccessors(this.options.combineGeoserverJsClass) || GeoserverCombinedLayer;
            this._combinedGeoserverLayer[url] = new geoserverCombinedLayerClass(url, options);
        }
        return this._combinedGeoserverLayer[url];
    }

    /**
     * Gets Geoserver filter information
     * @param  {featureTypeDef[]} featureTypes Feature types information
     * @param  {string} [schema='data'] Data schema to look at in filter
     * @return {Promise<filterDef[]>} Returns array of objects (async)
     * @private
     */
    async _getFilters(featureTypes, schema = 'data') {
        const filterArray = featureTypes.filter(featureType => featureType.filter);
        if (filterArray.length !== 0 || schema == 'delta') {
            //Must compose filters only if filters exists on at least one feature or if schema is delta
            const featureDDs = await this.getDDInfoFor(
                filterArray.map(featureType => featureType.name)
            );
            const filters = featureTypes.map(featureType => {
                //Get filter information and compose
                const featureDD = featureDDs[featureType.name];
                const filter = featureDD?.filters?.[featureType.filter]; //Get filter from featureDD if filter exists
                return this._composeGeoserverFilterFor(featureType.name, filter, schema);
            });
            return filters;
        } else {
            return [];
        }
    }

    /**
     * Composes Geoserver filter object, with name and value
     * @param {string} featureName myWorld Feature name
     * @param {string} originalFilter myWorld featureDD filter
     * @param {string} schema data or delta - data by default
     * @returns {filterDef} Returns object with layerName and value
     */
    _composeGeoserverFilterFor(featureName, originalFilter, schema) {
        const activeDeltaFilter = '[myw_delta] <> {activeDelta}'; //Filters out active delta
        let filter = originalFilter;

        if (schema == 'delta') {
            //Must filter out active delta
            filter = filter ? `( ${originalFilter} ) & ${activeDeltaFilter}` : activeDeltaFilter;
        }

        return {
            layerName: featureName,
            value: filter
        };
    }

    /**
     * Register that a layer is using this datasource
     * @param  {layerDefinition} layerDef
     * @private
     */
    _registerLayer(layerDef) {
        //ENH: check if layerCodes is still used
        if (!this.layerCodes.includes(layerDef.code)) {
            this.layerCodes.push(layerDef.code);
            this.layerNames.push(layerDef.name);
        }

        //store the definition in case it's a dynamically added layer (non stored in configuration)
        this.layerDefs[layerDef.name] = layerDef;

        const layerFeatureTypes = layerDef.feature_types.map(f => f.name);
        this.featureTypes = [...new Set(this.featureTypes.concat(layerFeatureTypes))];
    }

    /**
     * add "features matching" suggestion if/where appropriate
     * @private
     */
    _addFeatureSearchSuggestion(searchText, limit, results) {
        //finding first feature suggestion
        const featureIndex = results.findIndex(sugg => sugg.data.type === 'feature');
        if (featureIndex >= 0) {
            const featureResults = results.slice(featureIndex);

            const //"features matching" suggestion to be added just before the first feature suggestion
                featureSearchSuggestion = {
                    label: searchText,
                    value: searchText,
                    type: 'feature_search'
                };

            if (featureResults.length === limit) {
                //Replace the last suggestion with a '...' suggestion
                featureResults.pop();
                const moreResultsSuggestion = {
                    label: '',
                    value: searchText,
                    type: 'feature_search'
                };
                results = results
                    .slice(0, featureIndex)
                    .concat(featureSearchSuggestion, featureResults, moreResultsSuggestion);
            } else if (featureResults.length > 1) {
                // just add the "features matching" suggestion
                results = results
                    .slice(0, featureIndex)
                    .concat(featureSearchSuggestion, featureResults);
            }
        }
        return results;
    }

    /**
     * Converts results from server into
     * @return {Array<autoCompleteResult>}
     * @private
     */
    async _parseSuggestions(results) {
        const to_return = [];
        for (let result of results) {
            const data = result.data,
                type = result.type || data.type;
            //results from server have 'type' inside 'data'. convert into a proper {autoCompleteResult}
            if (data?.type) delete data.type;
            result.type = type;
            //Set geometry_type on result
            let featureData;
            if (data?.feature_type) {
                //ENH: rewrite to get rid of linting warning
                // eslint-disable-next-line no-await-in-loop
                featureData = await this.getDDInfoFor([data.feature_type]);
                result.data.has_geometry = !!featureData[data.feature_type].geometry_type;
            }

            to_return.push(result);
        }
        return to_return;
    }

    /**
     * Obtains the features in a stored feature set field
     * @param  {Feature} feature
     * @param  {string} relationshipName Field name
     * @param  {object} aspects
     * @property  {boolean}        aspects.includeLobs
     * @property  {boolean}        aspects.includeGeoGeometry
     * @return {Promise<Array<Feature>>}
     */
    async _getReferenceSetRelationship(feature, relationshipName, aspects) {
        const urns = feature.properties[relationshipName] || [];

        // map each urn to the feature:
        // - external features must be requested one by one
        // - all the myWorld features can be requested in a single request and then
        //   features looked up by urn in the result. The request to myWorld is only
        //   if there is a myWorld urn in the list

        let myWorldRequest;
        const features = await Promise.all(
            urns.map(urn => {
                const dsName = this.database.getDatasourceNameForUrn(urn);
                if (this.getName() == dsName) {
                    if (!myWorldRequest) {
                        //execute myworld server relationship request, storing results in a hash by urn
                        myWorldRequest = this.server
                            .getRelationship(feature, relationshipName, aspects)
                            .then(this.asFeatures)
                            .then(features => indexBy(features, feature => feature.getUrn()));
                    }
                    return myWorldRequest.then(features => features[urn.split('?')[0]]);
                } else {
                    return this.database.getFeatureByUrn(urn);
                }
            })
        );
        return features.filter(Boolean); //filter out missing features
    }

    /**
     * Obtains the features in a calculated relationship
     * @param  {feature} feature
     * @param  {fieldDD} fieldDD
     * @param  {object} aspects
     * @property  {boolean}        aspects.includeLobs
     * @property  {boolean}        aspects.includeGeoGeometry
     * @return {Promise<Array<Feature>>}
     * @private
     */
    _getCalculatedRelationship(feature, fieldDD, aspects) {
        if (fieldDD.value.startsWith('select(')) {
            //query reference_set
            const relationshipName = fieldDD.internal_name;
            return this.server
                .getRelationship(feature, relationshipName, aspects)
                .then(this.asFeatures);
        } else if (fieldDD.value.startsWith('method(')) {
            //custom reference_set
            const methodName = fieldDD.value.slice(7).split(')')[0];

            if (typeof feature[methodName] !== 'function') {
                return Promise.reject(
                    new Error(
                        `Expected feature '${feature.getUrn()}'' to have method named '${methodName}'`
                    )
                );
            } else {
                return feature[methodName]().then(result => {
                    if (result instanceof Feature) return [result];
                    else return result;
                });
            }
        } else {
            return Promise.reject(
                new Error(`Unexpected value '${fieldDD.value}' for field: ${fieldDD.internal_name}`)
            );
        }
    }

    /**
     * Returns a list of myWorldFeatures from the provided list of json features
     * @param  {Object}     jsonResults         Objects obtained from parsing json results
     * @param  {boolean}    [complete=true]     Whether the data includes all 'simple' properties or not
     * @param  {boolean}    [lobs=false]        Whether the data includes all 'large object' properties or not
     * @return {Promise<Array<MyWorldFeature>>}
     * @private
     */
    asFeatures(jsonResults, complete, lobs) {
        const featuresData = jsonResults.features || [jsonResults]; // We may get a group of features back or we might get just one feature.
        const options = {
            complete: complete !== false, //default is true
            lobs: !!lobs //default is false
        };

        return this._asFeatures(featuresData, options).then(features => {
            features.offset = jsonResults.offset + 1; // server is 0 based
            features.totalCount = jsonResults.unlimited_count || Infinity;
            return features;
        });
    }

    /*
     * @param  {Object}     featuresData        Objects obtained from parsing json results
     * @param  {Object}     options             Options to be passed to feature model constructor
     * @return {Promise<Array<MyWorldFeature>>}
     * @private
     */
    async _asFeatures(featuresData, options) {
        //get list of different feature types
        const types = [...new Set(featuresData.map(featureData => featureData.myw.feature_type))];

        await this._ensureDDInfoFor(types);

        return featuresData.map(featureData => {
            const type = featureData.myw.feature_type;
            return this._asFeature(featureData, type, options);
        });
    }

    /**
     * @param  {json} jsonResults Result of trace service request
     * @return {Promise<TraceResult>}
     */
    async asTraceResult(jsonResults) {
        const jsonFeatures = Object.values(jsonResults.features || {});
        await myw.geometry.init(); // TraceResult may need to perform geometry operations
        const features = await this._asFeatures(jsonFeatures, true, false);
        return new TraceResult(
            jsonResults.nodes,
            features,
            jsonResults.metadata,
            jsonResults.metadata_unit_scales
        );
    }

    /**
     * Converts properties for an insert/update into a standard format
     * In particular it converts date fields to a standardized string format
     * @param  {string}     featureType
     * @param  {boolean}    generators  Whether to populate values for fields with (client-side) generators
     * @param  {Object}     data
     * @return {Object}           [description]
     * @private
     */
    async _prepareValues(featureType, generators, data) {
        const featuresDD = await this.getDDInfoFor([featureType]);
        const featureDD = featuresDD[featureType];

        this._convertValues(featureDD, data);

        //populate geometry world name fields from world_names in geometry
        if (featureDD.fields.myw_geometry_world_name && data.geometry) {
            data.properties.myw_geometry_world_name = data.geometry.world_name || 'geo';
        }
        for (let [fieldName, geom] of Object.entries(data.secondary_geometries || {})) {
            const fieldDD = featureDD.fields[fieldName];
            const gwnFieldName = `myw_gwn_${fieldName}`;
            if (geom && fieldDD && featureDD.fields[gwnFieldName])
                data.properties[gwnFieldName] = geom.world_name || 'geo';
        }

        if (generators) this._populateGeneratorFields(featureDD, data.properties);

        return data;
    }

    /**
     * Converts properties for a bulk-update into a standard format
     * In particular it converts date fields to a standardized string format
     * @param  {string}     features
     * @param  {Object}     properties
     * @return {Object}     updated properties (same object as input.)
     * @private
     */
    async _prepareBulkValues(features, properties) {
        const featureTypes = [...new Set(features.map(f => f.type))];
        const featuresDD = await this.getDDInfoFor(featureTypes);

        const firstType = featureTypes[0];
        const firstDD = featuresDD[firstType];
        const propertyTypes = Object.keys(properties).reduce((obj, prop) => {
            obj[prop] = firstDD.fields[prop].baseType;
            return obj;
        }, {});

        // We don't allow bulk-updating of geom fields.
        const geomFields = Object.keys(propertyTypes).filter(
            prop => propertyTypes[prop] == 'geometry'
        );
        if (geomFields.length > 0) {
            const fieldNames = geomFields.join(',');
            throw Error(`Cannot bulk-update geometry field (${firstType}.${fieldNames})`);
        }

        // Use the first
        const data = { properties };
        this._convertValues(firstDD, data);

        // And then verify that all the others match (for the subset of fields specified.)
        for (const featureType of featureTypes.slice(1)) {
            // If any types different from propertyTypes, throw.
            const featureDD = featuresDD[featureType];
            const otherPropertyTypes = Object.keys(properties).reduce((obj, prop) => {
                obj[prop] = featureDD.fields[prop].baseType;
                return obj;
            }, {});
            for (let prop in propertyTypes) {
                if (propertyTypes[prop] != otherPropertyTypes[prop]) {
                    const firstFieldSpec = `${firstType}.${prop}:${propertyTypes[prop]}`;
                    const otherFieldSpec = `${featureType}.${prop}:${otherPropertyTypes[prop]}`;
                    throw Error(
                        'Cannot bulk-update fields with same name and different types.\n' +
                            `(${firstFieldSpec} and ${otherFieldSpec})`
                    );
                }
            }
        }

        return properties;
    }

    /**
     * Converts properties for an insert/update into a standard format
     * In particular it converts date fields to a standardized string format
     * @param  {featureDD} featureDD
     * @param  {Object} data
     * @return {Object} The modified 'data' object
     * @private
     */
    _convertValues(featureDD, data) {
        for (const [key, value] of Object.entries(data.properties)) {
            const fieldDD = featureDD.fields[key];
            const fieldType = fieldDD?.type;

            if (fieldDD?.value) {
                //exclude calculated fields from data to send
                delete data.properties[key];
            } else if (fieldType == 'date' && value instanceof Date) {
                data.properties[key] = value.toISOString().slice(0, 10);
            } else if (fieldType == 'timestamp' && value instanceof Date) {
                data.properties[key] = value.toISOString().slice(0, -1); //removes 'Z' from the end
            }
        }

        return data;
    }

    /**
     * Converts properties for an insert/update into a standard format
     * In particular it converts date fields to a standardized string format
     * @param  {featureDD}  featureDD
     * @param  {Object}     properties
     * @return {Object}     The modified 'properties' object
     * @private
     */
    _populateGeneratorFields(featureDD, properties) {
        for (const [key, fieldDD] of Object.entries(featureDD.fields)) {
            if (fieldDD.generator == 'application') {
                properties[key] = this.database.applicationName;
            } else if (fieldDD.generator == 'user') {
                properties[key] = myw.currentUser.username;
            }
        }
        return properties;
    }

    /**
     * Returns current delta
     * @return {string} current delta
     */
    getDelta() {
        return this.delta;
    }
}

myw.datasourceTypes['myworld'] = MyWorldDatasource;

/**
 * Options for {@link MyWorldDatasource}
 * @typedef myWorldDatasourceOptions
 * @property {number}  maxSuggestionsPerType              Max number of results per suggestion type. May still be truncated by the search UI configuration
 * @property {Object<string, string>}   geoserverUrls
 * @property {string}    [username]                         If provided, basic authentication credentials will be sent with requests. When using IE browsers, basic authentication requires jsonp to be disabled
 * @property {string}    [password]                         Required if username is provided
 */

/**
 * Filter Def object with params
 * @typedef filterDef
 * @property {string}    layerName     Name of feature to be passed as geoserver layer
 * @property {string}    value         myw featureDD filter
 */

MyWorldDatasource.extensions = {};

export default MyWorldDatasource;
