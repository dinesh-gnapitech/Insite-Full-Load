// Copyright: IQGeo Limited 2010-2023
import { trace } from 'myWorld/base/trace';
import { Layer } from './layer';

export class Overlay extends Layer {
    /**
     * @class An overlay layer<br/>
     * Adds enabled/disabled and zoom level checks
     * Will fire 'overlayState-changed'
     * @param  {Datasource}                 datasource
     * @param  {layerDefinition}                layerDef        Layer definition
     * @param  {MapControl}                 map             Map on which the layer will be displayed
     * @constructs
     * @extends {Layer}
     */
    constructor(datasource, layerDef, map) {
        super(datasource, layerDef, map);

        /** Whether the map can be displayed on the map or not
         * @type {boolean}    */
        this.isEnabled = true;

        this._inZoomRange = this.isVisibleAtZoom(map.getZoom());

        this.initialized.finally(() => this._stateChanged());
    }

    _setupEventHandlers(layer) {
        super._setupEventHandlers(layer);

        //handlers for when state coming from layer
        if (layer && typeof layer.on == 'function') {
            layer.on('invalid', this._invalidate, this);
            layer.on('valid', this._validate, this);
        }
        //handler for datasource state change
        this.datasource.on('changed', this._handleDsChange, this);
        this.datasource.database.on('nativeAppMode-changed', this._handleDsChange, this);

        this.map.on('zoomend', () => {
            const inRange = this.isVisibleAtZoom(this.map.getZoom());
            if (inRange !== this._inZoomRange) {
                this._inZoomRange = inRange;
                this._stateChanged();
            }
        });
    }

    /**
     * Sets the desired visibility of the layer
     * The layer may not actually become visible, for example, if it's not in configured zoom range
     * @param {boolean} desiredVisibility
     */
    setVisibility(desiredVisibility) {
        this.setCheckedStatus(desiredVisibility);

        return this.initialized
            .then(() => {
                if (this.datasource.isInvalid) {
                    this._invalidate();
                } else if (this.isChecked) {
                    return this.datasource.ensureLoggedIn().then(this._validate.bind(this));
                }
            })
            .catch(e => {
                this._invalidate();
                trace(
                    'layers',
                    2,
                    'Unable to set visibility of layer: ',
                    this.getName(),
                    '. Datasource not logged in.'
                );
            })
            .then(() => this._stateChanged());
    }

    /**
     * Updates the isChecked flag which refers to the checkbox state in the layerControl
     * @param {boolean} checked Whether the checkbox in the layerControl is checked or not
     */
    setCheckedStatus(checked) {
        this.isChecked = checked === true;
    }

    /**
     * Set clip geometry on the layer if the layer supports it
     * @param  {polygonGeometry[]} geometries  GeoJSON geometries to clip by
     * See comments for ClippedTileLayer.setClipGeometry() for more information
     */
    setClipGeometry(geometries) {
        this.maplibLayer?.setClipGeometry?.(geometries);
    }

    /**
     * Updates self's visibility according to current state
     * Should be called whenever any state property changes (checked, inZoomRange, invali...d)
     * @fires overlayState-changed
     * @private
     */
    _stateChanged() {
        this.isEnabled = this._inZoomRange && !this.isInvalid;

        const wasVisible = this.isVisible;
        const visible = this.isChecked && this._inZoomRange; //invalid layer should still be added to the map so it can track basemap changes
        if (visible !== wasVisible) {
            this._setVisibility(visible);
        }

        this.map.app.fire('overlayState-changed', { map: this.map, layer: this });
    }

    _handleDsChange(event) {
        const isOk = this.datasource.isOk(this.getName());

        if (isOk) this._validate();
        else this._invalidate();

        if (isOk && this.isVisible) this.redraw();
    }

    /**
     * Sets the actual visibility of the layer by adding or removing it from the map
     * @param {boolean} desiredVisibility
     * @private
     */
    _setVisibility(visible) {
        this.isVisible = visible;
        if (!this.maplibLayer) return;

        if (visible) {
            this.map.addLayer(this.maplibLayer);
        } else {
            this.map.removeLayer(this.maplibLayer);
        }
    }

    /**
     * Sets the layer as invalid
     * @private
     */
    _invalidate() {
        const changed = !this.isInvalid;
        this.isInvalid = true;
        if (changed) this._stateChanged();
    }

    /**
     * Sets the layer as valid
     * @private
     */
    _validate() {
        const changed = this.isInvalid;
        this.isInvalid = false;
        if (changed) this._stateChanged();
    }
}

export default Overlay;
