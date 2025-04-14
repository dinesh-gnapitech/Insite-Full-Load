// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { processOptionsFromJson } from 'myWorld/base/util';
import Datasource from './datasource';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import MVT from 'ol/format/MVT';
import VectorTileLayer from 'myWorld/layers/vectorTileLayer';
import TopoJSON from 'ol/format/TopoJSON';

/**
 *  @class Datasource to access visualization only layers based on tiles
 * Two types of tiles are supported: 'Raster' and 'Vector'
 * For raster tiles, the available options are the same as for ol/layer/Tile
 * For vector tiles the options are:
 *  style: expression that evaluates to {@link https://openlayers.org/en/latest/apidoc/module-ol_style_Style.html#~StyleLike}
 *  mapboxStyles: expression that evaluates to an object in the Mapbox styles format {@link https://docs.mapbox.com/mapbox-gl-js/style-spec/}
 *  reuse: boolean. If true layer will reuse the same source tiles for subsequent zoom levels to save bandwidth
 *  @name GenericTilesDatasource
 */
export class GenericTilesDatasource extends Datasource {
    static layerDefFields = [
        { name: 'relativeUrl', type: 'string', size: 'long' },
        {
            name: 'tileType',
            type: 'enumerator',
            enumerator: {
                raster: 'Raster',
                mvt: 'Vector (MVT)',
                topojson: 'Vector (TopoJSON)'
            }
        },
        {
            name: 'extraOptions',
            type: 'json',
            viewClass: 'KeyValueView',
            args: { keyTitle: 'name', valueTitle: 'value', valType: 'json' }
        },
        { name: 'useCacheBust', type: 'boolean' }
    ];

    static specFields = [{ name: 'baseUrl', type: 'string', size: 'long' }];

    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {ILayer}
     */
    createLayer(layerDef) {
        const tileAddressingScheme = layerDef.addressingScheme || '';
        const { tileType = 'raster', attribution: attributions } = layerDef;
        let url = this.options.baseUrl + layerDef.relativeUrl + tileAddressingScheme;
        const layerDefFixedOptions = processOptionsFromJson(layerDef.extraOptions);

        if (layerDef.useCacheBust) {
            const separator = url.includes('?') ? '&' : '?';
            url += separator + Math.round(Math.random() * 1000000);
        }

        const options = { ...layerDef.options, ...layerDefFixedOptions };

        //6.0 layers and 6.1 private layers may have tileType as 'Raster'
        if (tileType.toLowerCase() === 'raster') {
            const source = new XYZ({ url, attributions });
            return new TileLayer({ ...options, source });
        } else if (tileType === 'mvt') {
            const format = new MVT();
            return new VectorTileLayer({ url, format, attributions, ...options });
        } else if (tileType === 'topojson') {
            const layerName = options.layerName ?? 'layer';
            const format = new TopoJSON({ layerName });
            return new VectorTileLayer({ url, format, attributions, ...options });
        } else {
            throw new Error(`Unexpected tileType '${tileType}'`);
        }
    }
}

myw.datasourceTypes['generic_tiles'] = GenericTilesDatasource;

export default GenericTilesDatasource;
