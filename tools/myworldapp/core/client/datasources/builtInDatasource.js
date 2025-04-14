// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { evalAccessors } from 'myWorld/base/util';
import { Datasource } from './datasource';

/**
 *  @class Datasource to provide layers that don't require an actual datasource (i.e are client side calculated)
 *  @name BuiltInDatasource
 */
export class BuiltInDatasource extends Datasource {
    static {
        this.mergeOptions({
            defs: {
                Blank: 'myw.BlankLayer',
                'Tile IDs': 'myw.TileIdentificationLayer'
            }
        });
    }

    static layerDefFields = [
        {
            name: 'mapType',
            type: 'enumerator',
            enumerator: ['Blank', 'Tile IDs']
        },
        {
            name: 'tileSize',
            type: 'enumerator',
            enumerator: [256, 512],
            default: 256
        },
        {
            name: 'maxTileZoom',
            type: 'enumerator',
            enumerator: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
        }
    ];

    static specFields = [];

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {ILayer}
     */
    createLayer(layerDef) {
        let layer, expr, Constructor;
        const { mapType, tileSize, maxTileZoom } = layerDef;

        try {
            expr = this.options.defs[mapType];
            Constructor = evalAccessors(expr);
            layer = new Constructor({ ...layerDef.options, tileSize, maxTileZoom });
        } catch (e) {
            if (typeof Constructor !== 'function') {
                console.log(`Could not evaluate '${expr}' to a class`);
            }
            console.log(`Error instantiating layer '${layerDef.name}'. Exception: `, e);
        }

        return layer;
    }
}

myw.datasourceTypes['built_in'] = BuiltInDatasource;

export default BuiltInDatasource;
