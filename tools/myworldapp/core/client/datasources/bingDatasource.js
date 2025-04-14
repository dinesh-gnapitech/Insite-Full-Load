// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { Datasource } from './datasource';
import BingLayer from 'myWorld/layers/bingLayer';

/**
 * @class Datasource to provide visualisation of Bing basemap layers
 * @name BingDatasource
 */
export class BingDatasource extends Datasource {
    static {
        this.mergeOptions({
            license: undefined
        });
    }

    static layerDefFields = [
        {
            name: 'mapType',
            type: 'enumerator',
            enumerator: ['Road', 'Aerial', 'AerialWithLabels']
        }
    ];

    static specFields = [{ name: 'license', type: 'string' }];

    /**
     * Instantiates a BingLayer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {BingLayer}
     */
    createLayer(layerDef) {
        let layer;
        const license = this.options.license;
        const options = Object.assign({}, layerDef.options, {
            type: layerDef.mapType || undefined
        });

        try {
            layer = new BingLayer(license, options);
        } catch (e) {
            console.log(`Error instantiating layer '${layerDef.name}'. Exception:${e}`);
        }

        return layer;
    }
}

myw.datasourceTypes['bing'] = BingDatasource;

export default BingDatasource;
