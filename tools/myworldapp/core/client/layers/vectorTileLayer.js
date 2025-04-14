// Copyright: IQGeo Limited 2010-2023
import ClippedTileLayerMixin from './clippedTileLayerMixin';
import { getTileUrlOptions } from './tileLayerUtils';
import OlVectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { applyBackground, applyStyle as applyMapboxStyle } from 'ol-mapbox-style';

export class VectorTileLayer extends OlVectorTileLayer {
    /**
     * Vector Tile layer for tiles supplied by the myWorld tile server.<br/>
     * Extends {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_VectorTile-VectorTileLayer.html|VectorTileLayer}
     * @mixes ClippedTileLayerMixin
     * @constructs
     * @param {object} options Options as specified for {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_VectorTile-VectorTileLayer.html}
     * @param {string} [attributions] Attributions to pass to source
     * @param {object} [mapboxStyles] Mapbox styles that will be applied as per {@link https://github.com/openlayers/ol-mapbox-style/#applystyle} and {@link https://github.com/openlayers/ol-mapbox-style/#applybackground}
     * @param {polygonGeometry[]} [clipGeometries]
     * @param {function} [tileLoadFunction] Tile load function to be passed to {@link https://openlayers.org/en/latest/apidoc/module-ol_source_VectorTile-VectorTile.html|VectorTileSource}
     */
    constructor(options) {
        //add the url template part that matches the myWorld tile server rest api
        //also add a random number to prevent the browser from caching tiles between sessions
        const {
            format,
            attributions,
            // eslint-disable-next-line no-unused-vars
            url,
            tileLoadFunction,
            mapboxStyles,
            clipGeometries,
            ...layerOptions
        } = options;
        const urlOptions = getTileUrlOptions({ tileSize: 512, ...options });
        const source = new VectorTileSource({
            attributions,
            format,
            tileLoadFunction,
            ...urlOptions
        });
        const declutter = true;
        super({ declutter, ...layerOptions, source });

        if (mapboxStyles) {
            this._mapboxStyles = mapboxStyles;
            //styles will be set when adding to a map due to caching in ol-mapbox-style
        }
        this.initClipping(clipGeometries);
    }

    /*
     * Implementation of ILayer.onAdd.
     * @param {ol/Map} map
     */
    onAdd(map) {
        //apply any background layer style to the map
        if (this._mapboxStyles) {
            //assumes only one layer with background layer style is visible simultaneously (i.e such a layer is a basemap layer)
            const mapEl = map.getTargetElement();
            const { background, backgroundColor, opacity } = mapEl.style;
            this._previousMapBackgroundStlye = { background, backgroundColor, opacity };
            applyBackground(this, this._mapboxStyles);

            //apply styles - this should be possible to do in the constructor but due to caching in ol-mapbox-style it causes some styles to not change if
            //there are two layers with the same source but different styles
            const sourceName = Object.keys(this._mapboxStyles.sources ?? {})[0];
            applyMapboxStyle(this, this._mapboxStyles, sourceName);
        }
    }

    /*
     * Implementation of ILayer.onRemove
     * @param  {ol/Map} map
     */
    onRemove(map) {
        //restore map's previous background style
        if (this._previousMapBackgroundStlye) {
            const { background, backgroundColor, opacity } = this._previousMapBackgroundStlye;
            const mapEl = map.getTargetElement();
            mapEl.style.background = background;
            mapEl.style.backgroundColor = backgroundColor;
            mapEl.style.opacity = opacity;
        }
    }
}

Object.assign(VectorTileLayer.prototype, ClippedTileLayerMixin);

export default VectorTileLayer;
