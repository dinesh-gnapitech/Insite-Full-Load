// Copyright: IQGeo Limited 2010-2023
import { get as getProjection } from 'ol/proj';
import { createXYZ } from 'ol/tilegrid';

export function getTileUrlOptions(options) {
    //ENH: add support for "skipped" zoom levels as in https://openlayers.org/en/latest/examples/mapbox-vector-tiles-advanced.html
    const { url, maxNativeZoom, tileSize = 512 } = options;
    if (maxNativeZoom) {
        const tileGrid = getTileGridFor(maxNativeZoom, tileSize);
        return { tileGrid, url };
    }
    return { url };
}

export function getTileGridFor(maxNativeZoom, tileSize = 512) {
    const extent = getProjection('EPSG:3857').getExtent();

    return createXYZ({
        tileSize,
        maxZoom: maxNativeZoom,
        extent
    });
}
