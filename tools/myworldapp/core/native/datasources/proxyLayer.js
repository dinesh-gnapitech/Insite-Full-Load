// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-base';
import Layer from 'ol/layer/Layer.js';

export class ProxyLayer extends Layer {
    /**
     * @class Layer that provide local/master mode functionality </br>
     *        Will listen on the 'nativeAppMode-changed' event and flip
     *        between the corresponding local and master layers
     * @param  {ProxyDatasource}    proxyDs
     * @param  {layerDefinition}        def
     * @constructs
     * @augments ol/layer/Layer
     */
    constructor(proxyDs, def) {
        super({});
        this.proxyDs = proxyDs;
        this.database = proxyDs.database;
        this.def = def;

        this._layerPromises = {};

        ['_onRenderingEnded', '_onModeChange'].forEach(
            method => (this[method] = this[method].bind(this))
        );

        this.database.on('nativeAppMode-changed', this._onModeChange);
    }

    /*
     * Implementation of ILayer interface
     * adds the layer for the current mode
     */
    onAdd(map) {
        this._map = map;
        this._setLayer();
        return true;
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

    update(redraw = false) {
        return this._layer?.update(redraw);
    }

    redraw() {
        if (!this._layer) return;

        if (typeof this._layer.redraw == 'function') {
            this._layer.redraw();
        } else {
            this._map.removeLayer(this._layer);
            this._map.addLayer(this._layer);
        }
    }

    getSource() {
        return this._layer?.getSource?.();
    }

    /**
     * Set clip geometry on the local layer if the layer supports it
     * @param  {polygonGeometry[]} geometries  GeoJSON geometries to clip by
     * See comments for ClippedTileLayer.setClipGeometry() for more information
     */
    async setClipGeometry(geometries) {
        const layer = await this._getLayerForMode('local');
        layer.setClipGeometry?.(geometries);
    }

    /**
     * Sets opacity
     */
    async setOpacity(opacity) {
        const localLayer = await this._getLayerForMode('local');
        localLayer.setOpacity(opacity);
        const masterLayer = await this._getLayerForMode('master');
        masterLayer.setOpacity(opacity);
    }

    /*
     * Adds the layer for the current mode to the map
     */
    async _setLayer() {
        const mode = this.proxyDs.modeForLayer(this.def.name);
        const layer = await this._getLayerForMode(mode).catch(reason => {
            //failure to access the datasource
            const ds = mode == 'master' ? this.proxyDs.masterDs : this.proxyDs.localDs;
            console.log(
                `Layer '${
                    this.def.name
                }': Unable to ensure datasource '${ds.getExternalName()}' is logged in. Reason:`,
                reason
            );
            this.dispatchEvent('invalid');
            return;
        });
        if (!layer) return; //error

        if (!this._map) return; //removed from map meanwhile

        this._unsetLayer();

        //ensure source has the configured attribution
        layer.getSource?.()?.setAttributions(this.def.attribution);

        this._layer = layer;
        this._map.addLayer(layer);
        this._layer.on('rendering-ended', this._onRenderingEnded);

        this.dispatchEvent('valid');
    }

    _onRenderingEnded(ev) {
        this.dispatchEvent(ev.type);
    }

    /*
     * Obtains the layer apropriate for the given mode
     * @param  {string} mode 'master' or 'local'
     * @return {Promise<ILayer>}  Promise will be rejected if datasource can't log in
     */
    _getLayerForMode(mode) {
        if (!this._layerPromises[mode]) {
            const ds = mode == 'master' ? this.proxyDs.masterDs : this.proxyDs.localDs;

            this._layerPromises[mode] = ds
                .ensureLoggedIn()
                .then(() => {
                    let def;
                    // Master layer should not be clipped
                    if (mode == 'master' && this.def.options.clipGeometries) {
                        def = Object.assign({}, this.def);
                        def.options = Object.assign({}, this.def.options);
                        delete def.options.clipGeometries;
                    } else def = this.def;

                    def = Object.assign({}, def, { mode: mode }); //mode is used by the datasource to create the appropriate layer

                    const layer = ds.createLayer(def);
                    this._setPassthrough(layer);
                    return layer;
                })
                .catch(reason => {
                    //login failed. clear cached promise so it can attempted again on the next call
                    this._layerPromises[mode] = undefined;
                    return Promise.reject(reason);
                });
        }

        return this._layerPromises[mode];
    }

    /*
     * Removes the current layer from the map
     */
    _unsetLayer() {
        if (!this._layer) return;

        this._layer.un('rendering-ended', this._onRenderingEnded);
        this._map.removeLayer(this._layer);
        this._layer = null;
    }

    /**
     * Called when the nativeApp mode has changed
     */
    async _onModeChange() {
        if (this._map) {
            this._unsetLayer();
            await this._setLayer();
            this.redraw();
        }
    }

    //implement passthrough methods and properties the underlying layer implements
    _setPassthrough(layer) {
        for (let funcName of [
            'featureModified',
            'getFeatureCollectionAtLatLng',
            'getFeatureCollectionInBounds',
            'getFeatureById'
        ]) {
            if (layer[funcName]) {
                this[funcName] = (...args) => layer[funcName](...args);
            } else {
                delete this[funcName];
            }
        }
    }
}

//passthroughs
for (let propName of ['featureRepresentations', 'styleManager', 'features']) {
    Object.defineProperty(ProxyLayer.prototype, propName, {
        get: function () {
            return this._layer?.[propName];
        }
    });
}

myw.ProxyLayer = ProxyLayer;
