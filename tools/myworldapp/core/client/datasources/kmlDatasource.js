// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { toProjExtent } from 'myWorld/base/proj';
import { Datasource } from './datasource';
import { MyWorldFeature } from '../features/myWorldFeature';
import { KmlLayer } from 'myWorld/layers/kmlLayer';
import { KmzLayer } from 'myWorld/layers/kmzLayer';

/**
 *  @class Datasource to provide visualization of KML files
 *  @name KmlDatasource
 */
export class KmlDatasource extends Datasource {
    static {
        this.prototype.defaultFeatureModel = MyWorldFeature;
    }

    static layerDefFields = [
        {
            name: 'isKmz',
            type: 'boolean',
            default: false,
            onChange: 'rebuildForm'
        },
        {
            name: 'relativeUrl',
            type: 'string',
            viewClass: 'StringWithTestView',
            args: {
                testUrlField: null
            },
            condition(def) {
                return !def.spec.isKmz;
            }
        },
        {
            name: 'kmzFile',
            type: 'string',
            condition(def) {
                return def.spec.isKmz;
            }
        },
        {
            name: 'fileInKmz',
            type: 'string',
            viewClass: 'StringWithTestView',
            args: {
                testUrlField: null
            },
            condition(def) {
                return def.spec.isKmz;
            }
        },
        {
            name: 'queryValue',
            type: 'string',
            default: null
        },
        {
            name: 'searchPrefix',
            type: 'string',
            default: null
        }
    ];

    static specFields = [{ name: 'baseUrl', type: 'string', size: 'long' }];

    constructor(database, options) {
        super(database, options);
        this.layers = {};
    }

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {Promise<KmlLayer>}
     */
    async createLayer(layerDef) {
        let clazz = null;
        let url = null;
        if (layerDef.isKmz) {
            url = await this.system.getUrlForKmz(layerDef);
            clazz = KmzLayer;
        } else {
            url = await this.system.getUrlForLayerDataFile(layerDef);
            clazz = KmlLayer;
        }
        if (layerDef.owner) url += `?owner=${layerDef.owner}`;
        const layer = new clazz(url, layerDef, this);
        this.isInvalid = false;
        layer.on('invalid', () => {
            this.isInvalid = true;
        });
        this.layers[layerDef.name] = layer;
        return layer;
    }

    /**
     * Returns the url to test the layer def
     * @param  {string} relativeUrl String to append to the base URL
     * @return {string}
     */
    getLayerURL(def) {
        if (def.spec.isKmz) {
            return this._formatKmzUrl(def.spec.kmzFile, def.spec.fileInKmz);
        } else {
            let baseUrl = def.baseUrl;
            if (baseUrl.slice(-1) !== '/') baseUrl += '/'; //Make sure there is a trailing '/' with the url

            return baseUrl + def.spec.relativeUrl;
        }
    }

    _formatKmzUrl(kmzFile, fileInKmz) {
        let baseUrl = this.options.baseUrl;
        if (baseUrl.slice(-1) !== '/') baseUrl += '/';
        if (kmzFile.slice(-1) === '/') kmzFile = kmzFile.slice(0, -1); //Make sure there is no trailing '/' with the url
        if (fileInKmz.slice(-1) === '/') fileInKmz = fileInKmz.slice(0, -1); //Make sure there is no trailing '/' with the url
        return `system/kmz/file/${btoa(baseUrl + kmzFile)}/${btoa(fileInKmz)}`;
    }

    /**
     * Tests the datasource url for the layers config page
     * @param  {string}          relativeUrl   Relative url for the layerDef spec
     * @return {Promise}                       When resolved returns an object with a success boolean and message to alert the user of any errors
     */
    testLayerURL(spec) {
        if (spec.isKmz) {
            if (spec.kmzFile.length === 0) throw new Error('Please enter a KMZ file to use');
            if (spec.fileInKmz.length === 0)
                throw new Error('Please enter a file inside the KMZ file to use');
            return this.system.server
                .ajax({
                    type: 'GET',
                    url: this._formatKmzUrl(spec.kmzFile, spec.fileInKmz)
                })
                .then(res => 'success');
        } else {
            if (spec.relativeUrl.length === 0) throw new Error('Please enter a URL');

            const options = {
                urlFieldName: 'baseUrl',
                relativeUrl: spec.relativeUrl,
                format: 'xml'
            };

            return this.tunnelRequest({}, options).then(() => 'success');
        }
    }

    select(selectionPoint, zoomLevel, pixelTolerance, layers, worldId) {
        const requests = [];
        for (let layer of layers) {
            const request = layer.maplibLayer.select(selectionPoint);
            requests.push(request);
        }
        return Promise.all(requests);
    }

    selectBox(bounds, zoomLevel, layers, worldId) {
        const requests = [];
        for (let layer of layers) {
            const request = layer.maplibLayer.selectBox(bounds);
            requests.push(request);
        }
        return Promise.all(requests);
    }

    runSearch(searchTerm, options) {
        const term = searchTerm.toLowerCase();
        const queries = this._runQuerySearch(term, options);
        const features = this._runFeatureSearch(term, options);

        return [...queries, ...features];
    }

    _runQuerySearch(searchTerm, options) {
        const ret = [];
        let queryID = 0;

        for (const [layerName, layer] of Object.entries(this.layers)) {
            const { queryValue } = layer.layerDef;
            //  Check whether we should propose queries for a layer
            const layerNameLower = queryValue ? queryValue.toLowerCase() : layerName.toLowerCase();
            if (layerNameLower.match(searchTerm) !== null) {
                for (const restriction of [null, 'window', 'selection']) {
                    ret.push({
                        type: 'query',
                        label: layerName,
                        value: layerName + (restriction ? ` in ${restriction}` : ''),
                        data: {
                            feature_type: layerName,
                            //filter: null,
                            id: queryID,
                            spatial_restriction: restriction,
                            has_geometry: true
                        }
                    });
                }
                queryID++;
            }
        }

        return ret;
    }

    _runFeatureSearch(searchTerm, options) {
        const ret = [];

        for (const layer of Object.values(this.layers)) {
            const { searchPrefix } = layer.layerDef;

            //  If we have a search prefix specified, ensure that its here
            const searchPrefixLower = searchPrefix?.toLowerCase();
            if (searchPrefixLower) {
                const searchRes = searchTerm.match(`${searchPrefixLower} (.*)$`);
                if (searchRes?.index == 0) {
                    searchTerm = searchRes[1];
                } else {
                    continue;
                }
            }
            //  Process individual layers
            layer.getSource().forEachFeature(feature => {
                for (const val of Object.values(feature.myw_properties)) {
                    if (typeof val !== 'string') {
                        continue;
                    }

                    const valLower = val.toLowerCase();
                    if (valLower.match(searchTerm) !== null) {
                        const info = {
                            data: {
                                feature: layer._processFeature(feature)
                            },
                            datasource: this.name,
                            label: feature.myw_properties.name,
                            type: 'kml_feature',
                            value: feature.myw_properties.name
                        };
                        ret.push(info);
                        return;
                    }
                }
            });
        }

        return ret;
    }

    runQuery(queryDef, options) {
        const features = [];
        const layerName = queryDef.feature_type;
        const layer = this.layers[layerName];
        if (options.bounds) {
            const extent = toProjExtent(options.bounds);

            layer.getSource().forEachFeatureInExtent(extent, feature => {
                const newFeature = layer._processFeature(feature);
                features.push(newFeature);
            });
        } else {
            layer.getSource().forEachFeature(feature => {
                const newFeature = layer._processFeature(feature);
                features.push(newFeature);
            });
        }
        return features;
    }

    async _ensureDDInfoFor(type) {
        //  KML files don't really have solid types, so just assume its all fine
        if (!(type in this.layers)) {
            throw new Error('Trying to fetch unspecified KML file info');
        }
    }

    getDDInfoFor(type) {
        //  KML files don't have specified types, so for now, just return some empty info with an unknown data type
        const ret = {};
        ret[type] = {
            datasource: this.name,
            geometry_type: true
        };
        return ret;
    }
}

myw.datasourceTypes['kml'] = KmlDatasource;

export default KmlDatasource;
