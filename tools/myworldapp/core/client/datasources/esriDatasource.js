// Copyright: IQGeo Limited 2010-2023
import { groupBy, has, indexBy } from 'underscore';
import myw from 'myWorld/base/core';
import config from 'myWorld/base/config';
import { trace } from 'myWorld/base/trace';
import { latLng } from 'myWorld/base/latLng.js';
import { processOptionsFromJson } from 'myWorld/base/util.js';
import { MissingFeatureDD, AuthenticationError } from 'myWorld/base/errors';
import { Datasource } from './datasource';
import { EsriFeature } from 'myWorld/features/esriFeature';
import { EsriLayer } from 'myWorld/layers/esriLayer';
import { EsriFeatureServerLayer } from 'myWorld/layers/esriFeatureServerLayer';
import EsriQuery from './esriQuery';

const esriLayerClasses = {
    MapServer: EsriLayer,
    FeatureServer: EsriFeatureServerLayer
};

export class EsriDatasource extends Datasource {
    static supportsFeatureDefs = true;
    static supportsImportFeatureDefs = true;
    static {
        this.prototype.defaultFeatureModel = EsriFeature;

        this.mergeOptions({
            esriServerType: 'MapServer',
            requestTimeout: 8000,
            url: null,
            verifySsl: true,
            authType: 'token',

            //search related options
            fullQuery: false,
            inWindowQuery: true,
            inSelectionQuery: true
        });
    }

    static layerDefFields = [
        {
            name: 'esriMap',
            type: 'string',
            enumerator: 'datasource.mapNames',
            default: values => (values.length && values[0]) || '',
            viewClass: 'EnumAndTestView',
            args: { testMethod: 'testLayerURL' },
            onChange: 'rebuildForm'
        },
        { name: 'jsClass', type: 'string' },
        {
            name: 'extraOptions',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value', valType: 'json' }
        }
    ];

    static specFields = [
        {
            name: 'url',
            type: 'string',
            size: 'long',
            viewClass: 'UrlInputAndTestView',
            args: { testMethod: 'testURL' }
        },
        {
            name: 'esriServerType',
            type: 'string',
            enumerator: ['MapServer', 'FeatureServer'],
            default: 'MapServer'
        },
        { name: 'verifySsl', type: 'boolean', default: true },
        { name: 'username', type: 'string' },
        { name: 'password', type: 'string' },
        { name: 'authType', type: 'string', enumerator: ['token', 'ntlm'], default: 'token' }
    ];

    static geomFieldsFilter(layerDef) {
        return fieldDefs =>
            fieldDefs.filter(fieldDef =>
                fieldDef.table_name?.includes(layerDef.spec.esriMap + ':')
            );
    }

    /**
     * @class Provides access to ESRI services
     * @constructs
     * @augments Datasource
     * @augments IDatasource
     */
    constructor(database, options) {
        super(database, options);

        this.layers = {};
        this.maps = {}; //featureDDs grouped by map name

        //set the featureDD.name (aka featureType) property
        //and build this.maps
        Object.entries(this.featuresDD).forEach(([key, featureInfo]) => {
            const mapName = this._mapNameFor(key);
            featureInfo.name = key;
            if (!this.maps[mapName]) this.maps[mapName] = {};
            this.maps[mapName][key] = featureInfo;
        });

        //initialization
        this.initialized = Promise.resolve(this);
    }

    /**
     * Obtain details about fields necessary to perform a login request
     * @return {Promise}
     */
    async getAuthOptions() {
        return {
            auth_fields: [
                {
                    id: 'username',
                    label: 'username',
                    type: 'string'
                },
                {
                    id: 'password',
                    label: 'password',
                    type: 'password'
                }
            ]
        };
    }

    /**
     * Returns the credentials to use for the login request
     * Returns true if it needs credentials by user
     * Returns false if login is not necessary
     * @return {object|boolean}  Keyed on field name
     */
    getLoginCredentials() {
        if (this.options.username)
            return {
                username: this.options.username,
                password: this.options.password
            };
        else return false;
    }

    /**
     * Logs in to the datasource
     * @param  {object} credentials
     * @return {Promise}
     */
    async login(credentials) {
        if (this.options.authType == 'token') {
            let url = this.options.url.split('/rest/')[0];
            url += '/tokens/generateToken';

            try {
                const result = await new EsriQuery(url, this.options.requestTimeout).authenticate(
                    credentials
                );
                this.token = result.token;
                //layers may have been created at this point (when being called by login dialog)
                //authenticate layers
                this.layers.forEach(layer => {
                    layer.authenticate(result.token);
                });
            } catch (errorDetails) {
                trace('esri', 1, 'Authentication error', errorDetails);
                throw new AuthenticationError(errorDetails.message);
            }
        } else if (this.options.authType == 'ntlm') {
            // Do nothing (handled automatically by browser)
            return;
        } else {
            const msg = 'Unknown authorization type: ' + this.options.authType;
            trace('esri', 1, msg);
            throw new AuthenticationError(msg);
        }
    }

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {ILayer} An esri layer instance
     */
    createLayer(layerDef) {
        const { name, options = {} } = layerDef;
        const layerDefFixedOptions = processOptionsFromJson(layerDef.extraOptions);
        Object.assign(options, layerDefFixedOptions);

        const layer = this._createLayer(layerDef);
        layer.on('load', ev => {
            this.system.recordDataAccess(this.database.applicationName, `layer.${name}`);
        });

        //store the definition in case it's a dynamically added layer (non stored in configuration)
        this.layerDefs[name] = layerDef;
        this.layers[name] = layer;

        layer.on('authenticationrequired', () => {
            if (this.token) {
                //meanwhile login has succeeded and we have a token
                layer.authenticate(this.token);
            } else {
                layer.fire('invalid');
            }
        });

        return layer;
    }

    _createLayer(layerDef) {
        const url = this._getUrl(layerDef);

        const options = Object.assign(
            {
                url: url,
                token: this.token
            },
            layerDef.options
        );

        const mapType = this.options.esriServerType;

        const Layer = this._getLayerClassFor(layerDef, esriLayerClasses[mapType]);
        const newLayer = new Layer(options, this.featuresDD, layerDef);
        newLayer.setGetLayerIDsMethod(this._getIdsForLayer.bind(this, layerDef));
        return newLayer;
    }

    /**
     * Finds the features selectable by a user map click
     * @param  {LatLng}   selectionGeom  Geometry the user created when clicked or when dragged
     * @param  {number}   zoomLevel       Zoom level at time of selection
     * @param  {number}   pixelTolerance  Number of pixels to use as tolerance for the selection
     * @param  {Array<Layer>}   layers  Layers relevant for selection (active and visible)
     * @return {Promise<Array<Feature>>}  Promise for the features
     */
    async select(selectionGeom, zoomLevel, pixelTolerance, layers) {
        const esriMaps = [...new Set(layers.map(layer => layer.layerDef.esriMap))];
        const map = layers[0].map; //get the map the selection is made on

        const results = await Promise.all(
            esriMaps.map(async esriMapName => {
                const esriLayerIds = this._getIdsForMapName(layers, esriMapName, zoomLevel);
                const esriLayers = this._getLayersForMapName(layers, esriMapName);

                try {
                    return await this._selectEsriLayerId(
                        esriMapName,
                        esriLayerIds,
                        selectionGeom,
                        zoomLevel,
                        pixelTolerance,
                        map,
                        esriLayers[0]
                    );
                } catch (reason) {
                    console.log(
                        `Datasource '${this.options.name}' selection for '${esriMapName}' failed.`,
                        reason
                    );
                    throw reason;
                }
            })
        );

        return this._flattenResults(results);
    }

    /**
     * Handles user selecting via a box
     * @param  {LatLngBounds} bounds          Bounds to select inside of
     * @param {int} zoomLevel Map zoom level
     * @param {Array<Layer>} layers Layers relevant for selection (active and visible)
     */
    async selectBox(bounds, zoomLevel, layers) {
        //needs a request per esri map and feature type (queries don't take multiple feature types and identify doesn't take a bbox)
        const results = await Promise.all(
            layers.map(layer => {
                const esriMapName = layer.layerDef.esriMap;
                const esriLayerIds = this._getIdsForMapName(layers, esriMapName, zoomLevel);

                return Promise.all(
                    layer.layerDef.feature_types.map(async layerFeatureItem => {
                        try {
                            return await this._boxSelectEsriLayerId(
                                esriMapName,
                                esriLayerIds,
                                layerFeatureItem,
                                bounds,
                                layer
                            );
                        } catch (reason) {
                            console.log(
                                `Datasource '${this.options.name}': box selection for '${esriMapName}' failed.`,
                                reason
                            );
                            throw reason;
                        }
                    })
                );
            })
        );
        return this._flattenResults(results);
    }

    /**
     * Sends box select query to server
     * @param  {string}          esriMapName     Identifier for the Esri map/service
     * @param  {object}          layerFeatureItem    Esri LayerIds to select on. Each layerId referes to a featureType
     * @param  {LatLngBounds} bounds          Bounds to select inside of
     */
    async _boxSelectEsriLayerId(esriMapName, esriLayerIds, layerFeatureItem, bounds, layer) {
        const serverType = this.options.esriServerType;

        //Create query and send to runner
        const featureDD = this.featuresDD[layerFeatureItem.name];
        if (!esriLayerIds.includes(featureDD.layerId)) return;

        switch (serverType) {
            case 'MapServer': {
                const url = this._getUrl(esriMapName, featureDD);
                const [featureCollection, response] = await new EsriQuery(
                    url,
                    this.options.requestTimeout,
                    this.token
                ).getObjectsInBounds(bounds);
                return this._processResults(
                    esriMapName,
                    layerFeatureItem,
                    featureCollection,
                    response
                );
            }

            case 'FeatureServer': {
                const featureCollection = layer.maplibLayer.getFeatureCollectionInBounds(
                    bounds,
                    featureDD.layerId
                );
                return this._processResultsFeatures(esriMapName, featureCollection, layer);
            }
        }
    }

    /**
     * Finds the features selectable by a user map click
     * @param  {string}          esriMapName     Identifier for the Esri map/service
     * @param  {Array}           esriLayerIds    Esri LayerIds to select on. Each layerId referes to a featureType
     * @param  {LatLng}        selectionPoint  Point the user clicked/selected
     * @param  {number}        zoomLevel       Zoom level at time of selection
     * @param  {number}        pixelTolerance  Number of pixels to use as tolerance for the selection,
     * @param  {string}          esriMapName     Identifier for the Esri map/service
     * @param  {MapControl}  map             Map that triggered the selection
     * @return {Promise<Array<Feature>>}     Promise for the features
     * @private
     */
    async _selectEsriLayerId(
        esriMapName,
        esriLayerIds,
        selectionPoint,
        zoomLevel,
        pixelTolerance,
        map,
        layer
    ) {
        const serverType = this.options.esriServerType;
        if (!esriLayerIds) esriLayerIds = [];
        else if (esriLayerIds.length == 0) return [];

        const ll = latLng(selectionPoint.lat, selectionPoint.lng);

        switch (serverType) {
            case 'MapServer': {
                const url = this._getUrl(esriMapName);
                const [featureCollection, response] = await new EsriQuery(
                    url,
                    this.options.requestTimeout,
                    this.token
                ).getObjectsAtPoint(map, ll, esriLayerIds, pixelTolerance);
                return this._processResults(esriMapName, null, featureCollection, response);
            }

            case 'FeatureServer': {
                const featureCollection = layer.maplibLayer.getFeatureCollectionAtLatLng(
                    ll,
                    pixelTolerance,
                    esriLayerIds
                );
                return this._processResultsFeatures(esriMapName, featureCollection, layer);
            }

            default:
                return [];
        }
    }

    /**
     * Sends an external search request
     * @param  {string}         searchTerm      Text to search for
     * @param  {searchOptions}  [options]       Options to influence the search
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    async runSearch(searchTerm, options) {
        const querySuggestions = this._querySuggestions(searchTerm, this.featuresDD);

        if (querySuggestions.length) {
            return querySuggestions;
        } else {
            //no queries matched, search for individual features
            const searchDetails = this._getSearchDetailsFor(searchTerm, this.featuresDD);
            const featureTypes = Object.entries(searchDetails);
            const results = await Promise.all(
                featureTypes.map(([featureTypeName, searchDetail]) => {
                    if (searchDetail.extraTerms) {
                        return this._searchFeatureTypeForTerm(
                            featureTypeName,
                            searchDetail.extraTerms
                        );
                    }
                })
            );

            return this._flattenResults(results);
        }
    }

    /**
     * Sends an external search request
     * @param  {string} featureTypeName
     * @param  {string} terms  Text to search for
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     * @private
     */
    async _searchFeatureTypeForTerm(featureTypeName, terms) {
        const featureDD = this.featuresDD[featureTypeName];
        const searchFieldNames = featureDD.search_fields;
        if (!searchFieldNames || !searchFieldNames.length) return;

        const layerIds = [featureDD.layerId];
        const esriMapName = this._mapNameFor(featureTypeName);
        const url = this._getUrl(esriMapName);

        const [featureCollection, response] = await new EsriQuery(
            url,
            this.options.requestTimeout,
            this.token
        ).findObjects(terms, layerIds, searchFieldNames);
        const features = await this._processResults(
            esriMapName,
            featureDD,
            featureCollection,
            response
        );
        return this._handleSearchResult(features);
    }

    /**
     * Handles external search results by returning feature Autocomplete suggestions
     * @param  {Array<Feature>} features
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     * @private
     */
    _handleSearchResult(features) {
        return features.map(feature => {
            const title = feature.getTitle();

            return {
                label: title,
                value: title,
                type: 'feature',
                data: {
                    urn: feature.getUrn()
                }
            };
        });
    }

    /**
     * Sends a query request
     * @param  {object}             queryDef   As returned by runSearch()
     * @param  {queryOptions}     [options]
     * @return {Promise<array<EsriFeature>>} Promise for a list of features
     */
    //ENH: make a call to getFeatures() which will take care of creating queries
    async runQuery(queryDef, options) {
        const featureTypeName = queryDef.feature_type,
            esriMapName = this._mapNameFor(featureTypeName),
            featuresDD = this.maps[esriMapName],
            featureDD = featuresDD[featureTypeName],
            url = this._getUrl(esriMapName, featureDD);

        const limit = config['core.queryResultLimit'];
        const clauses = queryDef.clauses || null;
        const intersect = options.polygon || options.bounds || null;

        const [featureCollection, response] = await new EsriQuery(
            url,
            this.options.requestTimeout,
            this.token
        ).getObjectsByQuery(intersect, clauses, limit);
        return this._processResults(esriMapName, featureDD, featureCollection, response);
    }

    /**
     * Obtains a feature
     * @param  {string}     featureType
     * @param  {number}   featureId
     * @return {EsriFeature}
     */
    async getFeature(featureType, featureId) {
        const serverType = this.options.esriServerType;
        const esriMapName = this._mapNameFor(featureType);
        const featureTypeInfo = this.featuresDD[featureType];

        switch (serverType) {
            case 'MapServer': {
                const url = this._getUrl(esriMapName, featureTypeInfo);

                const [featureCollection, response] = await new EsriQuery(
                    url,
                    this.options.requestTimeout,
                    this.token
                ).getObject(featureId);
                const features = await this._processResults(
                    esriMapName,
                    featureTypeInfo,
                    featureCollection,
                    response
                );
                return features[0];
            }

            case 'FeatureServer': {
                let layer = null;
                for (let layerDef of this.layerDefs) {
                    if (layerDef.esriMap == esriMapName) {
                        const layerID = layerDef.id;
                        layer = this.layers[layerID];
                        break;
                    }
                }
                const feature = layer.getFeatureById(featureTypeInfo.layerId, featureId);
                return this._processResultFeature(esriMapName, feature);
            }
        }
    }

    /**
     * Get features of a given table optionally constrained by bounding box
     * @param  {string}             featureType
     * @param  {queryParameters}    [options]       Filters to apply. 'filter' and 'includeTotal' options are not supported
     * @return {Promise<Array<Feature>>}    Promise to resolve with a list of the matched features
     */
    async getFeatures(featureType, options) {
        options = options || {};

        const bounds = options.geom || options.bounds || null;
        const clauses = options.clauses || null;
        const limit = options.limit;
        const offset = options.offset || 0;
        const orderBy = options.orderBy;

        const featureTypeInfo = this.options.featureTypes[featureType];
        const esriMapName = this._mapNameFor(featureType);
        const url = this._getUrl(esriMapName, featureTypeInfo);

        const [featureCollection, response] = await new EsriQuery(
            url,
            this.options.requestTimeout,
            this.token
        ).getFeatures(bounds, clauses, limit, offset, orderBy);
        return this._processResults(esriMapName, featureTypeInfo, featureCollection, response);
    }

    /**
     * Count features of a given table optionally constrained by bounding box
     * @param  {string}             featureType
     * @param  {queryParameters}    [options]       Filters to apply to query. 'filter' and 'includeTotal' options are not supported
     * @return {Promise<number>}    Promise to resolve with a number of the matched features
     */
    countFeatures(featureType, options) {
        options = options || {};

        const bounds = options.geom || options.bounds || null;
        const clauses = options.clauses || null;
        const featureTypeInfo = this.options.featureTypes[featureType];
        const esriMapName = this._mapNameFor(featureType);
        const url = this._getUrl(esriMapName, featureTypeInfo);

        return new EsriQuery(url, this.options.requestTimeout, this.token).getObjectCount(
            bounds,
            clauses
        );
    }

    /**
     * Obtain the features within distance of a point
     * @param  {string}     featureType
     * @param  {LatLng}   point
     * @param  {number}   radius
     * @return {EsriFeature}
     */
    async getNearby(featureType, latlng, radius) {
        //ENH: rename to match getFeaturesAround.
        const esriMapName = this._mapNameFor(featureType);

        const featureTypeInfo = this.options.featureTypes[featureType];
        const url = this._getUrl(esriMapName, featureTypeInfo);

        const [featureCollection, response] = await new EsriQuery(
            url,
            this.options.requestTimeout,
            this.token
        ).getObjectsNearPoint(latlng, radius);
        return this._processResults(esriMapName, featureTypeInfo, featureCollection, response);
    }

    /**
     * Obtains legend information for a given Esri map
     * @param  {layerDefinition} layerDefOrEsriMapName
     * @return {object}
     */
    getLegendInfo(layerDefOrEsriMapName) {
        const url = this._getUrl(layerDefOrEsriMapName);
        return new EsriQuery(url, this.options.requestTimeout, this.token).getLegend();
    }

    /**
     * Returns the map name for a given feature type
     * @param  {string} featureType
     * @return {string}
     * @private
     */
    _mapNameFor(featureType) {
        //the map name is the featureType excluding the last component
        return featureType.split(':').slice(0, -1).join(':');
    }

    /**
     * Returns the service url for a given layer and (optionally) a feature type
     * @param  {layerDefinition|string} layerDefOrEsriMapName
     * @param  {featureInfo}       [featureInfo]
     * @return {string}
     * @private
     */
    _getUrl(layerDefOrEsriMapName, featureInfo) {
        let url = this.options.url;
        if (url.slice(-1) === '/') url = url.slice(0, -1); //Remove trailing '/'
        let urlParts = url.split('/');
        let esriMapName;

        if (layerDefOrEsriMapName) {
            if (typeof layerDefOrEsriMapName == 'string') {
                esriMapName = layerDefOrEsriMapName;
            } else {
                //layerDef
                esriMapName = layerDefOrEsriMapName.esriMap;
            }

            //Add path to map (handling folder-specific base_url)
            const mapNameParts = esriMapName.split(':');
            const lastUrlPart = urlParts[urlParts.length - 1];
            if (lastUrlPart == mapNameParts[0]) {
                mapNameParts.splice(0, 1);
            }
            urlParts = urlParts.concat(mapNameParts);

            urlParts.push(this.options.esriServerType);

            if (featureInfo) urlParts.push(featureInfo.layerId);
        }

        return urlParts.join('/');
    }

    /**
     * Processes an Esri task result into instances of EsriFeature
     * @param  {string}     esriMapName     Identifier for the Esri map/service
     * @param  {featureInfo}  featureInfo   Feature type details
     * @param  {object}     featureCollection
     * @param  {object}      response
     * @return {Array<EsriFeature>}
     * @private
     */
    _processResults(esriMapName, featureInfo, featureCollection, response) {
        const features = [];
        let types;

        const indexedFeatures = indexBy(featureCollection.features, 'id');
        let collection = null;

        if (!featureCollection) return [];

        if (!featureInfo) {
            //we don't know which feature type the results are (select or search requests)
            //the response includes this information per feature
            //get list of different feature types
            types = [
                ...new Set(
                    response.results.map(this._getFeatureTypeFromResult.bind(this, esriMapName))
                )
            ];
        } else {
            types = [featureInfo.name];
        }

        return this._ensureDDInfoFor(types)
            .catch(reason => {
                if (reason instanceof MissingFeatureDD) {
                    //can happen for private layers and out of sync DD
                    //continue and use data to deduce fields information
                    return;
                }
            })
            .then(() => {
                if (response.results) {
                    collection = featureCollection;
                } else {
                    //response has the results in correct order
                    //further down we'll get the actual feature data from indexedFeatures
                    collection = response;
                }

                Object.entries(collection.features).forEach(([index, featureData]) => {
                    //ENH: refactor out
                    const result = response.results && response.results[index];
                    let featureType =
                        featureInfo?.name || this._getFeatureTypeFromResult(esriMapName, result);
                    const featureDD = this.featuresDD[featureType];

                    if (!response.results) {
                        //featureData isn't in the right format, so we need to find the corresponding element
                        //in featureCollection/indexedFeatures
                        const keyName = featureDD.key_name;
                        const key = featureData.attributes[keyName];
                        featureData = indexedFeatures[key];
                    }
                    const props = featureData.properties;

                    if (!featureDD && response.results) {
                        //the esriMap definition doesn't include details for this feature type.
                        //Use information in the response
                        featureType = esriMapName + ':' + result.layerName;
                        featureData.displayFieldName =
                            result?.displayFieldName || response.displayFieldName;
                    }

                    //some requests return the aliased/external field names as the attribute name
                    if (featureDD?.aliases) {
                        //add an entry for the internal name so our dd can find the value
                        Object.entries(featureDD.aliases).forEach(([fieldName, alias]) => {
                            if (!has(props, fieldName)) props[fieldName] = props[alias];
                        });
                        if (!featureData.id)
                            featureData.id = featureData.properties[featureDD.key_name];
                    }

                    const esriFeature = this._asFeature(featureData, featureType, true, true);
                    esriFeature.esriMapName = esriMapName;
                    features.push(esriFeature);
                });

                if (response.exceededTransferLimit) features.totalCount = 'Infinity'; //totalcount is used by the resultListControl
                return features;
            });
    }

    _processResultsFeatures(esriMapName, featureCollection, layer) {
        let types = layer.layerDef.feature_types.map(type => type.name);

        if (!featureCollection) return [];

        return this._ensureDDInfoFor(types)
            .catch(reason => {
                if (reason instanceof MissingFeatureDD) {
                    //can happen for private layers and out of sync DD
                    //continue and use data to deduce fields information
                    return;
                }
            })
            .then(() =>
                featureCollection.features.map(this._processResultFeature.bind(this, esriMapName))
            );
    }

    _processResultFeature(esriMapName, featureData) {
        let featureDD = null;
        let featureType = null;
        for (let [featuresDDName, dd] of Object.entries(this.featuresDD)) {
            if (featuresDDName.startsWith(esriMapName) && dd.layerId == featureData.esriLayerID) {
                featureDD = dd;
                featureType = featuresDDName;
                break;
            }
        }
        const props = featureData.properties;

        //some requests return the aliased/external field names as the attribute name
        if (featureDD.aliases) {
            //add an entry for the internal name so our dd can find the value
            Object.entries(featureDD.aliases).forEach(([fieldName, alias]) => {
                if (!has(props, fieldName)) props[fieldName] = props[alias];
            });
            if (!featureData.id) featureData.id = featureData.properties[featureDD.key_name];
        }

        const esriFeature = this._asFeature(featureData, featureType, true, true);
        esriFeature.esriMapName = esriMapName;
        return esriFeature;
    }

    /**
     * Obtains the feature type of an item in a service response
     * @param  {string} esriMapName
     * @param  {object} result
     * @return {string}
     * @private
     */
    _getFeatureTypeFromResult(esriMapName, result) {
        const mapDef = this.maps[esriMapName];
        let featureType;

        if (result.layerName) {
            featureType = esriMapName + ':' + result.layerName;
        } else {
            //some services don't include layerName but include layerId
            featureType = Object.entries(mapDef).find(
                ([key, e]) => e.name.startsWith(esriMapName) && e.layerId == result.layerId
            )?.[0];
        }
        return featureType;
    }

    /**
     * Obtains the esri layer ids for the feature types associated with the given esri map name
     * @param  {layerDef[]} layers
     * @param  {string} esriMapName
     * @param  {number}[zoomLevel] Restrict results to features selectable for [zoomLevel]
     * @return {Array<number>}
     * @private
     */
    _getIdsForMapName(layers, esriMapName, zoomLevel, forSelect = true) {
        const mapLayers = this._getLayersForMapName(layers, esriMapName);
        //Create a list of unique esrilayerIds because we want only one request per featureType
        //esriLayerId refers to a featureType
        const esriLayerIds = [
            ...new Set(
                mapLayers
                    .map(layer => this._getIdsForLayer(layer.layerDef, zoomLevel, forSelect))
                    .filter(Boolean)
                    .flat()
            )
        ];

        return esriLayerIds.length ? esriLayerIds : undefined;
    }

    _getLayersForMapName(layers, esriMapName) {
        const layersPerEsriMap = groupBy(layers, layer => layer.layerDef.esriMap);
        return layersPerEsriMap[esriMapName];
    }

    /**
     * Obtains the esri layer ids for the feature types associated with the given layer
     * @param  {layerDef} layerDef
     * @param  {number}[zoomLevel] Restrict results to features selectable for [zoomLevel]
     * @return {Array<number>}
     * @private
     */
    _getIdsForLayer(layerDef, zoomLevel, forSelect) {
        let featureTypes = layerDef.feature_types;
        if (!featureTypes) return;

        if (forSelect) {
            featureTypes = featureTypes.filter(lfi => {
                if (!zoomLevel) return true;
                return zoomLevel >= lfi.min_select && zoomLevel <= lfi.max_select;
            });
        }

        return featureTypes
            .filter(featureItem => {
                if (!zoomLevel) return true;
                if (!featureItem.min_vis && !featureItem.max_vis) return true;

                const withinMinRange = zoomLevel >= featureItem.min_vis;
                const withinMaxRange = zoomLevel <= featureItem.max_vis;

                if (featureItem.min_vis && featureItem.max_vis)
                    return withinMinRange && withinMaxRange;
                if (featureItem.min_vis) return withinMinRange;
                if (featureItem.max_vis) return withinMaxRange;

                return false;
            })
            .map(lfi => this.featuresDD[lfi.name].layerId);
    }

    _flattenResults(results) {
        return results.flat(5).filter(Boolean);
    }

    /**
     * Tests the URL for the datasource
     * @param  {string} url URL to test
     * @return {Promise}    When resolved returns the metadata returned by the service.
     * @private
     */
    async test(url) {
        await this.initialized;
        try {
            const res = await new EsriQuery(url).getServerMetadata();
            return res;
        } catch (error) {
            if (url.length === 0) throw new Error('Please enter a URL');
            if (error.code === 499) throw new Error(error.message);
            else throw new Error(error.message);
        }
    }

    /**
     * Returns the url to test the layer def
     * @param  {layerDefinition} layerDef
     * @return {string}
     * @private
     */
    getLayerURL(layerDef) {
        layerDef.esriMap = layerDef.spec.esriMap;
        // set the feature_types just to be able to run the test
        if (!layerDef.feature_types?.length) {
            layerDef.feature_types = [{ name: Object.keys(this.featuresDD)[0] }];
        }
        return decodeURI(this.createLayer(layerDef, true).get('url'));
    }

    /**
     * Tests the datasource url for the layers config page
     * @param  {string} url        URL to test
     * @return {Promise}           When resolved returns an object with a success boolean and a message to alert the user of the success or failure of the test
     * @private
     */
    testLayerURL(url) {
        return this.test(url);
    }

    testURL(showUI = true) {
        const url = this.options.url;
        return this.test(url);
    }

    mapNames() {
        const featureTypes = this.options.feature_types;
        return featureTypes ? [...new Set(featureTypes.map(this._mapNameFor))].sort() : [];
    }

    /**
     * Returns the features in a relationship with a given feature. For this datasource only calculated
     * references are support.
     * @param  {Feature}    feature             Feature for which we want the related records
     * @param  {string}         relationshipName    Name of relationship (field)
     * @return {Promise<Feature[]>}    Promise for a list with the features in the relationship
     */
    async getRelationship(feature, relationshipName) {
        const fieldDD = feature.featureDD.fields[relationshipName];

        if (!fieldDD) {
            throw new Error(
                `No relationship '${relationshipName}' for feature type: ${feature.getType()}`
            );
        } else if (fieldDD.value?.startsWith('method(')) {
            const methodName = fieldDD.value.slice(7).split(')')[0];

            if (typeof feature[methodName] !== 'function') {
                throw new Error(
                    `Expected feature '${feature.getUrn()}' to have method named '${methodName}'`
                );
            } else {
                const result = await feature[methodName]();
                if (result instanceof Array) return result;
                else return [result];
            }
        } else {
            throw new Error(
                `Not a compatible relationship '${relationshipName}' for feature type: ${feature.getType()}`
            );
        }
    }
}

myw.datasourceTypes['esri'] = EsriDatasource;
