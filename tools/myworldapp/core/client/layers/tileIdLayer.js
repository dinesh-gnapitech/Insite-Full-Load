// Copyright: IQGeo Limited 2010-2023
import TileLayer from 'ol/layer/Tile';
import TileDebugSource from 'ol/source/TileDebug';
import { getTileGridFor } from './tileLayerUtils';
/**
 * Utility tile layer that identifies the bounds, x, y (and zoom) for each tile
 */
export class TileIdentificationLayer extends TileLayer {
    constructor(options) {
        const { maxZoom = 21, maxTileZoom = maxZoom, tileSize = 256, ...layerOptions } = options;
        const tileGrid = getTileGridFor(maxTileZoom, tileSize);
        const superOptions = {
            source: new TileDebugSource({ tileGrid }),
            minZoom: 0,
            maxZoom,
            ...layerOptions
        };
        super(superOptions);
    }
}

export default TileIdentificationLayer;
