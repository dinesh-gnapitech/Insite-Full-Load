// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Plugin, Util } from 'myWorld-base';
import { Layer } from 'myWorld/layers/layer';
import { OverviewMap } from 'ol/control';

/**
 * Options for {@link MinimapPlugin}
 * @typedef minimapOptions
 * @property {boolean} enabled          If it is set to false, the minimap wont be initialized or shown on the map
 * @property {boolean} minimized        Governs if the minimap will be minimized when you first load the app
 * @property {Array<string>} excludedLayerClasses   List of classes that don't work well as an overview map
 */

export class MinimapPlugin extends Plugin {
    static {
        this.mergeOptions({
            enabled: true, // If false, the minimap won't be initialized or shown on the map
            minimized: false, // Governs if the minimap will be minimized when you first load the app
            excludedLayerClasses: ['BlankLayer', 'MywVectorLayer']
        });

        /**
         * Actions to be used by map context menu
         */
        this.prototype.actions = {
            toggle: {
                action: 'toggle',
                checked: 'enabled'
            }
        };
    }

    /**
     * Initializes the plugin and sets its event handlers
     * @class  A plugin to display the overview map using Open Layers minimap control. <br/>
     * Listens for the baselayerchange event and updates the minimap control with the current baselayer. <br/>
     * Minimap view options can be customized on a sytem level using the config settings and on application level in the application class
     * @param  {Object}         owner   The application
     * @param  {minimapOptions} options Configuration options for the minimap plugin
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.setOptions(this.app.system.settings['core.plugin.minimap']); // Merges in the options from config settings

        this.layers = [];
        this.map = this.app.map;

        if (this.options.enabled && !this.app.isHandheld) {
            this.enable();
        } else {
            this.enabled = false;
        }
    }

    /**
     * Adds the minimap control to the application's geographical map
     */
    async enable() {
        this.enabled = true;

        const basemapName = this.map.getCurrentBaseMapName();
        if (basemapName) await this.updateMinimapForLayer(basemapName);
        this.initiateEventHandlers();
    }

    initiateEventHandlers() {
        this.map.on('baselayerchange', this._updateMinimapForLayerChange.bind(this));

        this.app.on('new-geo-map', event => {
            this.map = event.map;

            if (this.minimapCtrl) {
                //remove handler on old map
                this.map.off('baselayerchange', this._updateMinimapForLayerChange.bind(this));
                this.minimapCtrl = null; //will be recreated
                //set handler on new map
                event.map.on('baselayerchange', this._updateMinimapForLayerChange.bind(this));
            }
        });
    }

    /**
     * Removes the minimap control from the application's geographical map
     */
    disable() {
        this.enabled = false;
        this.map.off('baselayerchange', this._updateMinimapForLayerChange.bind(this));
        if (this.minimapCtrl) this.map.removeControl(this.minimapCtrl);
        this.minimapCtrl = null; //will be recreated
    }

    _updateMinimapForLayerChange(event) {
        if (!this.enabled) return;
        return this.updateMinimapForLayer(event.layer.display_name);
    }

    /**
     * Adds a minimap control for the layer, if a minimap already exists, it updates its layer
     * @param {string}         layerName Name of the layer to be shown in the minimap view
     */
    async updateMinimapForLayer(layerName) {
        const layersDefs = await this.app.getLayersDefs();
        const layerDef = layersDefs.find(
            l => l.category === 'basemap' && l.display_name === layerName
        );
        const datasource = this.app.database.getDatasource(layerDef.datasource);
        const layer = new Layer(datasource, layerDef);
        await layer.initialized;
        let isIncompatible;
        isIncompatible =
            layer &&
            this.options.excludedLayerClasses.some(excLayerClassExpr => {
                const excLayerClass = Util.evalAccessors(excLayerClassExpr);
                return excLayerClass && layer instanceof excLayerClass;
            });
        if (isIncompatible) {
            if (this.minimapCtrl) this.disable();
            return;
        }
        //it's compatible
        this.map.removeControl(this.minimapCtrl); //Remove old minimap (no option to update layer in openlayers minimap)
        this.createMinimap(layer.maplibLayer);
        const minimap = this.minimapCtrl.getOverviewMap();

        //need to call onAdd directly as overview map is not an instance of MapControl
        let handled = false;
        if (typeof layer.maplibLayer.onAdd == 'function')
            handled = layer.maplibLayer.onAdd(minimap);
        if (!handled) minimap.addLayer(layer.maplibLayer);

        const baseMapName = this.map.getCurrentBaseMapName();
        //ENH: Provide a way of specifying a position (eg 'bottom-left') and then having the location be worked out
        if (baseMapName.includes('Google')) {
            const basemap = this.map.baseMaps[baseMapName];
            $('.ol-overviewmap').css('bottom', basemap.layerDef.attribution ? '6em' : '4em');
        } else {
            $('.ol-overviewmap').css('bottom', '4em');
        }
    }

    /**
     * Creates an instance of the minimap with the layer supplied to it.
     */
    createMinimap() {
        const isCollapsed = this.minimapCtrl
            ? this.minimapCtrl.getCollapsed()
            : this.options.minimized;
        this.minimapCtrl = new OverviewMap({
            collapseLabel: '\u00BB',
            label: '\u00AB',
            collapsed: isCollapsed
        });

        //view needs to be constrained to integer zoom levels because GoogleSource doesn't support fractional zoom levels
        this.minimapCtrl.getOverviewMap().getView().setConstrainResolution(true);
        this.map.addControl(this.minimapCtrl);
    }

    /**
     * Returns state to be included in map link denoting the display state of the minimap
     * @return {string}   "close" if its minimized, "open" if its not minimized
     */
    getStateForAppLink() {
        if (this.minimapCtrl) {
            const displayState = this.minimapCtrl.getCollapsed() ? 'close' : 'open';
            return displayState;
        }
    }

    /**
     * Called by the application on startup if there has been an url parameter specified for self.
     * @param  {string}     param   Value of the url parameter for this plugin.
     *                              If 'close', minimap will be minimized
     */
    setStateFromAppLink(param) {
        const minimized = param === 'close';
        this.options.minimized = minimized;
    }

    /**
     * Sets the current state of the plugin
     * @param {object} state
     * @param {boolean} state.enabled Whether the minimap is enabled or not
     * @param {boolean} state.minimized Whether the minimap is minimized or not
     */
    setState(state) {
        if (this.minimapCtrl) this.minimapCtrl.setCollapsed(state.minimized);
        else this.options.minimized = state.minimized;
        if (state.enabled === true) {
            this.options.minimized = false;
            this.enable();
        }
        if (state.enabled === false) {
            this.options.minimized = true;
            this.disable();
        }
    }

    /**
     * Returns object with current state details <br/>
     * @return {object}
     * @param {boolean} state.enabled Whether the minimap is enabled or not*
     * @param {boolean} state.minimized Whether the minimap is minimized or not
     */
    getState() {
        return {
            enabled: this.enabled,
            minimized: this.minimapCtrl?.getCollapsed()
        };
    }

    /**
     * Toggles enabled state of the plugin.
     * If the minimap control is on the map, removes it.
     * If the minimap control is not on the map, adds it
     * @return {boolean} Whether the control is now enabled or not
     */
    toggle() {
        const wasEnabled = this.enabled;
        if (wasEnabled) {
            this.options.minimized = true;
            this.disable();
        } else {
            this.options.minimized = false;
            this.enable();
        }
        return !wasEnabled;
    }
}

export default MinimapPlugin;
