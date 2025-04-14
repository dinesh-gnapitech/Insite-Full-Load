// Copyright: IQGeo Limited 2010-2023
import myw, { MywClass, msg } from 'myWorld/base';

export class Layer extends MywClass {
    /**
     * @class A layer to display data from a datasource on a map<br/>
     * Composed of a map library's layer instance and additional behaviour such as:
     * name, validity, enabled/disabled, visibility, datasource
     * @param  {Datasource}                 datasource
     * @param  {layerDefinition}                layerDef        Layer definition
     * @constructs
     */
    constructor(datasource, layerDef, map) {
        super();
        /** Datasource for this layer
         * @type {IDatasource}    */
        this.datasource = datasource;

        /** layer definition
         * @type {layerDefinition} */
        this.layerDef = layerDef;

        /** this is the map associated with the layers
         * @type {MapControl} */
        this.map = map;
        this._added = false; //is the layer currently added to the map

        /** Whether this layer is visible on the map or not
         * @type {boolean}    */
        this.isVisible = false;

        /** Corresponding OpenLayers layer instance
         * @type {boolean}    */
        this.maplibLayer = null;

        /** Whether this layer has been correctly initialized or not
         * @type {boolean}    */
        //assume invalid until we're sure it's valid - datasources may take a long time to initialize
        //and the layer should be unavailable until it does
        this.isInvalid = true;

        /** Promise to resolve when the layer is successfuly initialized
         * @type {Promise} */
        this.initialized = datasource.initialized
            .then(() => datasource.createLayer(layerDef, map))
            .then(maplibLayer => {
                this.maplibLayer = maplibLayer;
                this.isInvalid = !maplibLayer;

                maplibLayer?.getSource?.()?.setAttributions(layerDef.attribution);

                this._setupEventHandlers();

                return maplibLayer;
            })
            .catch(reason => {
                this.isInvalid = true;
                console.log(`Error instantiating layer '${layerDef.name}'. Reason: `, reason);
            });
    }

    _setupEventHandlers(maplibLayer) {
        //handlers for when state coming from layer
        if (maplibLayer && typeof maplibLayer.on == 'function') {
            maplibLayer.on('rendering-started', this._renderStarted, this);
            maplibLayer.on('rendering-ended', this._renderEnded, this);
        }
    }

    /*
     * Informs the application that rendering for self has started
     */
    _renderStarted() {
        if (this._added && !this._rendering) {
            this.map.app.statusBusy('render_map', msg('MapControl', 'drawing_map_status'));
            this._rendering = true;
            this.datasource.system.recordDataAccess(
                this.datasource.database.applicationName,
                `layer.${this.getName()}`
            );
        }
    }

    /*
     * Informs the application that rendering for self has finished
     */
    _renderEnded() {
        if (this._rendering) {
            this.map.app.statusDone('render_map');
            this._rendering = false;
        }
    }

    /**
     * Sets the actual visibility of the layer by adding or removing it from the map
     * @param {boolean} visible
     * @private
     */
    _setVisibility(visible) {
        if (!this.maplibLayer) {
            this.isVisible = false;
            return;
        }

        this.isVisible = visible;

        if (visible) {
            this.map.addLayer(this.maplibLayer);
        } else {
            this.map.removeLayer(this.maplibLayer);
        }
    }

    /**
     * Whether the layer is visible on the map at the given zoom level, based on it's config
     * @param {number}z Zoom level
     * @returns {boolean}
     */
    isVisibleAtZoom(z) {
        return z >= this.layerDef.min_scale && z <= this.layerDef.max_scale;
    }

    /**
     * Returns the one character that identifies an overlay layer
     * @returns {character}
     */
    getCode() {
        return this.layerDef.code;
    }

    /**
     * returns the name of this layer.
     * @returns {string}
     */
    getName() {
        return this.layerDef.name;
    }

    /**
     * returns the description of this layer.
     * @returns {string}
     */
    getDescription() {
        const desc = this.layerDef.description;
        return desc ? desc : '';
    }

    /**
     * returns the image filename of the thumbnail representing this layer.
     * @returns {string}
     */
    getThumbnail() {
        return this.layerDef.thumbnail;
    }

    onAdd(map) {
        if (map != this.map) console.warn(`Creation map doesn't match onAdd map`);
        this._added = true;
        this.onAddPromise = this.initialized.then(() => {
            //layer may have been removed from map while waiting for initialization
            if (this._added && this.maplibLayer) {
                map.addLayer(this.maplibLayer);
                const source = this.maplibLayer.getSource();
                if (source && map.options.crossOrigin) {
                    //set source's crossOrigin to values specified in map's options
                    //used for screenshot functionality
                    source.crossOrigin = map.options.crossOrigin;
                }
            }
        });
        return true; //handled
    }

    onRemove(map) {
        if (map != this.map) console.warn(`Creation map doesn't match onRemove map`);
        this._added = false;
        this.initialized.then(() => {
            if (this.maplibLayer) map.removeLayer(this.maplibLayer);
        });
        return true; //handled
    }

    /**
     * Refreshes the layer visualization on the map
     */
    redraw() {
        if (!this.maplibLayer) return;

        if (typeof this.maplibLayer.redraw == 'function') {
            return this.maplibLayer.redraw();
        } else {
            this.maplibLayer.getSource?.()?.refresh();
            this._setVisibility(false);
            this._setVisibility(true);
        }
    }

    /**
     * Called when a feature on layer has been modified. Refreshes the layer.
     * @param  {string}         type    Feature type
     * @param  {Feature|Feature[]}    feature
     */
    featureModified(type, feature) {
        // featureModified is not part of OpenLayers Layer interface so no guarantees
        // it will be defined on arbitary layer so check it is defined.
        if (feature && this.maplibLayer.featureModified) {
            if (Array.isArray(feature)) {
                for (const aFeature of feature) {
                    this.maplibLayer.featureModified(type, aFeature);
                }
            } else {
                this.maplibLayer.featureModified(type, feature);
            }
        } else if (this.isVisible) {
            //redraw whole layer
            this.redraw();
        }
    }

    /**
     * Returns the mode in which this layer is being displayed: 'local' or 'master'
     * Only applies to native app. Returns undefined if not in native app
     * @return {string|undefined}
     */
    appViewMode() {
        const ds = this.datasource;

        if (myw.isNativeApp) {
            const mode = ds.supportsReplication ? ds.modeForLayer(this.getName()) : 'master';

            return mode;
        }
    }

    getMinZoom() {
        //in OL, minZoom of layers (not views) is exclusive, so we have subtracted 1 when setting the value for the layer and now need to add it for our range caculations
        return this.layerDef.options.minZoom + 1;
    }

    getMaxZoom() {
        return this.layerDef.options.maxZoom;
    }

    setZIndex(index) {
        this.layerDef.options.zIndex = index;
        this.maplibLayer?.setZIndex(index);
    }
}

export default Layer;
