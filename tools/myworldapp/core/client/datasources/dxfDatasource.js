// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import proj4 from 'proj4';
import { Datasource } from './datasource';
import { DxfLayer } from 'myWorld/layers/dxfLayer';
import { register as registerProjections } from 'ol/proj/proj4';
import { getUserProjection } from 'ol/proj';

/**
 *  @class Datasource to provide visualization of DXF files
 *  @name DxfDatasource
 */
export class DxfDatasource extends Datasource {
    static layerDefFields = [
        {
            name: 'relativeUrl',
            type: 'string',
            viewClass: 'StringWithTestView',
            args: {
                testUrlField: null
            }
        },
        { name: 'crs', type: 'string', viewClass: 'CRSSearch' }
    ];

    static specFields = [{ name: 'baseUrl', type: 'string', size: 'long' }];

    constructor(database, options) {
        super(database, options);
        this.layers = {};
    }

    async createLayer(layerDef, map) {
        const crs = layerDef.crs;
        await this._ensureCRSRegistered(crs);

        let url = await this.system.getUrlForLayerDataFile(layerDef);
        if (layerDef.owner) url += `?owner=${layerDef.owner}`;
        const layer = new DxfLayer({
            url,
            sourceCRS: crs || 'EPSG:4326',
            destCRS: getUserProjection(),
            datasource: this,
            layerDef
        });
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
        let baseUrl = def.baseUrl;
        if (baseUrl.slice(-1) !== '/') baseUrl += '/'; //Make sure there is a trailing '/' with the url

        return baseUrl + def.spec.relativeUrl;
    }

    /**
     * Tests the datasource url for the layers config page
     * @param  {string}          relativeUrl   Relative url for the layerDef spec
     * @return {Promise}                       When resolved returns an object with a success boolean and message to alert the user of any errors
     */
    testLayerURL(spec) {
        if (spec.relativeUrl.length === 0) throw new Error('Please enter a URL');

        const options = {
            urlFieldName: 'baseUrl',
            relativeUrl: spec.relativeUrl,
            format: 'text'
        };

        return this.tunnelRequest({}, options).then(() => 'success');
    }

    async _ensureCRSRegistered(crs) {
        if (crs && !(crs in proj4.defs)) {
            try {
                const def = await this.system.server.getCRSDefinition(crs);
                //  Reverse the returned object to a string
                const defString = Object.entries(def).reduce(
                    (prev, [key, val]) => prev + (val === true ? key : `+${key}=${val} `),
                    ''
                );
                proj4.defs(crs, defString);
                registerProjections(proj4);
            } catch (error) {
                this.isInvalid = true;
                throw `Invalid CRS: ${crs}`;
            }
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
        const results = [];
        for (let layer of Object.values(this.layers)) {
            const features = layer.runSearch(searchTerm, options);
            results.push(...features);
        }
        return results;
    }
}

myw.datasourceTypes['dxf'] = DxfDatasource;

export default DxfDatasource;
