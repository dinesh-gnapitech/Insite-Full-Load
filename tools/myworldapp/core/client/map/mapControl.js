// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld/base/core';
import { trace } from 'myWorld/base/trace';
import { msg, translate } from 'myWorld/base/localisation';
import { toProjCoord, toLatLng, toLngLat, toLatLngBounds, toProjExtent } from 'myWorld/base/proj';
import { latLngBounds } from 'myWorld/base/latLngBounds';
import Map from 'ol/Map';
import View from 'ol/View';
import { ZoomSlider, Attribution } from 'ol/control';
import { Vector as OlVectorLayer } from 'ol/layer';
import Overlay from 'ol/Overlay';
import { formatLatLng, until, copyToClipboard, applyIOS13ContextMenuHack } from 'myWorld/base/util';
import * as Browser from 'myWorld/base/browser';
import CtrlDragBox from './ctrlDragBox';
import ContextMenu from 'ol-contextmenu';
import MapBrowserEvent from 'ol/MapBrowserEvent';
import { MywMap } from './mywMap';
import MapRotationControl from './mapRotationControl';
import FeatureRepresentation from 'myWorld/features/featureRepresentation';
import GeoJSONSource from '../layers/geoJSONSource';
import olSnapInteraction from './olSnapInteraction';
import TolerantDragPanInteraction from './tolerantDragPanInteraction';
import { DragPan, defaults as defaultInteractions } from 'ol/interaction';
import { getUserProjection, toUserResolution } from 'ol/proj';

require('!style-loader!css!ol-contextmenu/ol-contextmenu.css');

const includes = [MywMap];

/**
 * @classdesc A myWorld map using OpenLayers
 * Inherits from ol/Map and implements additional myWorld API which includes backwards compatibility of Leaflet Map
 * and additional behaviour added by including {@link MywMap}
 * Superclass to the Geo map as well as other maps such as internals. <br/>
 *
 * @class
 * @mixes MywMap
 * @extends Map
 */
export class MapControl extends Map {
    /**
     * @param {string|domElement}   divID       The div element (or it's id) to render the map onto.
     * @param {string}              worldId     The name of the world this map will be displaying.
     * @param {Object}              mapOptions  See {@link https://openlayers.org/en/latest/apidoc/module-ol_Map-Map.html}
     *
     * @fires geomdraw-enable
     * @fires geomdraw-disable
     * @fires geomdraw-start
     * @fires geomdraw-end
     * @fires geomdraw-modifyend
     */
    constructor(owner, divID, worldId, mapOptions = {}) {
        const { viewOptions, ...otherMapOptions } = mapOptions;
        const view = new View({
            multiWorld: true, //to allow zooming out to levels 0 and 1 independent of window size
            constrainResolution: true, //constrainResolution restricts zoom level to integers
            ...viewOptions
        });
        mapOptions = {
            view,
            target: divID,
            pixelRatio: Browser.devicePixelRatio,
            ...otherMapOptions
        };

        super({
            interactions: defaultInteractions({ onFocusOnly: false }), // allow interactions to work when map is not in focus
            ...mapOptions
        });

        // Set tabIndex on map container so that it can receive focus. (Required for keyboard interaction)
        this.getContainer()?.setAttribute('tabIndex', '0');

        // setup screenshot capability check
        this._isCanvasTainted = false;
        this.on('rendercomplete', () => {
            if (this._isCanvasTainted) return;
            for (let layer of this.getLayers().getArray()) {
                const source = layer.getSource();
                if (source?.crossOrigin !== 'anonymous') return (this._isCanvasTainted = true);
            }
        });

        //setup myw map behaviour including app event handlers
        this.initMywMap(owner, worldId, { FeatureRepresentation, ...mapOptions });

        this._setupMapEventHandlers();

        /** Promise alternative to Leaflet's whenReady method
         * @type {promise} */
        this.ready = new Promise(resolve => {
            //precompose event is triggered before layers are rendered
            this.on('precompose', resolve);
        });

        //by default use standard zoomControler on touch devices and slider control on non-touch devices
        this.toggleZoomSlider(this.getDivElement(), !this.app.useTouchStyles);

        // Localise the zoom slider tooltip help.
        $('.ol-zoom-in').attr('title', msg('MapControl', 'zoom_in'));
        $('.ol-zoom-out').attr('title', msg('MapControl', 'zoom_out'));

        //Add Context menu
        this.contextmenu = new ContextMenu({
            width: this.options.contextmenuWidth,
            defaultItems: false
        });
        this.addControl(this.contextmenu);

        //add layer for current feature and current feature set
        this._currentSetSource = new GeoJSONSource({});
        this._currentSetLayer = new OlVectorLayer({ source: this._currentSetSource, zIndex: 150 });
        this.addLayer(this._currentSetLayer);

        //openlayers attribution
        this.attributionControl = null;
        this.controls.forEach(control => {
            if (control instanceof Attribution) {
                this.attributionControl = control;
                this.attributionControl.setCollapsible(false);
                this.attributionControl.setCollapsed(false);
            }
        });

        this.ctrlDragBox = new CtrlDragBox(this);
        this.addInteraction(this.ctrlDragBox);

        const interactions = this.getInteractions();
        interactions.forEach((interaction, i) => {
            //  Replace the default DragPan interaction with our custom drag-tolerant DragPan version
            if (interaction instanceof DragPan) {
                interactions.setAt(
                    i,
                    new TolerantDragPanInteraction({
                        condition: interaction.condition_,
                        kinetic: interaction.kinetic_
                    })
                );
            }
        });

        //add our own rotation button
        $('.ol-rotate').hide(); //Hide openlayers rotation button
        this.getView().on('change:rotation', this._updateRotationButton);

        applyIOS13ContextMenuHack(this.getContainer());
    }

    dispatchEvent(event) {
        if (event.coordinate) event.lngLat = toLngLat(event.coordinate, this.proj);
        return super.dispatchEvent(event);
    }

    // ****************** Getting Map State
    /**
     * Returns the center coordinate of the current map view
     * @returns {LatLng}
     */
    getCenter() {
        return this.toLatLng(this.getView().getCenter());
    }

    /**
     * Returns the zoom level of the current view
     * @returns {number}
     */
    getZoom() {
        return this.getView().getZoom();
    }

    /**
     * Returns the geographical bounds visible in the current map view
     * @returns {LatLngBounds}
     */
    getBounds(opt_size) {
        const extent = this.getView().calculateExtent(opt_size);
        return toLatLngBounds(extent, this.proj);
    }

    /**
     * Returns the minimum zoom level of the current map view
     */
    getMinZoom() {
        return this.getView().getMinZoom();
    }

    /**
     * Returns the maximum zoom level of the current map view
     */
    getMaxZoom() {
        return this.getView().getMaxZoom();
    }

    /**
     * Current rotation of the map view in radians
     * @returns {number}
     */
    getRotation() {
        return this.getView().getRotation();
    }

    /**
     * Resolution (projection units per pixel) of the current map view
     * @returns {number}
     */
    getResolution() {
        return toUserResolution(this.getView().getResolution(), this.getView().getProjection());
    }

    get proj() {
        return getUserProjection();
    }

    // ****************************** Setting Map State *************************************
    /**
     * Sets a new view of the map
     * @param {ol/View|LatLng} centerOrView A new View or the new center of the map
     * @param {integer} [zoom]  (only used if center is a LatLng) Zoom level to use
     */
    setView(centerOrView, zoom) {
        if (centerOrView instanceof View) {
            //first unregister any previous event handlers on the view
            this._setupViewEventHandlers('un');
            super.setView(centerOrView);
            this._setupViewEventHandlers('on');
        } else {
            const view = this.getView();
            view.setCenter(toProjCoord(centerOrView, this.proj));
            if (zoom) view.setZoom(zoom);
        }
    }

    /**
     * Sets the zoom of the current map view
     * @param {number} zoom
     */
    setZoom(zoom) {
        this.getView().setZoom(zoom);
    }

    /**
     * Pans the map to a given center.
     * @param {LatLng} latLng
     */
    panTo(latLng) {
        this.getView().setCenter(toProjCoord(latLng, this.proj));
    }

    /**
     * Sets the rotation of the map view
     * @param {number} rotation In radians
     */
    setRotation(rotation) {
        this.getView().setRotation(rotation);
    }

    /**
     * Sets the lower limit for the available zoom levels
     * @param {number} zoom
     */
    setMinZoom(zoom) {
        this._minZoom = zoom;
        this._syncZoomRestrictions();
    }

    /**
     * Sets the higher limit for the available zoom levels
     * @param {number} zoom
     */
    setMaxZoom(zoom) {
        this._maxZoom = zoom;
        this._syncZoomRestrictions();
    }

    // ******************************* Conversion methods **********************************
    /**
     * Given a pixel coordinate relative to the origin pixel, returns the corresponding geographical coordinate (for the current zoom level).
     * @param {Point} point
     * @returns {LatLng}
     */
    pixelToLatLng(point) {
        const olCoord = this.getCoordinateFromPixel(point);
        return toLatLng(olCoord, this.proj);
    }

    /**
     * Given a geographical coordinate, returns the corresponding pixel coordinate relative to the origin pixel.
     * @param {LatLng} latLng
     * @returns {Point}
     */
    latLngToPixel(latLng) {
        const olCoord = toProjCoord(latLng, this.proj);
        const pixelPoint = this.getPixelFromCoordinate(olCoord);
        return pixelPoint;
    }

    /**
     * Converts a projected coordinate to a lat/lng
     * @returns {LatLng}
     */
    toLatLng(projCoord) {
        return toLatLng(projCoord, this.proj);
    }

    /**
     * Converts an extent to bounds in lat/lng
     * @param {number[]} extent [minx, miny, maxx, maxy]
     * @returns {LatLngBounds}
     */
    toLatLngBounds(extent) {
        return toLatLngBounds(extent, this.proj);
    }

    // ******************************* Other API methods ************************************

    /**
     * Fires an event of the specified type
     * @param {string} type
     * @param {object} [details] Event data
     */
    fire(type, details) {
        trace('map', type.includes('mouseover') ? 8 : 3, `Event '${type}'`);
        return this.dispatchEvent({ ...details, type });
    }

    //alias to fire
    fireEvent(...args) {
        return this.fire(...args);
    }

    /**
     * Fires an event of the specified type
     * Overridden to support space separated event names as the other myw classes do
     * @param {string|Array<string>} types
     * @param {function} listener
     */
    on(types, listener) {
        if (typeof types == 'string') {
            //split on whitespace
            types = types.trim().split(/\s+/);
        }
        super.on(types, listener);
    }

    /**
     * Removes listeners of an event type
     * @param {string} type
     * @param {function} listener Listener function
     */
    off(types, listener) {
        if (typeof types == 'string') {
            //split on whitespace
            types = types.trim().split(/\s+/);
        }
        return this.un(types, listener);
    }

    /**
     * Returns the HTMLElement that contains the control
     */
    getContainer() {
        return this.getTargetElement();
    }

    /**
     * @return {jqueryElement} The map container element
     */
    getDivElement() {
        return $(this.getTargetElement());
    }

    /**
     * Adds the given layer to the top of this map
     * @param {ol/layer/Base~BaseLayer|ILayer} layer
     */
    addLayer(layer) {
        let handled = false;
        if (typeof layer.onAdd == 'function') handled = layer.onAdd(this);

        this._syncZoomRestrictions();

        if (!handled) super.addLayer(layer);
    }

    /**
     * Removes the given layer from the map
     * @param {ol/layer/Base~BaseLayer|ILayer} layer
     */
    removeLayer(layer) {
        let handled = false;
        if (typeof layer.onRemove == 'function') handled = layer.onRemove(this);

        this._syncZoomRestrictions();

        if (!handled) super.removeLayer(layer);
    }

    getCurrentFeature() {
        return this._currentFeature;
    }

    getCurrentFeatureRepresentation() {
        return this.getFeatureRepFor(this._currentFeature);
    }

    /**
     * Redraws the overlays and basemap
     */
    redraw() {
        const basemapPromise = this._currentBaseMap?.redraw();
        const overlaysPromise = this.layerManager.redraw();
        this.render(); //to ensure rendercomplete is called
        return Promise.all([basemapPromise, overlaysPromise]);
    }

    /**
     * returns a promise that resolves once all layers have finished loading and the rendering has finished
     */
    async untilLayersRendered() {
        const layers = this.getLayers().getArray();
        //wait until all layers have finished loading
        await until(() => !layers.some(l => l.getSource()?.loading), 5000);

        //wait for render to complete
        const intId = setInterval(() => this.render(), 25); //hack to ensure rendercomplete event is triggered when map is ready
        await new Promise(resolve => {
            this.once('rendercomplete', resolve);
        });
        clearInterval(intId);
    }

    /**
     * Returns the maximum zoom level on which the given bounds fit to the map view in its entirety
     * @param {LatLngBounds} bounds
     */
    getBoundsZoom(bounds) {
        const view = this.getView();
        const resolution = view.getResolutionForExtent(toProjExtent(bounds, this.proj));
        const zoom = view.getZoomForResolution(resolution);
        return Math.floor(zoom);
    }

    /**
     * Sets a map view that contains the given geographical bounds with the maximum zoom level possible.
     * @param {LatLngBounds} bounds
     * @param {object} [options]
     * @param {number} [options.maxZoom]
     */
    fitBounds(bounds, options = {}) {
        const view = this.getView();
        view.fit(toProjExtent(bounds, this.proj));
        if (options.maxZoom && view.getZoom() > options.maxZoom) {
            view.setZoom(options.maxZoom);
        }
    }

    /**
     * Obtains a bounding box to represent a selection area
     * Uses map's current zoom level
     * @param  {LatLng}   selectionPoint  Point of the selection
     * @param  {integer}    pixelTolerance  Tolerance in pixels
     * @return {LatLngBounds}
     */
    getBoundingBoxFor(selectionPoint, pixelTolerance) {
        const pixelPoint = this.latLngToPixel(selectionPoint);
        const swPixel = [pixelPoint[0] - pixelTolerance, pixelPoint[1] + pixelTolerance];
        const nePixel = [pixelPoint[0] + pixelTolerance, pixelPoint[1] - pixelTolerance];

        const sw = this.pixelToLatLng(swPixel);
        const ne = this.pixelToLatLng(nePixel);
        return latLngBounds(sw, ne);
    }

    /**
     * Override ol/Map addInteraction method to ensure that the olSnapInteraction always appears last in the list
     * as specified in https://openlayers.org/en/latest/examples/snap.html
     * @param {ol/interaction} interaction
     */
    addInteraction(interaction) {
        super.addInteraction(interaction);
        this.interactions.forEach(interaction => {
            if (interaction instanceof olSnapInteraction) {
                this.interactions.remove(interaction);
                this.interactions.push(interaction);
            }
        });
    }

    /**
     * Copies a string with the projection coordinate to the clipboard
     * Called when the corresponding context menu action is selected by the user
     * @param {Map} map Unused param
     * @param  {object} location Click location from context menu
     * @private
     */
    _copyCoordinate(map, location) {
        location = formatLatLng(this.toLatLng(location.coordinate), 7);
        copyToClipboard(location);
    }

    /**
     * Toggles multiple select
     * Called when the context menu action is selected by the user
     * @private
     */
    _toggleMultipleSelect() {
        if (!this.multipleSelect) {
            this.currentInteractionMode().setMultipleSelect(true);
            this.multipleSelect = true;
        } else {
            this.multipleSelect = null;
            this.currentInteractionMode().setMultipleSelect(false);
        }
    }

    _setupMapEventHandlers() {
        // Setup handlers for map click events.
        // There is an issue where the context menu will still perform clicks underneath when its open. Use this to suppress them
        // Note that this is being caused by OpenLayers generating a new click event that remains uncancellable by ol-contextmenu
        let contextMenuWasRaised = false;

        this.on('singleclick', event => {
            if (!contextMenuWasRaised) {
                event.olFeatures = this.getFeaturesAtPixel(event.pixel);
                event.featureReps = event.olFeatures.map(olFeature => olFeature._rep);
                this.fire('single-click', event); //fire the myw single click event
            } else {
                contextMenuWasRaised = false;
            }
        });

        this.on('contextmenu', event => {
            contextMenuWasRaised = true;
        });

        this._currentZoom = this.getZoom();

        this.on('movestart', event => {
            const newZoom = this.getZoom();
            if (this._currentZoom != newZoom) {
                this.fire('zoomstart');
            }
        });
        this.on('moveend', event => {
            const newZoom = this.getZoom();
            if (this._currentZoom != newZoom) {
                this._currentZoom = newZoom;
                this.fire('zoomend');
            }
            contextMenuWasRaised = false;
        });

        this.on('pointermove', event => {
            if (event.dragging) return;
            const features = this.getFeaturesAtPixel(event.pixel);
            const rep = features[0]?._rep;
            const evt = {
                ...event,
                coordinate: event.coordinate, //needs to be copied. calculated?
                featureRep: rep,
                olFeatures: features
            };

            this._showTooltip(evt); //show or hide tooltip

            this.fire('feature-mouseover', evt);
        });

        this._setupViewEventHandlers();
    }

    /*
     * Setup event handlers on the map's view
     * This simplifies listenting to these events as there's no need for others to reregister when the view changes
     * @param {string} [onOrUn='on']  If 'un', it will unregister the events instead of registering new ones
     */
    _setupViewEventHandlers(onOrUn = 'on') {
        const view = this.getView();
        view[onOrUn]('change:rotation', this._handleRotationChange);
    }

    /*
     * Called when rotation changes on the view. Re-issues event from the map it self
     * @param {ol/event} ev
     */
    _handleRotationChange = ev => {
        this.fire('rotation-change', ev);
    };

    // tooltip handling of mouse hovering the map
    // adds an overlay to display feature representation tooltips
    // Tooltips should be registered with FeatureRepresentation.bindTooltip()
    _showTooltip(event) {
        if (!this._tooltipOverlay) {
            const tooltipElement = (this._tooltipElement = document.createElement('div'));
            tooltipElement.className = 'feature-tooltip';
            this.getTargetElement().appendChild(tooltipElement);
            this._tooltipOverlay = new Overlay({ element: tooltipElement });
            this._isTooltipVisible = false;
        }
        const tooltipOverlay = this._tooltipOverlay;
        const tooltipElement = this._tooltipElement;

        //Decide wether to place tooltip to the left or right if we find features
        const tooltipText = event.olFeatures?.[0]?.getTooltip?.() ?? event.featureRep?.getTooptip();
        if (!tooltipText) return this._hideTooltip();

        const bounds = this.getBounds();
        const horizontalFraction =
            (event.lngLat[0] - bounds.getWest()) / (bounds.getEast() - bounds.getWest());

        if (horizontalFraction < 0.5) {
            tooltipElement.classList.remove('feature-tooltip-left');
            tooltipElement.classList.add('feature-tooltip-right');
        } else {
            tooltipElement.classList.remove('feature-tooltip-right');
            tooltipElement.classList.add('feature-tooltip-left');
        }

        tooltipElement.innerHTML = tooltipText;
        if (!this._isTooltipVisible) {
            this.addOverlay(tooltipOverlay);
            tooltipOverlay.setPosition(event.coordinate);
            this._isTooltipVisible = true;
        } else {
            //already visible
            tooltipOverlay.setPosition(event.coordinate);
        }
    }

    _hideTooltip() {
        //no feature found -> hide tooltip
        if (this._isTooltipVisible) {
            this.removeOverlay(this._tooltipOverlay);
            this._isTooltipVisible = false;
        }
    }

    /**
     * Shows the map
     */
    show() {
        this.getDivElement().show();
        this.invalidateSize();
    }

    /**
     * Hides the map
     */
    hide() {
        this.getDivElement().hide();
    }

    /**
     * Applies the provided css properties to the map div
     * @param  {object} options Css properties to apply
     */
    css(options) {
        this.getDivElement().css(options);
    }

    /**
     * Override in order to maintain the map center
     * @override
     */
    invalidateSize() {
        let center;
        if (this._loaded) center = this.getCenter();
        if (center) this.panTo(center);
        this.updateSize();

        return this;
    }

    /**
     * Util to add css classes that will enable or disable the zoomSlider
     * @param {jQueryElement} element The map div that the zoom slider is on
     * @param {boolean} enabled whether to enable or disable the zoomslider. Is ignored if app is set to use touchStyles in which case the slider will won't be enabled
     */
    toggleZoomSlider(mapDiv, enabled) {
        if (this.app.useTouchStyles) enabled = false; //Always want disabled zoomslider if touch

        if (enabled) this._ensureZoomSlider();

        let classNameToAdd = '';
        let classNameToRemove = '';
        if (enabled) {
            classNameToAdd = 'slider-enabled';
            classNameToRemove = 'slider-disabled';
        } else {
            classNameToAdd = 'slider-disabled';
            classNameToRemove = 'slider-enabled';
        }

        const internalViewZoomSliderDivs = [
            $(mapDiv).find('.ol-zoom'),
            $(mapDiv).find('.ol-zoomslider'),
            $(mapDiv).find('.ol-overlaycontainer-stopevent')
        ];

        internalViewZoomSliderDivs.forEach(div => {
            div.addClass(classNameToAdd);
            div.removeClass(classNameToRemove);
        });
    }

    /**
     * Requests that the rotation button is shown
     * Should be called again when no longer required
     * @param {object} requester  Object requesting rotation button to be present
     * @param {boolean} [isRequired=true] true means buttons is being requests, false that it is no longer required
     */
    requestRotationButton(requester, isRequired = true) {
        if (!this._rotationInterest) this._rotationInterest = new Set();
        if (isRequired) this._rotationInterest.add(requester);
        else this._rotationInterest.delete(requester);

        this._isRotationButtonRequested = this._rotationInterest.size > 0;
        this._updateRotationButton();
    }

    /**
     * Returns a localized message.
     * Self's class will be used as the message group.
     * @param  {string}     messageId       Message key
     * @param  {Object<string,string>}     [positional]    Values for positional parameters in message
     * @return {string | Function}     Translated message
     */
    msg(messageId, positional) {
        return msg(this, messageId, positional);
    }

    /**
     * Walks over DOM tree and translates messages.
     * Self's class will be used as the message group
     * @param  {JQuery.Selector}  selector    jQuery selector for DOM tree.
     */
    translate(selector) {
        return translate(this, selector);
    }

    _updateRotationButton = evt => {
        const userLocation = this.app.userLocation;
        if (!this._rotationControl) {
            this._rotationControl = new MapRotationControl({ userLocation });
            this.addControl(this._rotationControl);

            //ENH: Provide a way of specifying a position (eg 'bottom-left') and then having the location be worked out
            $('.ol-overviewmap').css({ bottom: '5.5em' });
            // add a data attribute to body tag when map control is shown, allow other elements
            // using specific style base on the data attribute, especially in phone layout
            document.querySelector('body')?.setAttribute('data-myw-map-rotation-control', '');
        }

        const shouldAlwaysShow = userLocation.isRotatingMap || this._isRotationButtonRequested;
        if (!shouldAlwaysShow && this.getView().getRotation() === 0) {
            this._removeRotationButton();
        }
    };

    _removeRotationButton() {
        this.removeControl(this._rotationControl);
        this._rotationControl = null;
        document.querySelector('body')?.removeAttribute('data-myw-map-rotation-control');
        const isGoogle = (this.getCurrentBaseMapName() ?? '').includes('Google');

        //Want to avoid obscuring pegman
        if (!isGoogle) $('.ol-overviewmap').css({ bottom: '0.25em' });
    }

    /**
     * Add zoomslider to map, remove old instance
     * @private
     */
    _ensureZoomSlider() {
        //need to recreate control because toggling when the map is already set the slider won't move
        if (this.zoomslider) this.removeControl(this.zoomslider);
        this.zoomslider = new ZoomSlider();
        this.addControl(this.zoomslider);
    }

    /*
     * API to set attribution prefix
     * @param {*} string
     */
    _setPrefix(string) {
        this.attributionControl.element.textContent = string;
    }

    /**
     * Sets the zoom level restrictions on the map considering layer definitions and any
     * specific restrictions given to the map via setMinZoom() and setMaxZoom()
     * @private
     */
    _syncZoomRestrictions() {
        //Get zoom range from layers and basemap
        const basemap = this._currentBaseMap;
        let { minZoom: layersMinZoom, maxZoom: layersMaxZoom } = this.layerManager.getZoomRange();
        layersMinZoom = Math.min(layersMinZoom, basemap?.getMinZoom() ?? Infinity);
        layersMaxZoom = Math.max(layersMaxZoom, basemap?.getMaxZoom() ?? 0);

        //Consider any zoom restrictions set on the map
        const minZoom = Math.max(layersMinZoom, this._minZoom ?? 0);
        let maxZoom = Math.min(layersMaxZoom, this._maxZoom ?? Infinity);
        if (maxZoom == Infinity) {
            console.warn(`No max zoom is being calculated`);
            maxZoom = 35;
        }
        this.getView().setMinZoom(minZoom);
        this.getView().setMaxZoom(maxZoom);
    }

    remove() {
        this.dispose();
    }

    /*
     * Returns true if the map hasn't been 'tainted'
     * If the map has been rendered with a source that didn't have crossOrigin set to 'anonymous' it is considered
     *  tainted as the browser won't allow exporting the canvas
     * @returns {boolean}
     */
    _canScreenshot() {
        return this.options.crossOrigin == 'anonymous';
    }

    /*
     * Takes a screenshot of the current map view.
     * Based heavily on the example from https://openlayers.org/en/latest/examples/export-map.html
     * @param {object} options
     * @param {string} [options.format='dataURL'] Format for result. 'dataURL' or 'canvas'
     * @returns string|HTMLObjectElement} The map image data as a base64 string or a html canvas element
     */
    _takeScreenshot({ format = 'dataURL' }) {
        const mapCanvas = document.createElement('canvas');
        [mapCanvas.width, mapCanvas.height] = this.getSize();
        const mapContext = mapCanvas.getContext('2d');
        const layers = this.getContainer().querySelectorAll('.ol-layer canvas');
        Array.prototype.forEach.call(layers, function (canvas) {
            if (canvas.width > 0) {
                const opacity = canvas.parentNode.style.opacity;
                mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
                const transform = canvas.style.transform;
                // Get the transform parameters from the style's transform matrix
                const matrix = transform
                    .match(/^matrix\(([^\(]*)\)$/)[1]
                    .split(',')
                    .map(Number);
                // Apply the transform to the export map context
                CanvasRenderingContext2D.prototype.setTransform.apply(mapContext, matrix);
                mapContext.drawImage(canvas, 0, 0);
            }
        });

        if (format == 'canvas') return mapCanvas;
        else {
            return mapCanvas.toDataURL();
        }
    }

    /*
     * Used by tests to simulate a click. If in geomDrawMode simulates a click using openLayers events
     * Otherwise it uses the myworld click handleMapClick method
     * @param {number} lat
     * @param {number} lng
     * @param {boolean} ctrl
     */
    simulateClickOnMap(lat, lng, ctrl) {
        const latlng = myw.latLng(lat, lng);

        if (this.currentInteractionMode().shouldUseOpenLayersEvents()) {
            const pt = this.latLngToPixel(latlng);
            // Position of top left of map container in document
            const px = this.getTargetElement().getBoundingClientRect().left;
            const py = this.getTargetElement().getBoundingClientRect().top;
            // Position of point in document
            const dx = px + pt[0];
            const dy = py + pt[1];

            this.simulateEvent('pointermove', dx, dy, ctrl);
            this.simulateEvent('pointerdown', dx, dy, ctrl);
            this.simulateEvent('pointerup', dx, dy, ctrl);
            this.simulateEvent('click', dx, dy, ctrl);
        } else {
            let keyCode = '';
            if (ctrl) {
                keyCode = 'ctrl';
                this.simulateKeyEvent('keydown', keyCode);
            }
            this.handleMapClick({ latlng });
            if (ctrl) {
                this.simulateKeyEvent('keyup', keyCode);
            }
        }
    }

    /*
     * Simulates drag using openLayers events
     * @param {ol/coordinate} position1 openLayers coordinate
     * @param {ol/coordinate} position2
     * @param {boolean} ctrl
     */
    simulateDrag(position1, position2, ctrl) {
        this.simulateEvent('pointermove', ...position1, ctrl);
        this.simulateEvent('pointerdown', ...position1, ctrl);
        this.simulateEvent('pointermove', ...position2, ctrl);
        this.simulateEvent('pointerdrag', ...position2, ctrl);
        this.simulateEvent('pointerup', ...position2, ctrl);
    }

    /*
     * Creates an event to be used by the map to simulate a click when in GeomDrawMode (for openLayers)
     * See here for examples https://github.com/openlayers/openlayers/blob/master/test/spec/ol/interaction/draw.test.js
     * @param {string} type name of event
     * @param {number} x position on screen
     * @param {number} y position on screen
     * @param {boolean} ctrl wether ctrl key is pressed
     */
    simulateEvent(type, x, y, ctrl) {
        const viewport = this.getViewport();
        const event = {};
        event.type = type;
        event.target = viewport.firstChild;
        event.clientX = x;
        event.clientY = y;
        if (ctrl) event.ctrlKey = true;
        event.preventDefault = function () {};
        event.pointerType = 'mouse';
        event.pointerId = 0;
        event.isPrimary = true;
        event.button = 0;
        event.stopPropagation = function () {};

        const simulatedEvent = new MapBrowserEvent(type, this, event);
        this.handleMapBrowserEvent(simulatedEvent);
    }

    /*
     * Simulate a keydown event
     * @param {string} type
     * @param {string} key
     */
    simulateKeyEvent(type, key) {
        let options = {};
        if (key == 'ctrl') options = { key, ctrlKey: true };
        document.dispatchEvent(new KeyboardEvent(type, options));
    }
}

//include methods from mixins
for (let mixin of includes) {
    Object.assign(MapControl.prototype, mixin);
}

export default MapControl;
