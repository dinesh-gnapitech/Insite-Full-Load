// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld/base/core';
import config from 'myWorld/base/config';
import { trace } from 'myWorld/base/trace';
import { Datasource } from './datasource';
import { DatasourceCommsMixin, JsonParseError } from './datasourceCommsMixin';
import { processOptionsFromJson } from 'myWorld/base/util';
import { DDFeature } from 'myWorld/features/ddFeature';
import { GeoserverLayer } from 'myWorld/layers/geoserverLayer';
import { GeoserverCombinedLayer } from 'myWorld/layers/geoserverCombinedLayer';
import { CONNECTION_METHODS } from 'myWorld/layers/geoserverImgRequest';
import { MissingFeatureDD } from 'myWorld/base/errors';
import { concatPromiseResults } from 'myWorld/base/util';

export class OGCDatasource extends Datasource {
    static supportsFeatureDefs = true;
    static supportsImportFeatureDefs = true;
    static {
        this.include(DatasourceCommsMixin);
        this.prototype.defaultFeatureModel = DDFeature;

        this.mergeOptions({
            caseInsensitive: false,
            tunnelled: false,
            requestTimeout: 4000,

            //search related options
            fullQuery: false,
            inWindowQuery: true,

            wfsVersion: '2.0.0',

            wfsRequestParams: undefined
        });

        this.prototype.wfsRequestParams = {
            '1.0.0': {
                service: 'WFS',
                version: '1.0.0',
                request: 'GetFeature',
                maxFeatures: '',
                srsName: 'EPSG:4326'
            },
            '1.1.0': {
                service: 'WFS',
                version: '1.1.0',
                request: 'GetFeature',
                maxFeatures: '',
                srsName: 'EPSG:4326'
            },
            '2.0.0': {
                service: 'WFS',
                version: '2.0.0',
                request: 'GetFeature',
                count: '',
                srsName: 'EPSG:4326'
            }
        };

        /*
         * Query operator lookup. myWorld attribute query to MapFish rest format
         * @type {Object}
         */
        this.prototype._operatorLookup = {
            '=': 'PropertyIsEqualTo',
            '<>': 'PropertyIsNotEqualTo',
            '<': 'PropertyIsLessThan',
            '<=': 'PropertyIsLessThanOrEqualTo',
            '>': 'PropertyIsGreaterThan',
            '>=': 'PropertyIsGreaterThanOrEqualTo'
        };
    }

    static layerDefFields = [
        {
            name: 'wmsLayerGroup',
            type: 'string'
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
            name: 'useCacheBust',
            type: 'boolean'
        }
    ];

    static specFields = [
        {
            name: 'combineWmsRequests',
            type: 'boolean',
            default: false
        },
        {
            name: 'wmsUrl',
            type: 'string',
            size: 'long',
            viewClass: 'UrlInputAndTestView',
            tableGroup: 'wms',
            args: { testMethod: 'testWms' }
        },
        {
            name: 'wmsRequestParams',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value' },
            tableGroup: 'wms'
        },
        { name: 'username', type: 'string', tableGroup: 'wms' },
        { name: 'password', type: 'string', tableGroup: 'wms' },

        {
            name: 'wfsUrl',
            type: 'string',
            size: 'long',
            viewClass: 'UrlInputAndTestView',
            tableGroup: 'wfs',
            args: { testMethod: 'testWfs' }
        },
        {
            name: 'wfsVersion',
            type: 'string',
            enumerator: ['1.0.0', '1.1.0', '2.0.0'],
            size: 'small',
            tableGroup: 'wfs'
        },
        {
            name: 'wfsRequestParams',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value' },
            tableGroup: 'wfs'
        },
        { name: 'caseInsensitive', type: 'boolean', tableGroup: 'wfs' },
        { name: 'tunnelled', type: 'boolean', tableGroup: 'wfs' }
    ];

    /**
     * @class Representation of an OGC compliant datasource
     * Provides visualization, selection and search capabilities by acessing WMS and WFS services
     * @param  {OGCOptions}    options
     * @constructs
     * @augments IDatasource
     */
    constructor(database, options) {
        super(database, options);

        this.requestParams = {
            outputFormat: this.options.tunnelled ? 'application/json' : 'text/javascript'
        };

        //Update the results count/ maxFeatures to match that in the config settings
        const wmsRequestParams = this.wfsRequestParams[this.options.wfsVersion];
        if (wmsRequestParams) {
            if (Object.prototype.hasOwnProperty.call(wmsRequestParams, 'maxFeatures'))
                wmsRequestParams['maxFeatures'] = config['core.queryResultLimit'];
            else if (Object.prototype.hasOwnProperty.call(wmsRequestParams, 'count'))
                wmsRequestParams['count'] = config['core.queryResultLimit'];
        }

        Object.assign(
            this.requestParams,
            this.wfsRequestParams[this.options.wfsVersion],
            this.options.wfsRequestParams
        );

        //  Layer to use when we combine requests
        this.groupedLayer = null;
    }

    /**
     * Logs in to the datasource
     * @param  {object} credentials
     * @return {Promise}
     */
    login(credentials) {
        //the wms service may require authentication so we login to wfs as well
        const requests = [this._ensureAuthenticated(`${this.options.wmsUrl}?request=GetMap`)];

        if (this.options.wfsUrl && !this.options.tunnelled) {
            //if using fetch, login to wfs url as well, as the wms service may not require authentication,
            //in which case it won't have actually logged in.

            //future requests will use 'GetFeature' request so we should login with that request if possible
            let args;
            if (this.featureTypes.length) {
                args = `request=GetFeature&count=1&maxFeatures=1&typeName=${this.featureTypes[0]}`;
            } else {
                args = 'request=GetCapabilities';
            }
            requests.push(this._ensureAuthenticated(`${this.options.wfsUrl}?${args}`));
        }

        return Promise.all(requests).catch(error => {
            trace('ogc', 1, 'Authentication error', error);
            throw error;
        });
    }

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {WmsLayer}
     */
    createLayer(layerDef) {
        if (this.options.combineWmsRequests) {
            return this._createGroupedLayer(layerDef);
        } else {
            return this._createLayer(layerDef, GeoserverLayer);
        }
    }

    _getGeoserverOptions(layerDef) {
        const layerDefFixedOptions = processOptionsFromJson(layerDef.extraOptions);
        const zIndex = layerDef.options?.zIndex;
        return {
            ...layerDef.options,
            ...{
                auth: this.options.username
                    ? {
                          type: CONNECTION_METHODS.BASIC,
                          username: this.options.username,
                          password: this.options.password
                      }
                    : { type: CONNECTION_METHODS.NONE },
                wmsLayerGroup: layerDef.wmsLayerGroup,
                featureItems: layerDef.feature_types,
                transparent: zIndex ? zIndex >= 0 : true, //ENH: this assumes basemap layers have a negative z-index. maybe add another way to specify this
                format: 'image/png',
                ds: this,
                getSessionVars: this.database.getSessionVars
            },
            ...layerDefFixedOptions
        };
    }

    _createLayer(layerDef, clazz) {
        const options = this._getGeoserverOptions(layerDef);

        const url = this._getWmsUrl();

        if (layerDef.useCacheBust) {
            url.searchParams.set('cacheBust', Math.round(Math.random() * 1000000));
        }

        const Layer = this._getLayerClassFor(layerDef, clazz);
        const layer = new Layer(url.toString(), options);

        this._registerLayer(layerDef);

        return layer;
    }

    _createGroupedLayer(layerDef) {
        //  First we create a parent layer to hold all of the grouped requests on, then return a stub layer to enable / disable different layer features
        if (this.groupedLayer === null) {
            this.groupedLayer = this._createLayer(layerDef, GeoserverCombinedLayer);
        }
        const options = this._getGeoserverOptions(layerDef);
        return this.groupedLayer.createSubLayer(layerDef, options);
    }

    /**
     * Returns a list of image urls for displaying legends
     * @param  {object}     layerDef
     * @return {Promise<array>}      image urls
     */
    getLegendInfo(layerDef) {
        const featureTypeNames = layerDef.feature_types?.length
            ? layerDef.feature_types.map(f => f.name)
            : [layerDef.wmsLayerGroup];

        return Promise.all(
            featureTypeNames.map(layer =>
                this.buildTunnelRequestUrl(
                    {
                        request: 'GetLegendGraphic',
                        version: '1.0.0',
                        format: 'image/png',
                        layer: layer,
                        legend_options:
                            'forceLabels:on;fontColor:6d6d6d;fontSize:15;fontName:Arial;labelMargin:25;fontAntiAliasing:true;dpi:72'
                    },
                    {
                        urlFieldName: 'wmsUrl',
                        format: 'image/png',
                        owner: layerDef.owner
                    }
                )
            )
        );
    }

    /**
     * Creates a url for the wms service
     * @return {string}         WMS URL
     * @private
     */
    _getWmsUrl() {
        const url = new URL(this.options.wmsUrl);
        const params = this.options.wmsRequestParams || {};
        for (const [paramName, param] of Object.entries(params)) {
            url.searchParams.set(paramName, param);
        }
        return url;
    }

    /**
     * Register that a layer is using this datasource
     * @param  {layerDefinition} layerDef
     * @private
     */
    _registerLayer(layerDef) {
        //store the definition in case it's a dynamically added layer (non stored in configuration)
        this.layerDefs[layerDef.name] = layerDef;
    }

    /**
     * Sends a request to the wfs service of underlying server
     * @param  {string} featureType
     * @param  {object} requestParams Parameters for the request
     * @return {Promise<Array<Feature>>}
     */
    sendRequest(featureType, requestParams) {
        if (!this.options.wfsUrl) return Promise.resolve([]);

        const options = {
            tunnelled: this.options.tunnelled,
            urlFieldName: 'wfsUrl'
        };
        if (requestParams.format) options.format = requestParams.format;

        options.featureType = featureType;
        return this._ensureDDInfoFor([featureType])
            .catch(reason => {
                if (reason instanceof MissingFeatureDD) {
                    //private layer or out of sync DD
                    //ignore and use data to deduce DD
                    return;
                }
            })
            .then(() => this._sendFeaturesRequest(requestParams, options));
    }

    /**
     * Finds the features selectable by a user map click
     * @param  {LatLng}   selectionPoint  Point the user clicked/selected
     * @param  {number}   zoomLevel       Zoom level at time of selection
     * @param  {number}   pixelTolerance  Number of pixels to use as tolerance for the selection
     * @param  {Array<Layer>}   layers  Layers relevant for selection (active and visible)
     * @return {Promise<Array<Feature>>}  Promise for the features
     */
    select(selectionPoint, zoomLevel, pixelTolerance, layers) {
        const map = layers[0].map; //Map that triggered the selection; ENH: do in caller and replace with with use of EPSG3857
        let featureTypeNames = [];

        layers.forEach(layer => {
            let layerFeatureTypesNames;
            if (layer.layerDef.feature_types) {
                const featureTypes = layer.layerDef.feature_types.filter(
                    (
                        lfi //layerFeatureItem
                    ) => lfi.min_select <= zoomLevel && zoomLevel <= lfi.max_select
                );
                layerFeatureTypesNames = featureTypes.map(f => f.name);
            } else {
                layerFeatureTypesNames = layer.layerDef.wmsLayerGroup;
            }
            featureTypeNames = featureTypeNames.concat(layerFeatureTypesNames);
        });
        const uniqueFeatureTypeNames = [...new Set(featureTypeNames)];

        return this._selectFeatures(
            uniqueFeatureTypeNames,
            selectionPoint,
            zoomLevel,
            pixelTolerance,
            map
        ).catch(reason => {
            console.log(`Datasource '${this.options.name}' selection for object failed.`, reason);
            throw reason;
        });
    }

    /**
     * Finds the features selectable by a user map box select
     * @param  {LatLngBounds} bounds          Bounds to select inside of
     * @param {int} zoomLevel Zoom level at time of selection
     * @param {Array<Layer>} layers Layers relevant for selection (active and visible)
     */
    async selectBox(bounds, zoomLevel, layers) {
        const features = await this.select(bounds, zoomLevel, null, layers);
        return features;
    }

    /**
     * Finds the features selectable by a user map click or box select
     * @param  {Array}           featureTypeNames     List of FeatureType names that should be queried
     * @param  {LatLng}        selectionPoint       Point the user clicked/selected
     * @param  {number}        zoomLevel            Zoom level at time of selection
     * @param  {number}        pixelTolerance       Number of pixels to use as tolerance for the selection
     * @param  {MapControl}  map                  Map that triggered the selection
     * @return {Promise<Array<Feature>>}          Promise for the features
     * @private
     */
    async _selectFeatures(featureTypeNames, selectionPoint, zoomLevel, pixelTolerance, map) {
        const bbox = selectionPoint.toBBoxString //if is already a bbox dont want to create again
            ? selectionPoint
            : map.getBoundingBoxFor(selectionPoint, pixelTolerance);
        const srsName = this.requestParams.srsName;
        const srsArg = srsName ? `,${srsName}` : '';

        const sendRequestforFeature = featureTypeName => {
            const requestParams = this._getRequestParams(featureTypeName);
            requestParams.bbox = bbox.toBBoxString() + srsArg;
            return this.sendRequest(featureTypeName, requestParams);
        };

        //send multiple requests and concatenate results
        const requests = featureTypeNames.map(featureTypeName =>
            sendRequestforFeature(featureTypeName)
        );
        return concatPromiseResults(requests);
    }

    /**
     * Sends an external search request
     * @param  {string}         searchTerm      Text to search for
     * @param  {searchOptions}  [options]       Options to influence the search
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     */
    runSearch(searchTerm, options) {
        const querySuggestions = this._querySuggestions(searchTerm, this.featuresDD);
        let requests;

        if (querySuggestions.length) {
            return Promise.resolve(querySuggestions);
        } else {
            const searchDetails = this._getSearchDetailsFor(searchTerm, this.featuresDD);

            //no queries matched, search for individual features
            requests = Object.values(searchDetails)
                .map((searchDetail, featureTypeName) => {
                    if (searchDetail.extraTerms) {
                        return this._searchFeatureTypeForTerm(
                            featureTypeName,
                            searchDetail.extraTerms
                        );
                    }
                })
                .filter(Boolean);

            return Promise.all(requests).then(results => results.flat());
        }
    }

    /**
     * Sends an external search request
     * @param  {string} featureType Name of feature type
     * @param  {string} terms  Text to search for
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     * @private
     */
    _searchFeatureTypeForTerm(featureType, terms) {
        const featureDD = this.featuresDD[featureType];
        const searchProperty = featureDD?.search_fields[0];
        //ENH: support multiple fields (by doing a request per field(?))
        if (!searchProperty) return Promise.resolve([]);

        const requestParams = this._getRequestParams(featureType);

        //search for features matching the other terms (besides the identification term)
        //ENH: this is not working for wfs 2.0.0
        const matchCase = this.options.caseInsensitive ? ' matchCase="false"' : '';
        requestParams.filter = `<Filter><PropertyIsLike wildCard="*" singleChar="." escape="!"${matchCase}><PropertyName>${searchProperty}</PropertyName><Literal>${terms}*</Literal></PropertyIsLike></Filter>`;

        return this.sendRequest(featureType, requestParams).then(
            this._handleSearchResult.bind(this, featureType)
        );
    }

    /**
     * Handles external search results by returning feature Autocomplete suggestions
     * @param  {Array<Feature>} features
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions to present the user
     * @private
     */
    _handleSearchResult(featureType, features) {
        const featureDD = this.featuresDD[featureType],
            typeExternalName = featureDD.external_name,
            searchProperty = featureDD.searchProperty;

        return features.map(feature => {
            let title = feature.getTitle();
            if (title == featureType || title == typeExternalName) {
                //title is just the typeName which is not very usefull for users,
                //use the external name from the definition and the property that we searched on
                title = `${typeExternalName}: ${feature.properties[searchProperty]}`;
            }

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
     * Sends a query request on a given feature type
     * @param  {queryDefinition}  queryDef   As generated by results of runSearch()
     * @param  {queryOptions}     [options]
     * @return {Promise<array<MyWorldFeature>>} Promise for a list of features
     */
    runQuery(queryDef, options) {
        const params = {
            clauses: queryDef.clauses,
            includeGeoGeometry: true
        };

        if (options.bounds) params.bounds = options.bounds;
        if (options.polygon) params.geom = options.polygon;
        if (options.displayValues) params.displayValues = options.displayValues;

        return this.getFeatures(queryDef.feature_type, params);
    }

    /**
     * Obtains a feature
     * @param  {string}     featureType
     * @param  {number}   featureId
     * @return {DDFeature}
     */
    async getFeature(featureType, featureId) {
        const requestParams = this._getRequestParams(featureType);
        requestParams.featureID = featureId;
        const res = await this.sendRequest(featureType, requestParams);
        return res[0];
    }

    /**
     * Get features of a given table optionally constrained by bounding box
     * @param  {string}             featureType
     * @param  {queryParameters}    [options]       Filters to apply. 'geom', 'filter', 'offset', 'includeTotal' are not supported
     * @return {Promise<Array<Feature>>}    Promise to resolve with a list of the matched features
     */

    getFeatures(featureType, options) {
        let requestParams;
        try {
            requestParams = this._getRequestParams(featureType, options || {});
        } catch (err) {
            return Promise.reject(err);
        }
        return this.sendRequest(featureType, requestParams);
    }

    /**
     * Count features of a given table optionally constrained by bounding box
     * @param  {string}             featureType
     * @param  {queryParameters}    [options]       Filters to apply. 'geom', 'filter', 'offset', 'includeTotal' are not supported
     * @return {Promise<number>}    Promise to resolve with a number of the matched features
     */
    countFeatures(featureType, options) {
        const requestParams = this._getRequestParams(featureType, options || {});
        requestParams.resultType = 'hits';
        requestParams.format = 'xml';
        delete requestParams.maxFeatures;
        delete requestParams.count;

        return this.sendRequest(featureType, requestParams);
    }

    /**
     * Get parameters for the request
     * @param  {string} featureType         feature type
     * @param  {Object} queryParams         query parameters. 'geom', 'filter', 'offset', 'includeTotal' are not supported
     * @return {object}                     parameters for the request
     * @private
     */
    _getRequestParams(featureType, queryParams) {
        queryParams = queryParams || {};

        const bounds = queryParams.bounds;
        let sortArray = [];
        const srsName = this.requestParams.srsName;
        let filter = '';
        const srsArg = srsName ? `,${srsName}` : '';
        const requestParams = Object.assign({ typeName: featureType }, this.requestParams); //this.requestParams has the parameters depeding on the the wfs version

        if (queryParams.geom)
            throw new Error('OGC datasource: geom parameter not yet supported by getFeatures()');

        if (queryParams.clauses) {
            queryParams.clauses.forEach(clause => {
                const operatorTag = this._operatorLookup[clause.operator];
                filter += `<${operatorTag}><PropertyName>${clause.fieldName}</PropertyName><Literal>${clause.value}</Literal></${operatorTag}>`;
            });
        }

        if (filter) {
            requestParams.filter = `<ogc:Filter xmlns:ogc="http://www.opengis.net/ogc" xmlns:gml="http://www.opengis.net/gml"><And>${filter}</And></ogc:Filter>`;
        }
        if (queryParams.cqlFilter) {
            requestParams.CQL_FILTER = queryParams.cqlFilter;
        }

        if (queryParams.limit) {
            if (this.options.wfsVersion == '2.0.0') {
                requestParams.count = queryParams.limit;
            } else {
                requestParams.maxFeatures = queryParams.limit;
            }
        }

        if (bounds && !filter) {
            requestParams.bbox = bounds.toBBoxString() + srsArg;
        } else if (bounds) {
            //bbox can't be used that the same time as filter, so we need to embbed in the filter
            filter += this._getBBoxAndFilter(featureType, bounds);
        }

        if (queryParams.orderBy) {
            queryParams.orderBy.forEach(orderByDict => {
                sortArray = sortArray.concat(`${orderByDict.fieldName} ${orderByDict.order}` || '');
            });
            requestParams.sortBy = sortArray.join(',');
        }

        return requestParams;
    }

    /**
     * Returns a string to be used as part of a filter argument in a wfs getFeature request
     * @param  {string} featureType
     * @param  {LatLngBounds} bounds
     * @return {string}
     * @private
     */
    _getBBoxAndFilter(featureType, bounds) {
        //isn't working for wfs 1.0.0. Tried Envelope tag but it wouldn't recognize it
        if (this.options.wfsVersion == '1.0.0')
            throw new Error('Setting filter and bounds not supported for  1.0.0');

        const srsName = this.requestParams.srsName;
        const srsAttr = srsName ? `srsName="${srsName}"` : '';
        const geomFieldName = this.getPrimaryGeomFieldNameFor(featureType);

        return `<ogc:BBOX><ogc:PropertyName>${geomFieldName}</ogc:PropertyName><gml:Box ${srsAttr}><gml:coordinates>${bounds.getSouth()},${bounds.getWest()} ${bounds.getNorth()},${bounds.getEast()}</gml:coordinates></gml:Box></ogc:BBOX>`;
    }

    /**
     * Tests the WMS URL using the options and the request params
     */
    testWms(showUI = true) {
        Object.assign(this.options.wmsRequestParams ?? {}, { request: 'GetCapabilities' });
        const url = this._getWmsUrl();

        const promise = this.initialized
            .then(() => {
                if (this.options.wmsUrl.length > 0) return this.fetchRequest(url, {});
            })
            .catch(error => {
                if (error instanceof JsonParseError) {
                    //We expect XML for this request, so a JsonParseError is expected and means
                    //the configuration is working.
                    //performing a tunnelled request after a 200 response.

                    const requestOptions = {
                        url: url.origin + url.pathname,
                        format: 'xml',
                        username: this.options.username,
                        password: this.options.password
                    };

                    const requestParams = { service: 'WMS', request: 'GetCapabilities' };

                    let promise = this._sendRequest(requestParams, requestOptions);
                    promise = promise.then(res => {
                        if (this.checkValidReturnedXml(res, true)) {
                            return res;
                        }
                    });

                    return promise;
                }

                throw error;
            });

        return promise;
    }

    /**
     * tests the passed response if it is valid WMS or WFS xml
     * @param response
     * @param isWms
     * @returns {boolean|*}
     */
    checkValidReturnedXml(response, isWms) {
        let xml, isNodeExist;
        try {
            xml = new DOMParser().parseFromString(response, 'text/xml');
        } catch (e) {
            throw new Error('Bad response format - not valid xml');
        }
        isNodeExist =
            $(xml).children().get(0).nodeName ===
            (isWms ? 'WMS_Capabilities' : 'wfs:WFS_Capabilities');

        if (!isNodeExist)
            throw new Error(`Bad response format - not a ${isWms ? 'WMS' : 'WFS'} server`);

        return isNodeExist;
    }

    /**
     * Tests the WFS URL using the options and the request params
     * @param isWms bool if passed in as true, will switch to WMS tunnel test
     */
    testWfs() {
        let url = this.options.wfsUrl;
        const requestOptions = {
            tunnelled: this.options.tunnelled,
            url: url,
            format: 'xml',
            username: this.options.username,
            password: this.options.password
        };
        const aFeatureType = Object.keys(this.featuresDD)[0];
        let promise = this.initialized.then(() => {
            if (!this.getName()) throw new Error('Please specify a datasource name');
        });
        let requestParams;

        if (aFeatureType) {
            requestParams = Object.assign({}, this.requestParams, {
                request: 'GetFeature',
                count: '1',
                maxFeatures: '1',
                typeName: aFeatureType
            });

            promise = promise.then(() => {
                if (this.options.wfsUrl.length > 0)
                    return this._sendRequest(requestParams, requestOptions);
            });
        } else {
            //no dd, check for more common errors using the getCapabilities request
            requestParams = Object.assign({}, this.requestParams, {
                request: 'GetCapabilities',
                format: 'xml'
            });

            promise = promise
                .then(() => {
                    if (this.options.wfsUrl.length > 0)
                        return this._sendRequest(requestParams, requestOptions);
                })
                .then(res => {
                    if (this.checkValidReturnedXml(res, false)) {
                        return res;
                    }
                })
                .catch(error => {
                    if (error instanceof JsonParseError) {
                        //We expect XML for this request, so a JsonParseError is expected and means
                        //the configuration is working
                        return 'success';
                    }
                    throw error;
                });
        }

        //figure out URL to display
        url += `?${new URLSearchParams(requestParams).toString()}`;
        return promise;
    }

    /**
     * Returns the image url to test the layer def
     * @param  {layerDefinition} layerDef
     * @return {string}
     */
    getLayerURL(layerDef) {
        layerDef = Object.assign({}, layerDef, layerDef.spec); //don't change original def
        let layer = this.createLayer(layerDef);

        return decodeURI(layer.getTileUrl([2, 4]));
    }

    /**
     * Tests the datasource url for the layers config page
     * @param  {string} url        URL to test
     * @return {Promise}           When resolved returns an object with a success boolean
     */
    testLayerURL(url) {
        return this.test(url, {}).catch(error => {
            if (error.message === 'TimeoutError') {
                return { success: false };
            } else {
                //ENH: check if it is actually  JsonParseError before returning success
                return { success: true };
            }
        });
    }

    /**
     * Tests the URL for the datasource
     * @param  {string}    url           URL to test
     * @param  {booelan}   tunnelled     If the tunnelled checkbox is ticked or not
     * @param  {string}    outputFormat  Output format for the data based on the tunnelled param ('application/json' or 'text/javascript')
     * @return {Promise}                 Return either a timeout error or a invalid json error
     *                                   The timeout error means the test has failed
     */
    test(url, extraOptions, outputFormat) {
        const requestParams = { outputFormat };
        return this.fetchRequest(new URL(url), requestParams);
    }

    featureTypes() {
        return this.options.feature_types.sort();
    }
}

myw.datasourceTypes['ogc'] = OGCDatasource;

/**
 * Options for {@link OGCDatasource}
 * @typedef OGCOptions
 * @property {string}    url                                Base Url to use when building requests. <br/> Usually the part of an example request up to and including the '?' character
 * @property {string}    typeName                           Type of features to select. Corresponds to the typeName parameter of WFS requests.
 * @property {boolean}   [tunnelled=false]                  Whether requests should be tunnelled via the myWorld server
 * @property {string}    [username]                         If provided, basic authentication credentials will be sent with requests
 * @property {string}    [password]                         Required if username is provided
 * @property {string}    [wfsVersion=2.0.0]                 Version to use when generating wfs requests. Determines default value for 'requestParams'
 * @property {Object<string>}   [requestParams]             Key/value pairs that will be added to the request url as parameters. See 'wfsVersion'
 * @property {boolean}   [caseInsensitive=false]            When true, search requests will include the 'matchCase="false"' attribute. Some WFS servers do not support this option.
 * @property {boolean}   [fullQuery=false]                  Whether suggestion for 'full table' query should be presented to the user or not
 * @property {boolean}   [inWindowQuery=true]               Whether suggestion for 'in window' query should be presented to the user or not
 */

export default OGCDatasource;
