// Copyright: IQGeo Limited 2010-2023
import Layer from 'ol/layer/Layer.js';
import { until } from 'myWorld/base/util.js';

/**
 * Layer that renders features in the myWorld database using two rendering types based on the zoom level.  <br/>
 * Extends OpenLayers' {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_Layer-Layer.html|Layer}
 */
export class HybridLayer extends Layer {
    /**
     * @param  {object}  options
     * @param  {number} options.switchZoomLevel Zoom level on which to switch to zoomed in mode
     * @param  {function} options.zoomedInLayerFn Function to create layer to render zoomed in levels
     * @param  {function} options.zoomedOutLayerFn Function to create layer to render zoomed in levels
     * @constructs
     */
    constructor(options) {
        super({});
        this.options = options;
        this._layerForMode = {};
    }

    /*
     * Implementation of ILayer interface
     * adds the layer for the current mode
     */
    onAdd(map) {
        this._map = map;
        this.mode = this._getModeForZoom(this._map.getZoom());
        this._setLayer();

        map.on('zoomend', this._onZoomChange.bind(this));
        return true;
    }

    /**
     * Gets the mode for the layer based on the zoom level
     * @param  {number} zoom
     * @return {'zoomedIn'|'zoomedOut'}
     * @private
     */
    _getModeForZoom(zoom) {
        return zoom >= this.options.switchZoomLevel ? 'zoomedIn' : 'zoomedOut';
    }

    /*
     * Implementation of ILayer interface
     * Removes the current layer from the map
     */
    onRemove(map) {
        this._unsetLayer();
        this._map = null;
        return true;
    }

    /*
     * Adds the layer for the current mode to the map
     */
    _setLayer() {
        const map = this._map;
        const prevLayer = this._layer;
        const newLayer = this._getLayerForMode(this.mode);
        this._layer = newLayer;
        if (this._clipGeometries) this.setClipGeometry(this._clipGeometries);
        map.addLayer(newLayer);
        if (prevLayer) {
            //delay removing of old layer until new one has rendered for a smoother transition
            until(() => newLayer.rendered, 2000).then(() => map.removeLayer(prevLayer));
        }
        return newLayer;
    }

    /*
     * Obtains the layer apropriate for the given mode
     * @param  {string} mode 'master' or 'local'
     * @return {Promise<ILayer>}  Promise will be rejected if datasource can't log in
     */
    _getLayerForMode(mode) {
        if (!this._layerForMode[mode]) {
            const layer =
                mode === 'zoomedIn'
                    ? this.options.zoomedInLayerFn()
                    : this.options.zoomedOutLayerFn();
            this._layerForMode[mode] = layer;
        }

        return this._layerForMode[mode];
    }

    /*
     * Removes the current layer from the map
     */
    _unsetLayer() {
        if (!this._layer) return;

        this._map.removeLayer(this._layer);
        this._layer = null;
    }

    /**
     * Called when the zoom level is changed on the map
     * If the layer mode has changed, resets the layer so it can be rendered differently
     * @private
     */
    _onZoomChange(e) {
        if (!this._map) return;
        const newMode = this._getModeForZoom(this._map.getZoom());
        if (this.mode !== newMode && this._layer) {
            this.mode = newMode;
            this._setLayer();
            if (typeof this._layer.redraw == 'function') {
                this._layer.redraw();
            }
        }
    }

    /**
     * Set clip geometry on the local layer if the layer supports it
     * @param  {polygonGeometry[]} geometries  GeoJSON geometries to clip by
     * See comments for ClippedTileLayer.setClipGeometry() for more information
     */
    setClipGeometry(geometries) {
        this._clipGeometries = geometries;
        this._layer?.setClipGeometry?.(geometries);
    }

    /**
     * Sets opacity
     */
    setOpacity(opacity) {
        this._getLayerForMode('zoomedIn').setOpacity(opacity);
        this._getLayerForMode('zoomedOut').setOpacity(opacity);
    }

    redraw() {
        for (let layer of Object.values(this._layerForMode)) {
            if (typeof layer.redraw == 'function') {
                layer.redraw();
            } else {
                layer.getSource?.()?.refresh();
            }
        }
    }
}

export default HybridLayer;
