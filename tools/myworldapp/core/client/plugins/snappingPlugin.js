// Copyright: IQGeo Limited 2010-2023
import { trace, Plugin, PluginButton, Util, MywClass } from 'myWorld-base';
import Collection from 'ol/Collection';
import olSnapInteraction from '../map/olSnapInteraction';
import MywVectorLayer from 'myWorld/layers/mywVectorLayer';

const { modifierKeyPressed } = Util.keyboardEvent;

export class SnappingPlugin extends Plugin {
    static {
        this.mergeOptions({
            snapDistance: 15, // in pixels
            snapVertices: true,
            enabled: true,
            minZoom: 15,
            layers: undefined, //if provided, only (visible) layers with code included in this list will be used for snapping
            excludeLayers: undefined //if provided, layers with code in this list will not be used for snappping, even when visible
        });

        // Actions to be used by map context menu
        this.prototype.actions = {
            toggle: {
                action: 'toggle',
                checked: 'isEnabled'
            }
        };
    }

    /**
     * @class Provides snapping when the user is digitizing geometries
     *        Uses visible layers for snapping guides
     * @param  {Application} owner                       The application
     * @param  {object}  [options]
     * @param  {number}[options.snapDistance=15]    Maximum distance in pixels for snapping to occur
     * @param  {boolean} [options.snapVertices=true]  If false, it won't snap to intermediate points in a line
     * @param  {boolean} [options.enabled=false]      If true, snapping will be enabled from the start
     * @param  {object}  [options.minZoom=15]         Minimum zoom level for snappping to be active
     * @param  {string[]} [options.layers]            If provided, only (visible) layers with code included in this list will be used for snapping
     * @param  {string[]} [options.excludeLayers]     If provided, layers with code in this list will not be used for snappping, even when visible
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        this._engines = {};

        this._engines['geo'] = new SnapEngine(this.app.map, this.app, this.options);
        if (this.options.enabled) this._engines['geo'].enable();

        this.app.on('new-map', e => {
            this._engines[e.map.worldType] = new SnapEngine(e.map, this.app, this.options);
            if (this.options.enabled) this._engines[e.map.worldType].enable();
        });
    }

    /**
     * Enables snappping
     */
    enable(map) {
        this._engines[map.worldType]?.enable();
    }

    /**
     * Disables snappping
     */
    disable(map) {
        this._engines[map.worldType]?.disable();
    }

    /**
     * @return {boolean} True if snapping is current enabled
     */
    isEnabled(map) {
        const engine = this._engines[map.worldType];
        return engine ? engine.isEnabled() : false;
    }

    toggle(map) {
        if (this.isEnabled(map)) this.disable(map);
        else this.enable(map);
    }

    getState() {
        //Only care about geo world in getting state as other maps (internal worlds) will be re-initialized
        return {
            enabled: this._engines['geo'].isEnabled()
        };
    }
}

export class SnapEngine extends MywClass {
    constructor(map, app, options) {
        super();
        this.map = map;
        this.app = app;
        this.options = options;
        this.snap = undefined; //snap plugin instance
        this._snapMarker = undefined; //marker that will be checked for proximity and sometimes added to map to show it's snapping
        this._snapReady = false;
        this._snapping = false;
        this._lastSnapLatlng = undefined;
        this._enabled = false;
        this._invisibleLayers = {};
        this._renderHandlerForLayer = {}; //keyed on layer code. handlers stored here to ensure unregistering uses the original handler (not a new function due to multiple bindings)
        this.features = {};

        [
            'checkStatus',
            'snappingStop',
            'resetSnappingGuides',
            'handleKeyDown',
            'handleKeyUp'
        ].forEach(method => (this[method] = this[method].bind(this)));
    }

    enable() {
        trace('snapping', 3, 'enable');
        //Start/stop snapping when a feature is edited/finished being edited
        this.map.on('geomdraw-enable', this.checkStatus);
        this.map.on('zoomend', this.checkStatus);
        this.map.on('geomdraw-disable', this.snappingStop);
        this.app.on('featureCollection-modified', this.handleFeatureChanges, this);

        //set handlers to disable snapping when Ctrl is pressed
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);

        this._enabled = true;
        this.checkStatus();
    }

    disable() {
        trace('snapping', 3, 'disable');
        this.map.off('geomdraw-enable', this.checkStatus);
        this.map.off('zoomend', this.checkStatus);
        this.map.off('geomdraw-disable', this.snappingStop);
        this.app.off('featureCollection-modified', this.handleFeatureChanges, this);

        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);

        this.snappingStop();
        this._enabled = false;
    }

    isEnabled() {
        return this._enabled;
    }

    checkStatus(e) {
        const inZoom = this.map.getZoom() >= this.options.minZoom;
        const hasSnapLayers = !!this.getSnapLayers().find(layer => layer.isVisible);
        const isUsable = hasSnapLayers && inZoom && this.map.isGeomDrawMode();

        trace('snapping', 5, `checkStatus: isUsable: ${isUsable}, snapping: ${this._snapping}`);
        if (isUsable && !this._snapping) this.snappingStart();
        else if (isUsable && this._snapping) this.resetSnappingGuides();
        else if (!isUsable) this.snappingStop();
    }

    isSnapping() {
        return this._snapping;
    }

    snappingStart() {
        trace('snapping', 4, `snapping start`);
        this._snapping = true;
        if (!this.snap) {
            //Initialise snap with no features - they get added later
            this.snap = new olSnapInteraction({
                features: new Collection(),
                pixelTolerance: this.options.snapDistance,
                map: this.map
            });
        }
        this.map.addInteraction(this.snap);

        this.resetSnappingGuides();

        //If a user switches a layer off during an edit, we need to reset the snapping guides
        this.app.on('overlayState-changed', this.checkStatus);
    }

    snappingStop() {
        if (!this._snapping) return;
        trace('snapping', 4, `snapping stop`);

        this._snapping = false;
        this.map.removeInteraction(this.snap);
        this.features = {};
        this.snap = null; //clears any leftover guides - required to handle deletions and helps with memory management

        this.resetSnappingGuides();
        Object.values(this._invisibleLayers).forEach(layer => this.map.removeLayer(layer));
    }

    handleKeyDown(event) {
        if (this._snapping && modifierKeyPressed(event)) {
            this.map.removeInteraction(this.snap);
            this._suspended = true;
        }
    }

    handleKeyUp(event) {
        if (this._snapping && this._suspended) {
            this.map.addInteraction(this.snap);
        }
    }

    /*
     * Calculates snap guides from the map's visible vector layers
     */
    resetSnappingGuides() {
        trace('snapping', 5, `resetSnappingGuides`);
        //Clear the snapping guides before adding new ones
        Object.values(this.features).forEach(feature => {
            if (!this.snap) return;
            this.snap.removeFeature(feature);
        });
        this.features = {};
        const layers = this.getSnapLayers();
        this.getMaplibLayersFor(layers).forEach(info => {
            const [layer, maplibLayer, onLayerRenderingEnded] = info;
            maplibLayer?.un('rendering-ended', onLayerRenderingEnded);
            if (layer.isVisible && this._snapping) {
                const featureReps = maplibLayer.featureRepresentations || {};
                this.updateSnapguides(Object.values(featureReps).flat());
                maplibLayer.on('rendering-ended', onLayerRenderingEnded);
            }
        });
    }

    /*
     * Obtains a list of layers to be used for snapping guides
     * Only returns myWorld layers.
     * Considers layers and excludeLayers from options
     */
    getSnapLayers() {
        const snappingLayerCodes = [];
        const datasource = this.app.database.getDatasource('myworld'); //Snapping only possible on myworld layers
        datasource.layerDefs.forEach(layerDef => {
            if (layerDef.snap) snappingLayerCodes.push(layerDef.code);
        });
        //Merge from options in js code and db
        const whitelistCodes = this.options.layers
            ? [...new Set(snappingLayerCodes.concat(this.options.layers))] //Merge and remove duplicates
            : snappingLayerCodes;
        const blacklistCodes = this.options.excludeLayers;
        return Object.values(this.map.layerManager.layers).filter(
            layer =>
                layer.datasource.name == 'myworld' &&
                (!whitelistCodes || whitelistCodes.includes(layer.layerDef.code)) &&
                (!blacklistCodes || !blacklistCodes.includes(layer.layerDef.code))
        );
    }

    /*
     * Obtains a list of pairs [layer, maplibLayer] to be used for snapping guides given a list of myWorld layers
     * For tiled layers, 'maplibLayer' will be a parallel, invisible layer so the vector layer code can be used to
     * obtain the geometries.
     * These invisible layers will have been added to the map.
     */
    getMaplibLayersFor(layers) {
        return layers.map(layer => {
            let maplibLayer = layer.maplibLayer;

            if (maplibLayer && !maplibLayer.featureRepresentations) {
                //not a vector layer
                //instead return an invisible vector layer that permits obtaining guides
                maplibLayer = this._getInvisibleLayerFor(layer);
            }
            const onLayerRenderingEnded = this._getRenderHandler(layer, maplibLayer);
            return [layer, maplibLayer, onLayerRenderingEnded];
        });
    }

    _getRenderHandler(layer, maplibLayer) {
        const code = layer.layerDef.code;
        if (!this._renderHandlerForLayer[code]) {
            this._renderHandlerForLayer[code] = this.onLayerRenderingEnded.bind(this, maplibLayer);
        }
        return this._renderHandlerForLayer[code];
    }

    /**
     * Returns a new or cached invisible maplib layer for a given overlay
     */
    _getInvisibleLayerFor(layer) {
        const key = layer.layerDef.code;
        let maplibLayer = this._invisibleLayers[key];
        if (layer.isVisible && !maplibLayer) {
            const datasource = layer.datasource;
            const layerDef = Object.assign({}, layer.layerDef, {
                rendering: 'vector',
                jsClass: MywVectorLayer, // force vector layer class - prevents custom geoserver classes from being obtained in createLayer
                nativeAppVector: {} //necessary to enable snapping of tiled layers in native app
            });
            maplibLayer = this._invisibleLayers[key] = datasource.createLayer(layerDef);
            maplibLayer.setOpacity(0);
        }
        if (layer.isVisible && this._snapping && maplibLayer && !maplibLayer.isVisible)
            this.map.addLayer(maplibLayer);
        return this._invisibleLayers[key];
    }

    /*
     * Adds snap guides from a list of myworld feature representations
     * @param {FeatureRepresentations} featureReps
     */
    updateSnapguides(featureReps) {
        //Snap hasn't yet been initialised
        if (!this.snap) return;
        trace('snapping', 6, `updateSnapguides`);
        featureReps.forEach(featureRep => {
            const olFeature = featureRep._olFeature;
            if (!olFeature) return;
            const urn = featureRep.feature.getUrn();
            if (!this.features[urn]) {
                trace('snapping', 10, `updateSnapguides adding ${urn}`);
                this.snap.addFeature(olFeature);
                this.features[urn] = olFeature;
            }
        });
    }

    //called when a layer signals it has finished rendering
    onLayerRenderingEnded(maplibLayer) {
        const featureReps = Object.values(maplibLayer.featureRepresentations).flat();
        this.updateSnapguides(featureReps);
    }

    /**
     * Handler for feature collection modified event
     * Informs invisible layers (if they have relevant feature types) that features have changed, so they can refresh
     */
    handleFeatureChanges(e) {
        //ENH: if e.feature is undefined, wait (around 1 sec?) for other events to avoid duplicate layer.redraw() calls
        Object.values(this._invisibleLayers).forEach(layer => {
            try {
                const layerFeatureTypes = layer.options.featureTypes.map(f => f.name);
                if (layerFeatureTypes.includes(e.featureType)) {
                    if (e.feature) layer.featureModified(e.changeType, e.feature);
                    else layer.redraw?.();
                }
            } catch (error) {
                const title = e.feature?.getTitle?.() ?? e.featureType;
                console.error(
                    `Updating layer '${layer.options.name}' for ${e.changeType} of '${title}':`,
                    error
                );
            }
        });
    }
}

class SnappingToggleButton extends PluginButton {
    static {
        this.prototype.id = 'snapping';
        this.prototype.className = 'snapping';
        this.prototype.imgSrc = 'images/actions/snapping.svg';
        this.prototype.titleMsg = 'snapping_button_title';
    }

    constructor(...args) {
        super(...args);
        this.owner.app.map.on('geomdraw-enable', () => {
            this.setActive(true);
            this.render();
        });
        this.owner.app.map.on('geomdraw-disable', () => {
            this.setActive(false);
        });
        this.setActive(this.app.map.isGeomDrawMode());
    }

    action() {
        this.owner.toggle();
        this.render();
    }

    render() {
        if (this.owner.isEnabled()) {
            this.titleMsg = 'button_disable_title';
            this.imgSrc = 'images/toolbar/snapping-active.svg';
        } else {
            this.titleMsg = 'button_enable_title';
            this.imgSrc = 'images/toolbar/snapping.svg';
        }
        this.setTitle(this.titleMsg);
        this.setImage(this.imgSrc);
    }
}

SnappingPlugin.prototype.buttons = {
    toggle: SnappingToggleButton
};

export default SnappingPlugin;
