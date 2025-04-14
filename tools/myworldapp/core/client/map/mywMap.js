import MapInteractionMode from './mapInteractionMode';
import LayerManager from 'myWorld/layers/layerManager';
import { latLng, LatLng } from 'myWorld/base/latLng.js';
import { latLngBounds } from 'myWorld/base/latLngBounds.js';
import { Feature } from 'myWorld/features';
import { GeomDrawMode } from './geomDrawMode';
import { SelectionMode } from './selectionMode';

const defaultOptions = {
    selectTolerance: 8, //in pixels
    touchSelectTolerance: 13, //in pixels
    contextmenuWidth: 160
};

/**
 * myWorld additional map behaviour
 * Specifically, adds support for feature highlighting, better basemap control, single-click event, context-menu interaction mode stack
 * @name MywMap
 * @mixin
 */
export const MywMap = {
    // Actions available to context menu
    actions: {
        refresh: {
            action: 'redraw'
        },
        copyCoordinate: {
            action: '_copyCoordinate'
        },
        clearSelection: {
            action: '_clearSelection'
        },
        multipleSelect: {
            action: '_toggleMultipleSelect',
            checked: 'multipleSelect'
        }
    },

    //####################################### Initialisation ############################################
    initMywMap(owner, worldId, mapOptions) {
        this.options = { ...defaultOptions, ...mapOptions };
        if (mapOptions.center) this.setView(mapOptions.center);
        if (mapOptions.zoom) this.setZoom(mapOptions.zoom);

        /** Name of the world self is displaying. "geo" means geographic world
         * @type {string} */
        this.worldId = worldId;

        /** Type of world self is displaying.
         * @type {string} */
        this.worldType = (worldId || '').split('/')[0];

        /** Highlight representations of features on the map. Keyed on urn
         * @type {Object<FeatureRepresentation>} */
        this.featureRepresentations = {};

        /**  Available background maps. Keyed on layer name.
            @type {Object<Layer>} */
        this.baseMaps = {};

        this._currentBaseMap = null;
        this._currentBaseMapName = null;

        // holds the interaction modes as a stack so that we can swap back to the previous one
        // initialized with a default mode doesn't do anything on map click
        this._interactionModeStack = [new MapInteractionMode(this)];

        /** the myWorld application instance of which self is part of
         * @type {Application} */
        this.app = owner.app;

        /** owner of the app, normally the Application but can be a control (i.e. InternalsControl)
         * @type {Application|Control} */
        this.owner = owner;

        /** Deals with layers
         * @type {LayerManager} */
        this.layerManager = new LayerManager(this, {});

        this._setUpMywEventHandlers();
    },

    _setUpMywEventHandlers() {
        //ENH: optimize for filter event?
        this.app.on(
            'currentFeature-changed currentFeatureSet-changed currentFeatureSet-filtered',
            this.handleCurrentFeatureSet.bind(this)
        );

        this.app.on('highlight-feature', e => {
            this.highlightFeature(e.feature);
        });

        this.app.on('unhighlight-feature', e => {
            this.unHighlightFeature(e.feature);
        });

        this.app.on('database-view-changed', e => this.redraw());

        this.on('single-click', event => {
            const latlng = latLng(event.lngLat);
            this.handleMapClick({ ...event, latlng });
        });

        this.on('baselayerchange', e => {
            this.handleBaseMapChange(e.layer.display_name);
        });

        this.on('ctrldragbox-end', this.handleCtrlDragBox, this);

        this.on('feature-mouseover', this.handleFeatureMouseover, this);
    },

    /**
     * Sets the world identifier for the map
     * Usefull mostly for internal worlds
     * @param {string} worldId
     */
    setWorld(worldId) {
        this.worldId = worldId;
        this.removeFeatureReps(Object.values(this.featureRepresentations).map(f => f.feature));
        this._currentFeatureSet = null;
        this._currentFeature = null;
    },

    //################################### Selection *******************************
    /**
     * Returns the select tolerance in pixels
     * Considers application's touch style mode
     */
    getSelectTolerance() {
        return this.app.useTouchStyles
            ? this.options.touchSelectTolerance
            : this.options.selectTolerance;
    },

    /**
     * Obtains the features selectable at a given location.
     * Sends a selection request to the database and additional requests to any layers that provide an external selection
     * @param  {LatLng}   selectionPoint    LatLng selected by the user
     * @param  {object}     options
     * @param  {number}    [options.zoomLevel]       Zoom level to use when calculating a radius. Default is current zoom level of the map
     * @param  {number}    [options.pixelTolerance]  Tolerance in pixels to use when calculating a radius. Default is 8 (or 13 for touch devices)
     * @param  {string[]}   [options.featureTypes]    Feature types to consider. Any others are ignored
     * @returns {Promise<Array<Feature>>} Features selectable at the provided point
     */
    selectFeatures(selectionPoint, options = {}) {
        const {
            zoomLevel = Math.round(this.getZoom()),
            pixelTolerance = this.getSelectTolerance(),
            featureTypes
        } = options;
        const worldId = this.worldId == 'geo' ? null : this.worldId;
        const layers = this.getVisibleLayers();

        return this.app.database.select(selectionPoint, zoomLevel, pixelTolerance, layers, {
            worldId,
            featureTypes
        });
    },

    /**
     * Sends a selection request to the database to the select_within service to select all features within the geom
     * @param {LatLngBounds} latLngBounds
     * @param  {object}     options
     * @param  {string[]}   [options.featureTypes]    Feature types to consider. Any others are ignored
     */
    selectBox(latLngBounds, options) {
        const worldId = this.worldId == 'geo' ? null : this.worldId;
        const layers = this.getVisibleLayers();

        const zoomLevel = Math.round(this.getZoom());
        return this.app.database.selectBox(latLngBounds, zoomLevel, layers, {
            worldId,
            ...options
        });
    },

    /**
     * Returns an array currently displayed overlay layers
     * @return {array<Layer>}
     */
    getVisibleLayers() {
        return this.layerManager.getVisibleLayers(this.getZoom());
    },

    /**
     * Returns an array of ids describing the currently displayed overlay layers
     * The layer has to be turned on and the configuration for the layer has to match the current zoom level
     * @return {string[]} List with ids(codes) of the layers
     */
    getVisibleLayerIds() {
        const visibleLayers = this.getVisibleLayers();
        //get codes and remove empty codes
        return visibleLayers.map(layer => layer.getCode()).filter(Boolean);
    },

    /**
     * Returns an array of ids describing the currently turned ON overlay maps
     * @return {string[]} List with ids(codes) of the layers
     */
    getCurrentLayerIds() {
        return this.layerManager.getCurrentLayerIds();
    },

    //################################### Editing ##################################

    /**
     * Returns true if the current map interaction mode is for rotating geometries
     */
    isGeomRotateMode() {
        return !!this.currentInteractionMode().isGeomRotate;
    },

    /**
     * Returns true if the current map interaction mode is for drawing geometries
     */
    isGeomDrawMode() {
        return !!this.currentInteractionMode().isGeomDraw;
    },

    /**
     * Returns true if the current map interaction mode is for read only
     */
    isReadOnlyMode() {
        return !!this.currentInteractionMode().isReadOnly;
    },

    /**
     * Enables geom edit mode for a given feature
     * It doesn't do anything if the feature is not configured to be editable in self's world
     * @param {DDFeature} feature
     * @param {object} [options]
     * @param {geojsonCoordinates} [options.coordinates] Coordinates of initial geometry. Defaults to the feature's geometry coordinates
     */
    enableGeomDrawModeFor(feature, options) {
        if (!feature.isEditableInWorld(this.worldId)) return;
        return this.enableGeomDrawMode(feature, options);
    },

    /*
     * Enables geom edit mode for a given feature
     * Assumes feature is supposed to be editable in self's world
     * @param {DDFeature} feature
     * @param {object} [options]
     * @param {string}             [options.fieldName] Name of geometry field to edit
     * @param {geojsonCoordinates} [options.coordinates] Coordinates of initial geometry. Defaults to the feature's geometry coordinates
     */
    enableGeomDrawMode(feature, options = {}) {
        const { fieldName, coordinates } = options;
        const geomFieldName = fieldName ?? feature.getGeometryFieldNameForWorld(this.worldId);
        const ddGeomType = feature.getDDGeometryType(geomFieldName);
        const geom = feature.getGeometry(geomFieldName);

        //Return if geomtype is 'multi', unless initial coordinates are provided (used outside core)
        if (!coordinates && geom && ddGeomType.toLowerCase() !== geom.type.toLowerCase()) {
            console.warn(`Unable to edit geometry with type ${geom.type}`);
            return;
        }

        if (this.isGeomDrawMode()) return;

        const orientationFieldName = `myw_orientation_${geomFieldName}`;
        const rotatable = Object.prototype.hasOwnProperty.call(
            feature.featureDD.fields,
            orientationFieldName
        );

        this.geomDrawFieldName = geomFieldName;
        this.geomDrawMode = new GeomDrawMode(this, { geomType: ddGeomType, rotatable });
        this.setInteractionMode(this.geomDrawMode);
        if (geom) {
            const rotation = feature.properties[orientationFieldName];
            this.geomDrawMode.setFeatureCoords(
                coordinates ?? geom.coordinates,
                rotatable,
                rotation
            );
            this.getFeatureRepFor(feature).removeFromMap(); //Remove featureRep from map as geomDrawMode creates its own overlay
        }
    },

    /**
     * Disable edit mode for map
     */
    disableEditMode() {
        if (this.isGeomRotateMode()) this.disableGeomRotateMode();

        if (this.isGeomDrawMode() || this.isReadOnlyMode()) {
            this.endCurrentInteractionMode();
            this.geomDrawMode = null;
        }
    },

    /**
     * Activates geometry rotating mode when we are editing a geometry
     */
    enableGeomRotateMode() {
        if (!this.geomDrawMode) return;
        if (this.isGeomRotateMode()) return;
        this.geomDrawMode.activateGeomRotateMode();
    },

    /**
     * Disables the GeomRotateMode, going back to previous mode
     */
    disableGeomRotateMode() {
        if (!this.geomDrawMode) return;
        if (!this.isGeomRotateMode()) return;
        this.geomDrawMode.endGeomRotateMode();
    },

    //####################################### Basemap and view ############################################

    /** Sets the current basemap */
    async setCurrentBaseMap(baseMapName) {
        const curBaseMap = this.getCurrentBaseMap();
        const newBaseMap = this.baseMaps[baseMapName] || Object.values(this.baseMaps)[0]; //Bookmark may reference a basemap inaccessible to the user
        if (newBaseMap && curBaseMap != newBaseMap) {
            //first remove the current base map

            if (curBaseMap) {
                this.removeLayer(curBaseMap);
                if (curBaseMap.onRemovePromise) await curBaseMap.onRemovePromise;
            }

            this._currentBaseMapName = baseMapName;
            this._currentBaseMap = newBaseMap;
            this.addLayer(this._currentBaseMap, true);
            if (newBaseMap.onAddPromise) await newBaseMap.onAddPromise;

            //leaflet fires the event if the change is originated from its layer control
            //if the change is originated by calling this method the event should also be fired
            this.fireEvent('baselayerchange', { layer: newBaseMap });
        }
    },

    /**
     *  Handles a user changing the baseMap when he clicks the Layer control
     *  Updates internal currentBaseMap variables to keep track of the change
     */
    handleBaseMapChange(baseMapName) {
        this._currentBaseMapName = baseMapName;
        this._currentBaseMap = this.baseMaps[baseMapName];
    },

    /** get the current baseMap name */
    getCurrentBaseMapName() {
        return this._currentBaseMapName;
    },
    /** get current basemap info */
    getCurrentBaseMap() {
        return this._currentBaseMap;
    },

    setCurrentMapViewParameters(aView) {
        // Set current map view with given aView
        const latlng = aView['center'];
        this.setView(latlng, aView['zoom']);
    },

    /**
     * @return {Object} keys: center, zoom
     */
    getMapViewParameters() {
        return {
            center: this.getCenter(),
            zoom: this.getZoom()
        };
    },

    //####################################### Current Feature(Set) representations ############################################

    // update current featureSet representations
    handleCurrentFeatureSet(e) {
        const app = this.app;
        const feature = app.currentFeature;

        //handle representation of feature set
        const newFeatures = app.currentFeatureSet.items;
        if (newFeatures !== this._currentFeatureSet) {
            //feature set (or filter) is changing, not just current feature
            this.removeFeatureReps(Object.values(this.featureRepresentations).map(f => f.feature));
            this.createFeatureReps(newFeatures, null);
            this._currentFeatureSet = newFeatures;
        }

        //handle representation of current feature
        if (feature != this._currentFeature) {
            if (this._currentFeature) this.unHighlightFeature(this._currentFeature);
            this._currentFeature = feature;
        }
        const isWorldOwner = feature?.isWorldOwner(this.worldId);
        if (feature && !isWorldOwner) this.highlightFeature(feature);

        if (e.zoomTo) this.zoomTo(feature);
    },

    /**
     * Highlights a feature on the map. (using default highlight style)
     * Creates a representation if necessary
     * @param  {Feature} feature
     */
    highlightFeature(feature) {
        const urn = feature.getUrn(true, true);
        let featureRep = this.featureRepresentations[urn];
        if (!featureRep) {
            //create a feature representation and display it on the map view
            featureRep = this.createFeatureRep(feature);
        }
        // highlight if visible on map
        if (featureRep) featureRep.highlight();
    },

    /**
     * Removes the highlighting of a feature from the map
     * @param  {Feature} feature
     */
    unHighlightFeature(feature) {
        const urn = feature.getUrn(true, true);
        const featureRep = this.featureRepresentations[urn];
        if (!featureRep) return;

        featureRep.unHighlight();
        const isPartOfCurrentSet = !!this.app.currentFeatureSet.getFeatureByUrn(urn);
        if (!isPartOfCurrentSet) this.removeFeatureReps([feature]);
    },

    /**
     * Creates a set of feature representations and adds them to the map
     * @param  {Array<Feature>}     features        Features to represent on the map
     * @param  {styleDefinition}           styles          The styles to be applied to the {@link FeatureRepresentation}
     * @return {Array<FeatureRepresentation>}  Representations for the features
     */
    createFeatureReps(features, styles) {
        const featureReps = [];
        for (let feature of features) {
            const isWorldOwner = feature?.isWorldOwner(this.worldId);
            if (isWorldOwner) return; //we don't want a feature rep for the world owner (we just get a blue polygon covering everything)

            const rep = this.createFeatureRep(feature, styles);
            if (rep) {
                featureReps.push(rep);
            }
        }
        return featureReps;
    },

    /**
     * Creates a map representation for a given feature and adds it to the map view. <br/>
     * If feature has geometry in the world this map is looking at, then use that geometry. Otherwise
     * find an owning feature that does have geometry in this world <br/>
     * @param  {Feature}            feature       The feature to display on the map
     * @param  {styleDefinition}        styles        The styles to be applied to the {@link FeatureRepresentation}
     * @return {Array<FeatureRepresentation>}  Representations for the features
     */
    createFeatureRep(feature, styles) {
        const mapWorldId = this.worldId;
        let rep;

        //check if styles are overridden in feature model
        styles = feature.getCurrentFeatureStyleDef(this) || styles;

        const geom = feature.getGeometryInWorld(mapWorldId);
        if (geom) {
            rep = this._createFeatureRep(feature, styles);
            if (rep) {
                const tooltip = feature.tooltip ? feature.tooltip() : this._getTooltipFor(feature);
                rep.bindTooltip(tooltip);
            }
            return rep;
        } else if (mapWorldId == 'geo') {
            // We do not attempt to navigate up containment hierarchy to find 'geo' position because
            // internals features should have had a geo_geometry value provided by the server.
        } else {
            //ENH: Create feature representation for owner of self in this world using containement hierarchy provided by server (as per geo_geometry)
            //Doing it from client will be innefective if a lot of features are being highlighted
        }
    },

    /**
     * Creates a map representation for a given feature and adds it to the map view. <br/>
     * It is assumed that the feature has a geometry in this world
     * @param  {Feature}            feature       The feature to display on the map
     * @param  {styleDefinition}        styles        The styles to be applied to the {@link FeatureRepresentation}
     * @return {Array<FeatureRepresentation>}  Representations for the features
     * @private
     */
    _createFeatureRep(feature, styles) {
        const urn = feature.getUrn(true, true);
        let featureRep = this.featureRepresentations[urn];
        const options = {
            styles,
            worldName: this.worldId,
            paneName: 'svgs',
            vectorSource: this._currentSetSource
        };
        if (!featureRep) {
            featureRep = new this.options.FeatureRepresentation(feature, options);
        }

        return this.addFeatureRep(featureRep);
    },

    /**
     * Adds an existing feature representation to the map
     * @param {FeatureRepresentation} featureRep
     * @return {Array<FeatureRepresentation>}  Representations for the features
     */
    addFeatureRep(featureRep) {
        const urn = featureRep.feature.getUrn(true, true);
        this.featureRepresentations[urn] = featureRep;
        featureRep.addToMap(this);
        return featureRep;
    },

    /**
     * Remove from the map the representations for FEATURES
     * @param  {Array<Feature>} features features to remove from the map
     */
    removeFeatureReps(features) {
        const reps = this.featureRepresentations;
        let urn;
        for (let feature of features) {
            urn = feature.getUrn(true, true);
            const rep = reps[urn];
            if (rep) {
                delete reps[urn];
                rep.removeFromMap();
            }
        }
    },

    /**
     * @param  {Feature} feature
     * @return {FeatureRepresentation} Representation of FEATURE in self
     */
    getFeatureRepFor(feature) {
        if (!feature) return;
        const urn = feature.getUrn(true, true);
        let rep = this.featureRepresentations[urn];
        if (!rep) rep = this.createFeatureRep(feature);
        return rep;
    },

    /**
     * Pan and zoom the map to given feature
     * When zooming to a point geometry, it will set the zoom to 18 unless the current zoom
     * is already higher than that
     * @param  {string|Feature|FeatureRepresentation} featureOrfeatureUrn The feature (or its id) to zoom to. Urn should only be used if feature is already represented on the map
     */
    zoomTo(featureOrfeatureUrn) {
        const prevZoomLevel = this.getZoom();
        let featureRep;

        if (featureOrfeatureUrn instanceof this.options.FeatureRepresentation) {
            featureRep = featureOrfeatureUrn;
        } else if (typeof featureOrfeatureUrn == 'string') {
            featureRep = this.featureRepresentations[featureOrfeatureUrn];
        } else if (featureOrfeatureUrn instanceof Feature) {
            featureRep = this.featureRepresentations[featureOrfeatureUrn.getUrn(true, true)];
            if (!featureRep && featureOrfeatureUrn.getGeometryInWorld(this.worldId)) {
                const options = {};
                options.worldName = this.worldId;
                featureRep = new this.options.FeatureRepresentation(featureOrfeatureUrn, options);
            }
        }

        if (featureRep) {
            const bounds = featureRep.feature.bounds;
            if (bounds) {
                this.fitBounds([
                    [bounds[0], bounds[1]],
                    [bounds[2], bounds[3]]
                ]);
            } else if (featureRep.getGeometryType() == 'Point' && prevZoomLevel < 19) {
                // when zooming to a point, the zoom level will be 20, so let's zoom out
                this.setView(featureRep.getCenter(), 18);
            } else {
                const { maxZoom } = this.layerManager.getZoomRange();
                this.fitBounds(featureRep.getBounds(), { maxZoom });
            }
        }
    },

    /**
     * Fits the bounds of the map to include the map representations of the given features
     * @param  {Array<Feature>} features A list with features to see on the map
     */
    fitBoundsToFeatures(features) {
        const boundsList = [];
        const options = {
            worldName: this.worldId,
            vectorSource: this._currentSetSource
        };
        for (let feature of features) {
            const urn = feature.getUrn?.(true, true);
            let featureRep = urn ? this.featureRepresentations[urn] : null;

            if (!featureRep && feature.getGeometryInWorld(this.worldId)) {
                featureRep = new this.options.FeatureRepresentation(feature, options);
            }

            if (featureRep) {
                boundsList.push(featureRep.getBounds());
            }
        }
        this.fitBoundsToBoundsList(boundsList);
    },

    /**
     * Fits the bounds of the map to include the provided list of feature boundaries
     * @param  {Array<Array>} boundsList A list with boundaries derived from features to see on the map
     */
    fitBoundsToBoundsList(boundsList) {
        let bounds = null;
        for (const featureBounds of boundsList) {
            if (!bounds)
                bounds = latLngBounds(featureBounds.getSouthWest(), featureBounds.getNorthEast());
            else bounds.extend(featureBounds);
        }
        if (bounds) this.fitBounds(bounds);
    },

    /**
     * Creates tooltip that appears when selected object is hovered.
     * @param {MywFeatureRep} feature
     * @private
     */
    _getTooltipFor(feature) {
        const deltaDesc = feature.isDeltaSchema() && feature.getDeltaDescription();
        return `<dl><dd class='result-title'>${feature.getTitle()}</dd><dd>${feature.getShortDescription()}</dd>${
            deltaDesc ? '<dd>[' + deltaDesc + ']</dd>' : '' //Square brackets for display
        }</dl>`;
    },

    _clearSelection() {
        this.app.clearResults();
    },

    //####################################### Interaction Mode ############################################

    /**
     * Passes the click event to the interaction mode stack.
     * If an interaction mode signals that it didn't handle the event by returning false, the event is passed on to the next element on the stack
     * @param  {MouseEvent} event Mouse click event
     */
    handleMapClick(event) {
        // pass the click event to interaction modes on the stack, starting with the top one
        // when an interaction mode returns true, meaning it has handled the event, the others don't get the event
        this._interactionModeStack.reduceRight((previouslyHandled, interactionMode) => {
            // Sometimes a handler might cause the mode stack to be popped more than once and _reduceRight provides
            // undefined to this callback.
            if (!interactionMode) return previouslyHandled;

            if (previouslyHandled) {
                return true;
            } else {
                return interactionMode.handleMapClick(event) !== false;
            }
        }, false);
    },

    /**
     * Passes the end of a ctrl+drag box event to the interaction mode stack.
     * If an interaction mode signals that it didn't handle the event by returning false, the event is passed on to the next element on the stack
     * @param  {MouseEvent} event Mouse click event
     */
    handleCtrlDragBox(event) {
        // pass the click to interaction modes on the stack, starting with the top one
        // when an interaction mode returns true, meaning it has handled the event, the others don't get the event
        this._interactionModeStack.reduceRight((previouslyHandled, interactionMode) => {
            // Sometimes a handler might cause the mode stack to be popped more than once and _reduceRight provides
            // undefined to this callback.
            if (!interactionMode || !interactionMode.handleCtrlDragBox) return previouslyHandled;

            if (previouslyHandled) {
                return true;
            } else {
                return interactionMode.handleCtrlDragBox(event) !== false;
            }
        }, false);
        this._discardNextClickEvt = true;
    },

    handleFeatureMouseover(evt) {
        const app = this.app;
        //feature highlights only handled in selection mode
        //ENH: move highlight handling to SelectionMode
        if (!(this.currentInteractionMode() instanceof SelectionMode)) return;

        const featureRep = evt.featureRep;
        const feature = featureRep?.feature;
        const urn = feature?.getUrn(true, true);
        const isDifferent = this._highlightedRep !== featureRep;

        if (isDifferent) {
            //unhighlight previous feature unless it was the current feature
            if (this._highlightedRep?.feature !== app.currentFeature) {
                this._highlightedRep?.unHighlight();
                this._highlightedRep = undefined;
            }
        }

        const isOfCurrentFeatureSet = featureRep && featureRep === this.featureRepresentations[urn];
        if (isOfCurrentFeatureSet) {
            this._highlightedRep = featureRep;
            featureRep.highlight();
        }
    },

    /**
     * Returns the current interaction mode
     * @returns {MapInteractionMode}
     */
    currentInteractionMode() {
        return this._interactionModeStack[this._interactionModeStack.length - 1];
    },

    /**
     * Enables a interaction mode
     * Disables the previous one and keep tracks of it so it can be re-enabled later
     * @param {MapInteractionMode} InteractionMode the map interaction mode to use
     */
    setInteractionMode(interactionMode) {
        //disable previous mode
        const stack = this._interactionModeStack;
        if (stack.length) stack[stack.length - 1].disable();

        //add and enable new mode
        stack.push(interactionMode);

        return interactionMode.enable();
    },

    /**
     * Disables the current interaction mode and enables the previous one
     */
    endCurrentInteractionMode() {
        const stack = this._interactionModeStack;
        const popedMode = stack.pop();
        popedMode.disable();
        //enable the new current mode
        if (stack.length) stack[stack.length - 1].enable();
    },

    //####################################### State ############################################

    /**
     * Obtains the current state of map <br/>
     * So it can be restored on the next session/initialization
     * @returns {mapState}
     */
    getState() {
        let center, zoom;

        try {
            center = this.getCenter();
            zoom = this.getZoom();
        } catch (e) {
            // map may not have been initialized if there was some problem at startup
        }

        return {
            center: center,
            zoom: zoom,
            basemapName: this.getCurrentBaseMapName(),
            visibleLayersIds: this.getVisibleLayerIds()
        };
    },

    /**
     * Modifies the map to reflect the given state
     * @param {mapState} options
     */
    async setState({ center, zoom, basemapName, visibleLayersIds }) {
        if (center) this.setView([center.lng ?? center[0], center.lat ?? center[1]]);
        if (zoom) this.setZoom(zoom);
        if (basemapName) {
            await this.setCurrentBaseMap(basemapName);
            this._currentBaseMap?.redraw(); //hack to get Google basemaps to render ENH: handle in GoogleSource
        }
        if (visibleLayersIds) await this.layerManager.setLayersVisibility(visibleLayersIds);

        await this.untilLayersRendered();
    },

    /**
     * Creates a new map and applies self's state to it
     * @param {domElement} div Container for the new map. Doesn't have to be in the dom
     */
    async clone(div, options) {
        options = { ...this.options, ...options };
        //remove OL options which will be derived later
        delete options.view;
        delete options.target;
        const newMap = new this.constructor(this.app, div, this.worldId, options);
        newMap.initialBaseMapName = this.getCurrentBaseMapName();
        newMap.layerManager.setLayerList(this.layerManager.getState());
        //set an initial view but use current zoom level otherwise layers won't get added (for being outside range)
        newMap.setView(new LatLng(0, 0), this.getZoom());
        newMap.setSize([1, 1]);
        newMap.getBounds([1, 1]);
        await newMap.ready;

        const size = Object.values(this.getSize());
        newMap.setSize(size);
        const mapState = this.getState();
        await newMap.setState(mapState);

        return newMap;
    },

    /**
     * Takes a screenshot of the current map view
     * @param {object} options
     * @param {string} [options.format='dataURL'] Format for result. 'dataURL' or 'canvas'
     * @returns {Promise<string|HTMLObjectElement>} The map image data as a base64 string or a html canvas element
     */
    async takeScreenshot(options = {}) {
        if (!this._canScreenshot()) {
            //map canvas can't be used directly due to cross origin security restrictions
            // use a clone to get the screenshot
            if (!this._screenshotMap) {
                this._screenshotMap = await this.clone(document.createElement('div'), {
                    crossOrigin: 'anonymous'
                });
            } else {
                await this._screenshotMap.setState(this.getState());
            }
            return this._screenshotMap._takeScreenshot(options);
        }

        //map canvas isn't tainted
        return this._takeScreenshot(options);
    }
};

/**
 * State of a map
 * @typedef mapState
 * @property {LatLng}    center
 * @property {number}    zoom
 * @property {string}    basemapName
 * @property {string[]}    visibleLayersIds
 */

export default MywMap;
