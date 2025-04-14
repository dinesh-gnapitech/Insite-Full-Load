// Copyright: IQGeo Limited 2010-2023
import ClippedTileLayerMixin from './clippedTileLayerMixin';
import { getTileUrlOptions, getTileGridFor } from './tileLayerUtils';
import OlTileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import CanvasTileLayerRenderer from 'ol/renderer/canvas/TileLayer';

export class TileLayer extends OlTileLayer {
    static getTileUrlOptions = getTileUrlOptions;
    static getTileGridFor = getTileGridFor;

    /**
     * Tile layer for tiles supplied by the myWorld tile server.<br/>
     * Prevents browser from caching tiles between sessions.
     * Handles maxNativeZoom option
     * Extends OpenLayers' {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_Tile-TileLayer.html|TileLayer}
     * @mixes ClippedTileLayerMixin
     * @constructs
     * @param  {object} options Options as specified for {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_Tile-TileLayer.html}
     */
    constructor(options) {
        //add the url template part that matches the myWorld tile server rest api
        //also add a random number to prevent the browser from caching tiles between sessions

        const { source, url, clipGeometries, ...layerOptions } = options;
        const urlOptions = getTileUrlOptions({ tileSize: 256, ...options, url: getNewUrl(url) });
        super({ ...layerOptions, source: source || new XYZ({ ...urlOptions }) });

        this._baseUrl = url;
        this.initClipping(clipGeometries);
    }

    redraw() {
        const url = getNewUrl(this._baseUrl);
        this.getSource().setUrl?.(url);
    }

    /*
     * overridden to use renderer that handles maxNativeZoom option
     */
    createRenderer() {
        return new MywCanvasTileLayerRenderer(this);
    }
}

Object.assign(TileLayer.prototype, ClippedTileLayerMixin);

export class MywCanvasTileLayerRenderer extends CanvasTileLayerRenderer {
    isDrawableTile(tile) {
        //if tile's zoom is bigger maxNativeZoom return false so that the renderer can use existing tiles
        const zoom = tile.getTileCoord()[0];
        const maxNativeZoom = this.getLayer().getProperties().maxNativeZoom;
        if (maxNativeZoom && zoom > maxNativeZoom) return false;
        return super.isDrawableTile(tile);
    }
}

function getNewUrl(baseUrl) {
    const cacheBust = Math.round(Math.random() * 1000000);
    return `${baseUrl}{z}/{x}/{y}.png?${cacheBust}`;
}

export default TileLayer;
