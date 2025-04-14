// Copyright: IQGeo Limited 2010-2023
import { geojsonToArcGIS, arcgisToGeoJSON } from 'arcgis-to-geojson-utils';
import { msg, Util, LatLngBounds } from 'myWorld/base';

const DEFAULT_SR = 4326;
const MAX_FEATURES_PER_REQUEST = 1000;

/**
 * A class for handling various calls to an ESRI server
 * @private
 */
export class EsriQuery {
    /**
     * Constructor
     * @param {String} url The URL to base the query off of
     * @param {Integer} requestTimeout The duration to wait (in ms) before failing the request
     * @param {String} token The auth token to send to the server along with any requests made
     */
    constructor(url, requestTimeout = null, token = null) {
        this.url = url;
        this.requestTimeout = requestTimeout;
        this.token = token;
    }

    /**
     * Fetches the metadata from the ESRI server
     * @returns {Promise<Object>}
     */
    getServerMetadata() {
        return this._makeRequest(this.url, {}).then(this._ensureNoErrors);
    }

    /**
     * Performs an authentication request to the ESRI server
     * @param {Object} credentials An object containing a username and password to use for authentication
     * @returns {Promise<Object>}
     */
    authenticate(credentials) {
        return this._makeRequest(this.url, credentials).then(this._ensureNoErrors);
    }

    /**
     * Grabs a complete list of features close to the specified point.
     * @param {MapControl} map The myWorld map object
     * @param {LatLng} latLng The central point to base the search off of
     * @param {Array<Integer>} layerIds The ESRI layers to include in the search
     * @param {Integer} pixelTolerance The tolerance of the area to search
     * @returns {Promise<Array>}
     */
    getObjectsAtPoint(map, latLng, layerIds, pixelTolerance) {
        const mapSize = map.getSize();
        const mapBounds = map.getBounds();
        const params = {
            sr: DEFAULT_SR,
            layers: 'visible:' + layerIds.join(','),
            tolerance: pixelTolerance,
            returnGeometry: true,
            imageDisplay: `${mapSize[0]},${mapSize[1]},96`,
            mapExtent: `${mapBounds.getWest()},${mapBounds.getSouth()},${mapBounds.getEast()},${mapBounds.getNorth()}`,
            geometry: this._latLngToArg(latLng),
            geometryType: 'esriGeometryPoint'
        };
        return this._makeRequest(`${this.url}/identify`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res));
    }

    /**
     * Grabs details of the feature ID specified
     * @param {Integer} featureID The ID of the feature to get
     * @returns {Promise<Array>}
     */
    getObject(featureID) {
        const params = {
            returnGeometry: true,
            outSr: DEFAULT_SR,
            outFields: '*',
            objectIds: featureID
        };
        return this._makeRequest(`${this.url}/query`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res));
    }

    /**
     * Grabs a complete list of features matching the requirements specified.
     * @param {LatLngBounds|GeoJSON} bounds The boundaries within which to search for items
     * @returns {Promise<Array>}
     */
    getObjectsInBounds(bounds) {
        if (bounds && this._isMultiGeoJSON(bounds)) {
            return this._handleMultiGeoJSON('getObjectsInBounds', bounds, []);
        }

        const params = {
            returnGeometry: true,
            outSr: DEFAULT_SR,
            outFields: '*',
            inSr: DEFAULT_SR,
            geometryType: 'esriGeometryEnvelope',
            spatialRel: 'esriSpatialRelContains'
        };
        if (bounds) {
            const details = this._boundsToArg(bounds);
            params['geometryType'] = details.type;
            params['geometry'] = details.geometry;
        }
        return this._makeRequest(`${this.url}/query`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res));
    }

    /**
     * Grabs a complete list of features matching the requirements specified.
     * @param {LatLngBounds|GeoJSON} bounds The boundaries within which to search for items
     * @param {Array<String>} clauses The list of SQL clauses to apply to the search
     * @param {Integer} limit The upper limit of features to return
     * @returns {Promise<Array>}
     */
    getObjectsByQuery(bounds, clauses, limit) {
        if (bounds && this._isMultiGeoJSON(bounds)) {
            return this._handleMultiGeoJSON('getObjectsByQuery', bounds, [clauses, limit]);
        }
        const params = {
            returnGeometry: true,
            outSr: DEFAULT_SR,
            outFields: '*',
            inSr: DEFAULT_SR,
            spatialRel: 'esriSpatialRelIntersects'
        };

        if (bounds) {
            const details = this._boundsToArg(bounds);
            params['geometryType'] = details.type;
            params['geometry'] = details.geometry;
        }

        if (clauses) {
            params['where'] = this._clauseListToArg(clauses);
        }

        if (limit) {
            params['resultRecordCount'] = limit;
        }

        return this._makeRequest(`${this.url}/query`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res));
    }

    /**
     * Returns the list of features matching the requirements specified.
     * @param {LatLng} latLng The central point to base the search off of
     * @param {Integer} radius The distance (in meters) to search from the center
     * @returns {Promise<Array>}
     */
    getObjectsNearPoint(latLng, radius) {
        const params = {
            returnGeometry: true,
            outSr: DEFAULT_SR,
            outFields: '*',
            geometry: this._latLngToArg(latLng),
            geometryType: 'esriGeometryPoint',
            spatialRel: 'esriSpatialRelIntersects',
            units: 'esriSRUnit_Meter',
            distance: radius,
            inSr: DEFAULT_SR
        };

        return this._makeRequest(`${this.url}/query`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res));
    }

    /**
     * Returns the count of features matching the requirements specified.
     * @param {LatLngBounds|GeoJSON} bounds The boundaries within which to search for items
     * @param {Array<String>} clauses The list of SQL clauses to apply to the search
     * @returns {Promise<Array>}
     */
    getObjectCount(bounds, clauses) {
        if (bounds && this._isMultiGeoJSON(bounds)) {
            return this._handleMultiGeoJSON('getObjectCount', bounds, [clauses]);
        }

        const params = {
            outSr: DEFAULT_SR,
            outFields: '*',
            returnCountOnly: true
        };

        if (bounds) {
            params['inSr'] = DEFAULT_SR;
            params['spatialRel'] = 'esriSpatialRelIntersects';

            const details = this._boundsToArg(bounds);
            params['geometryType'] = details.type;
            params['geometry'] = details.geometry;
        }

        if (clauses) {
            params['where'] = this._clauseListToArg(clauses);
        }

        return this._makeRequest(`${this.url}/query`, params)
            .then(this._ensureNoErrors)
            .then(res => res.count);
    }

    /**
     * Grabs a complete list of features matching the requirements specified.
     * If there are more than are supported by one request, it calls itself again and returns the combined lists
     * @param {LatLngBounds|GeoJSON} bounds The boundaries within which to search for items
     * @param {Array<String>} clauses The list of SQL clauses to apply to the search
     * @param {Integer} limit The upper limit of features to return
     * @param {Integer} offset The offset of features to return
     * @param {Array<Object>} orderBy A list of fields to sort by, in the format {fieldName: String and order: 'ASC' || 'DESC'}
     * @returns {Promise<Array>}
     */
    getFeatures(bounds, clauses, limit, offset, orderBy) {
        if (bounds && this._isMultiGeoJSON(bounds)) {
            return this._handleMultiGeoJSON('getFeatures', bounds, [
                clauses,
                limit,
                offset,
                orderBy
            ]);
        }

        const requestLimit = Math.min(limit, MAX_FEATURES_PER_REQUEST) || MAX_FEATURES_PER_REQUEST;
        const params = {
            returnGeometry: true,
            outSr: DEFAULT_SR,
            outFields: '*',
            resultOffset: offset || 0,
            resultRecordCount: requestLimit,
            where: this._clauseListToArg(clauses)
        };

        if (bounds) {
            params['inSr'] = DEFAULT_SR;
            params['spatialRel'] = 'esriSpatialRelIntersects';

            const details = this._boundsToArg(bounds);
            params['geometryType'] = details.type;
            params['geometry'] = details.geometry;
        }

        if (orderBy) {
            params['orderByFields'] = this._sortListToArg(orderBy);
        }

        return this._makeRequest(`${this.url}/query`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res))
            .then(res => {
                if (res[0].features.length < requestLimit || res[0].features.length === limit) {
                    return res;
                }

                if (limit) {
                    limit = limit - requestLimit;
                }

                return this.getFeatures(
                    bounds,
                    clauses,
                    limit,
                    offset + requestLimit,
                    orderBy
                ).then(additionalData => {
                    return this._combineFeatureCollections(res, additionalData);
                });
            });
    }

    /**
     * Searches for objects based on a search term
     * @param {String} terms The search terms to search for
     * @param {Array<Integer>} layerIds The ESRI layers to include in the search
     * @param {Array<String>} searchFieldNames A list of fields to include in the search
     * @returns {Promise<Array>}
     */
    findObjects(terms, layerIds, searchFieldNames) {
        const params = {
            sr: DEFAULT_SR,
            contains: true,
            returnGeometry: true,
            returnZ: true,
            returnM: false,
            layers: layerIds.join(','),
            searchText: terms,
            searchFields: searchFieldNames.join(',')
        };

        return this._makeRequest(`${this.url}/find`, params)
            .then(this._ensureNoErrors)
            .then(res => this._parseResponse(res));
    }

    /**
     * Gets the legend info of the layer specified
     * @returns {Promise<Array>}
     */
    getLegend() {
        return this._makeRequest(`${this.url}/legend`, {}).then(this._ensureNoErrors);
    }

    /**
     * Simple wrapper class for creating a fetch request to the ESRI server, depending on specified options.
     */
    _makeRequest(url, params, method = 'GET') {
        let promise = new Promise((resolve, reject) => {
            params['f'] = 'json';
            if (this.token !== null) {
                params['token'] = this.token;
            }

            const requestParams = {
                method,
                headers: {},
                body: null
            };

            const requestUrl = new URL(url);
            if (method == 'GET') {
                for (const [paramName, param] of Object.entries(params)) {
                    requestUrl.searchParams.set(paramName, param);
                }
            } else {
                requestParams.body = new URLSearchParams(params);
                requestParams.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }

            fetch(requestUrl, requestParams).then(res => {
                return res.json().then(
                    res => {
                        if (res.error?.details == 'HTTP GET is disabled') {
                            resolve(this._makeRequest(url, params, 'POST'));
                        } else {
                            resolve(res);
                        }
                    },
                    error => {
                        reject(new Error(msg('datasources', 'invalid_response')));
                    }
                );
            }, reject);
        });
        if (this.requestTimeout) {
            promise = Util.timeout(promise, this.requestTimeout);
        }
        return promise;
    }

    _ensureNoErrors(response) {
        if (response.error) {
            throw new Error(response.error.message);
        } else {
            return response;
        }
    }

    /**
     * Processes a response from an ESRI server into a format we can use
     * @param {string} res Response from the ESRI server
     * @returns {Array} [0] = processed response, [1] = Raw JSON response
     * @private
     */
    _parseResponse(response) {
        const parsed = this._responseToFeatureCollection(response);
        return [parsed, response];
    }

    _responseToFeatureCollection(response, idAttribute) {
        let objectIdField;
        let features = response.features || response.results;
        let count = features?.length;

        if (idAttribute) {
            objectIdField = idAttribute;
        } else if (response.objectIdFieldName) {
            objectIdField = response.objectIdFieldName;
        } else if (response.fields) {
            for (let j = 0; j <= response.fields.length - 1; j++) {
                if (response.fields[j].type === 'esriFieldTypeOID') {
                    objectIdField = response.fields[j].name;
                    break;
                }
            }
        } else if (count) {
            for (let key in features[0].attributes) {
                if (key.match(/^(OBJECTID|FID|OID|ID)$/i)) {
                    objectIdField = key;
                    break;
                }
            }
        }

        const featuresRet = [];
        if (count) {
            for (let i = 0; i < features.length; ++i) {
                featuresRet.push(arcgisToGeoJSON(features[i], objectIdField));
            }
        }

        return {
            type: 'FeatureCollection',
            features: featuresRet
        };
    }

    /**
     *  Helper functions for formatting different objects to query arguments
     * @private
     */
    _latLngToArg(latLng) {
        return `${latLng.lng},${latLng.lat}`;
    }

    _boundsToArg(bounds) {
        if (bounds instanceof LatLngBounds) {
            const converted = {
                xmin: bounds.getWest(),
                xmax: bounds.getEast(),
                ymin: bounds.getSouth(),
                ymax: bounds.getNorth(),
                spatialReference: { wkid: DEFAULT_SR }
            };
            return {
                type: 'esriGeometryEnvelope',
                geometry: JSON.stringify(converted)
            };
        } else {
            //  Assume GeoJSON for now
            if (['MultiPoint', 'MultiPolygon', 'MultiLineString'].includes(bounds.type))
                throw new Error('multi-geometry is not supported in ESRI');

            //  There appear to be cases where either an array of coordinates is passed in,
            //  or a single entry array containing an array of coordinates is.
            //  Figure out which it is here and wrap it in an array if required
            const arcgis = geojsonToArcGIS({
                type: bounds.type,
                coordinates: this._wrapCoordinates(bounds.coordinates)
            });

            return {
                type: 'esriGeometryPolygon',
                geometry: JSON.stringify(arcgis)
            };
        }
    }

    _sortListToArg(sorts) {
        const list = [];
        for (let sort of sorts) {
            list.push(`${sort.fieldName} ${sort.order || 'ASC'}`);
        }
        return list.join(',');
    }

    _clauseListToArg(clauses) {
        if (clauses) {
            let chunks = [];
            for (let clause of clauses) {
                chunks.push(
                    `${clause.fieldName}${clause.operator}${
                        typeof clause.value === 'number' ? clause.value : "'" + clause.value + "'"
                    }`
                );
            }
            return chunks.join(' AND ');
        } else {
            return '1=1';
        }
    }

    _isMultiGeoJSON(bounds) {
        return ['MultiPoint', 'MultiPolygon', 'MultiLineString'].includes(bounds.type);
    }

    _wrapCoordinates(coords) {
        //  Integrity check on the passed in bounds to make sure that they're of valid format
        for (let coordSet of coords) {
            if (coordSet.length != 2) {
                return coords;
            }
        }

        return [coords];
    }

    async _handleMultiGeoJSON(functionName, bounds, extraArgs) {
        const coords = bounds.coordinates;
        const type = bounds.type;
        //  By this time, the type WILL begin with Multi, so strip it here
        const newType = type.slice(5);
        const promises = [];
        for (let coord of coords) {
            bounds.type = newType;
            bounds.coordinates = coord;
            promises.push(this[functionName](bounds, ...extraArgs));
        }
        const results = await Promise.all(promises);
        for (let i = 1; i < results.length; ++i) {
            results[0] = this._combineFeatureCollections(results[0], results[i]);
        }
        return results[0];
    }

    _combineFeatureCollections(orig, extra) {
        orig[0].features = orig[0].features.concat(extra[0].features);
        orig[1].features = orig[1].features.concat(extra[1].features);
        return orig;
    }
}

export default EsriQuery;
