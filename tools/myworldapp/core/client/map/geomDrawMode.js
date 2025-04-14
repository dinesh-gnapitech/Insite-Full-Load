// Copyright: IQGeo Limited 2010-2023
import { isEqual } from 'underscore';
import geometry from 'myWorld/base/geometry';
import myw, { msg, trace as mywTrace } from 'myWorld-base';
import { RedoStack } from 'myWorld/base/redoStack';
import { MapInteractionMode } from './mapInteractionMode';
import { GeomRotateMode } from './geomRotateMode';
import GeoJSONVectorLayer from '../layers/geoJSONVectorLayer';
import { lngLatFeature } from '../features/lngLatFeature';
import { Draw } from 'ol/interaction';
import { getEditStyleFor } from './geomUtils';
import { Style, Fill, Stroke } from 'ol/style';
import { hexToRGBA } from '../styles/styleUtils';
import olDragInteraction from './olDragInteraction';
import olModifyInteraction from './olModifyInteraction';
import { primaryAction, platformModifierKeyOnly } from 'ol/events/condition';
import LinearRing from 'ol/geom/LinearRing';
import DoubleClickZoom from 'ol/interaction/DoubleClickZoom';
import {
    modifierKeyPressed,
    escPressed,
    backspacePressed,
    undoPressed
} from 'myWorld/base/keyboardEvent';
import inactiveContextMenuIconImg from 'images/inactiveContextMenuItem.png';

const trace = (...args) => mywTrace('geomDrawMode', ...args);

export class GeomDrawMode extends MapInteractionMode {
    static {
        this.prototype.isGeomDraw = true;

        this.mergeOptions({
            editableOptions: {
                lineGuideOptions: {
                    color: '#ff0000' //red
                }
            },
            create: {
                polygon: {
                    color: '#ff0000',
                    fillOpacity: 0.3,
                    lineOpacity: 1
                },
                polyline: {
                    color: '#ff0000'
                },
                point: {
                    color: 'rgba(128,0,0,0.7)'
                }
            },
            errorColor: '#e1e100',
            precision: 16 //larger than JS and postGIS precision so we don't to lose any precision unnecessarily (required to support modules that rely on exact spatial coincidence)
        });
    }

    /**
     * Initialization. Doesn't enable the mode
     * @class  Geometry Draw interaction mode.
     *         Used in myWorld's feature Editing and measureTool functionalities
     *         Will fire the following events via the map object:
     *           geomdraw-enable, geomdraw-disable, geomdraw-start, geomdraw-end, geomdraw-modifyend
     *         Internally,
     *         When a feature is being drawn, creates a draw, modify and drag interaction
     *         When a feature is being edited, only a modify and drag interaction is created
     * @param  {MapControl} map     Map on which the mode will be enabled
     * @param  {Object} [options] *optional* for overwriting default options
     * @constructs
     * @extends {MapInteractionMode}
     */
    constructor(map, options = {}) {
        super(map);
        this._olMap = map;
        this.geomRotateMode = undefined;
        this._creating = undefined; //true when creating a new geometry, false when editing
        this._isDrawing = undefined; //true when in mode of adding points to the geometry, for example when creating a new feature before commiting drawing or when 'add to end' has been activated
        this._clicked = undefined; //true when there is at least one vertice, false when creating and no vertice has been placed

        const { geomType, rotatable, create, edit } = options;
        this.setGeomType(geomType, rotatable);

        if (create) Object.assign(this.options.create, options.create);
        if (edit) Object.assign(this.options.edit, options.edit);

        [
            '_onKeyDown',
            '_validatePolygon',
            'getRotation',
            'setRotation',
            '_changed',
            'setCoords',
            'enableDrawing',
            '_handleDrawStart',
            '_handleDrawingCommit',
            '_handleDragEnd',
            '_handleModifyStart',
            '_handleModifyEnd',
            '_handleClick',
            '_handlePointerUp',
            '_setClicked',
            '_startDrawingHole',
            '_handleHoleCommit'
        ].forEach(method => (this[method] = this[method].bind(this)));
    }

    /**
     * Sets the geometry type to create/edit.
     * @param {string} geomType One of 'Point', 'LineString' or 'Polygon'
     */
    setGeomType(geomType, rotatable = false) {
        //ENH: replace calling this method with passing options to constructor
        this._geomType = geomType;
        this._isOverlayRotatable = rotatable;
    }

    /**
     * Creates and sets style for editable feature, adds to map
     * @param {geomCoordinates} coordinates
     * @param {boolean} rotatable
     * @param {number} rotation
     */
    setFeatureCoords(coordinates, rotatable, rotation = 0) {
        this._isOverlayRotatable = rotatable ?? this._isOverlayRotatable ?? false;
        this._rotation = rotation;
        if (!coordinates) return; //no geom

        this._creating = false; //Must be editing feature

        this.setInteractionsFor('modifying');

        const noDupsGeom = geometry({ type: this._geomType, coordinates }).removeDuplicates();
        this._setCoords(noDupsGeom.coordinates);

        this._redoStack.push(this.getCoords());

        //set context menu items
        this._setContextMenuForGeomDrawMode();
    }

    /**
     * Enables geometry editing mode with the currently set options
     */
    enable() {
        super.enable();
        // since only one MapInteractionMode can be enabled at a time, clear existing geomRotateMode reference
        this.geomRotateMode = undefined;

        this._redoStack = new RedoStack();
        this._roundtripToOriginal = {};

        this._olMap.removeInteraction(this.map.ctrlDragBox); //ENH: move (activating) ctrDragBox interaction to selectionMode

        geometry.init();

        // We only want to define _creating/_clicked the first time we enable geomDrawMode
        if (this._creating === undefined) {
            this._creating = !this._overlay;
            this._clicked = !!this._overlay; //when editing a geometry we always have at least a point
        }

        this.geomType = this._geomType;

        trace(1, `enable. geomType: ${this.geomType}`);

        const isDrawing = this._isDrawing ?? true;
        this.setInteractionsFor(isDrawing ? 'drawing' : 'modifying');

        this.setEventListeners('on');
        this._setContextMenuForGeomDrawMode();

        this.map.fire('geomdraw-enable');

        this._previousCursor = this.map.getTargetElement()?.style.cursor;

        this.setDoubleClickZoom(false);

        return true;
    }

    /**
     * Disables geometry editing mode, removes events
     */
    disable() {
        super.disable();
        this.map.contextmenu.clear();
        if (!this._overlay) return;
        trace(1, `disable. geomType: ${this.geomType}`);

        // When moving to geomRotateMode we are not finished and do not want to teardown this geomDrawMode.
        const finished = !this.isRotating();

        this.olDraw?.finishDrawing();
        if (this.olDraw) this.map.removeInteraction(this.olDraw);
        if (this.drag) this.map.removeInteraction(this.drag);
        if (this.holeDraw) this.map.removeInteraction(this.holeDraw);
        if (this.modify) this.map.removeInteraction(this.modify);
        this.setEventListeners('un');
        this.olDraw = null;
        this.modify = null;
        this.drag = null;
        this.holeDraw = null;

        this._creating = undefined;

        if (finished) {
            this.map.removeLayer(this._overlay);
            //note that self can be re-enabled later. For example, if a field editor uses a selection mode
        }
        this.setCursorTo(this._previousCursor);
        this.setDoubleClickZoom(true);

        this._olMap.addInteraction(this.map.ctrlDragBox);
        this.map.fire('geomdraw-disable');
    }

    setEventListeners(onOrUn) {
        if (this.modify) {
            this.modify[onOrUn]('modifystart', this._handleModifyStart);
            this.modify[onOrUn]('modifyend', this._handleModifyEnd);
        }

        if (this.olDraw) {
            this.olDraw[onOrUn]('drawend', this._handleDrawingCommit);
            this.olDraw[onOrUn]('drawstart', this._handleDrawStart);
        }
        if (this.drag) this.drag[onOrUn]('dragend', this._handleDragEnd);

        this._olMap[onOrUn]('click', this._handleClick);
        this._olMap[onOrUn]('pointerup', this._handlePointerUp);
        const container = this.map.getContainer();
        if (onOrUn == 'on') {
            //Add keyboard shortcuts : Escape, delete and backspace
            container?.focus(); //tabIndex=0 moves the focus away from the map. Putting it back so pan and zoom interaction works
            container?.addEventListener('keydown', this._onKeyDown);
        } else {
            container?.removeEventListener('keydown', this._onKeyDown);
        }
    }

    handleMapClick(ev) {
        //return false to let the event continue to be processed, i.e. by selection mode
        const onEditingFeature = ev.olFeatures?.some(feature => feature === this._editableFeature);
        if (!onEditingFeature && this.app.editMode && !this._creating && !this._isDrawing) {
            //app is in edit mode and we're not creating a new feature so we want for
            //a click to select another feature
            //returning false, makes the next mode on the stack handle the click
            return false;
        }
    }

    /**
     * If user is dragging sets this._dragging on olModifyInteraction
     * On pointerup dragging is set as false
     * Will return true if event type is pointerup and not dragging else undefined
     * @param {ol/event} e
     * @returns {boolean}
     * @private
     */
    _deleteVertexCondition(e) {
        //this refers to OlModifyInteraction here
        if (e.type == 'pointerdrag') this._dragging = true;
        const shouldDeleteVertex = e.type == 'pointerup' && !this._dragging;
        if (e.type == 'pointerup') this._dragging = false;
        return shouldDeleteVertex;
    }

    /**
     * Adds or removes the open layers interaction 'DoubleClickZoom'
     * @param {boolean} on
     */
    setDoubleClickZoom(on) {
        const interactions = this.map.getInteractions();
        if (on) this.map.addInteraction(this.doubleClickZoom);
        else {
            interactions.forEach(interaction => {
                if (interaction instanceof DoubleClickZoom) {
                    this.doubleClickZoom = interaction; //Cache to allow the interaction to be added back at the end of the mode
                    this.map.removeInteraction(interaction);
                    return;
                }
            });
        }
    }

    /**
     * Sets context menu for actions required by geomDrawMode.
     * Actions vary according to geomType
     * @param {boolean} allowReversal Feature may not be allowed to undo
     */
    _setContextMenuForGeomDrawMode(allowReversal = true) {
        const contextmenu = this.map.contextmenu;
        contextmenu.clear();

        const undo = {
            text: msg('GeomDrawMode', 'undo'),
            icon: inactiveContextMenuIconImg,
            callback: this.undo.bind(this)
        };
        const clear = {
            text: msg('GeomDrawMode', 'clear'),
            icon: inactiveContextMenuIconImg,
            callback: this.clear.bind(this)
        };
        const deleteLast = {
            text: msg('GeomDrawMode', 'delete_last'),
            icon: inactiveContextMenuIconImg,
            callback: this.deleteLast.bind(this)
        };
        const reverse = {
            text: msg('GeomDrawMode', 'reverse'),
            icon: inactiveContextMenuIconImg,
            callback: this.reverse.bind(this)
        };
        const appendVertex = {
            text: msg('GeomDrawMode', 'append_vertex'),
            icon: inactiveContextMenuIconImg,
            disabled: !!this._isDrawing,
            callback: this.enableDrawing.bind(this)
        };
        const coordinates = {
            text: msg('GeomDrawMode', 'coords_dialog'),
            icon: inactiveContextMenuIconImg,
            callback: this.toggleCoordinatesDialog.bind(this),
            disabled: !this._clicked
        };
        const activateGeomRotateMode = {
            text: msg('GeomRotateMode', 'geomRotateMode'),
            icon: inactiveContextMenuIconImg,
            callback: this.activateGeomRotateMode.bind(this)
        };

        const contextMenuItems = [];
        //Geometry specific menuitems
        const geomType = this.geomType;
        contextMenuItems.push(coordinates); //Applied to all geometry types
        if (allowReversal && (geomType == 'Linestring' || geomType == 'LineString')) {
            contextMenuItems.push(deleteLast);
            contextMenuItems.push(reverse);
            contextMenuItems.push(appendVertex);
        } else if (allowReversal && geomType == 'Polygon') {
            contextMenuItems.push(deleteLast);
        }
        if (this._isOverlayRotatable) {
            contextMenuItems.push(activateGeomRotateMode);
        }
        if (
            //If context menu requires seperator
            geomType == 'Linestring' ||
            geomType == 'LineString' ||
            geomType == 'Polygon' ||
            this._isOverlayRotatable
        ) {
            contextMenuItems.push('-');
        }

        // Common menuitems
        if (allowReversal) contextMenuItems.push(undo);
        contextMenuItems.push(clear);

        const action = this._parseAction('snapping.toggle', false); //Don't show error in console if plugin is not available
        if (this._isActionAvailable(action)) {
            //Add snapping if available
            const idx = contextMenuItems.length;
            const item = this._getOptionsForAction(action, idx);
            contextMenuItems.push(item);
        }
        this.menuItems = contextMenuItems;
        contextmenu.extend(contextMenuItems);
    }

    /*
     * Adds point to map if required (only the first time the map is clicked)
     * Refreshes context menu as options may change
     * @param {event} e
     */
    _setClicked(e) {
        this._clicked = true;
        return false;
    }

    get isOverlayOnMap() {
        return this.map?.getLayers().getArray().includes(this._overlay);
    }

    /**
     *
     * @param {string} mode  'drawing' or 'modifying'
     */
    setInteractionsFor(mode) {
        trace(7, `setInteractionsFor ${mode}`);
        if (!this._overlay) {
            trace(7, `Creating overlay layer and adding drag interaction`);
            const map = this.map;
            this._overlay = new GeoJSONVectorLayer({ map, zIndex: 200 });
            this.source = this._overlay.getSource();
            this.drag = new olDragInteraction({ map, source: this.source });
            this._olMap.addInteraction(this.drag);
            this._drawingStyle = getEditStyleFor(this._geomType, this.options, true);
            this._modifyStyle = getEditStyleFor(this._geomType, this.options, false);
        } else if (!this.isOverlayOnMap) {
            //this happens when self is re-enabled
            this.map.addLayer(this._overlay);
        }
        if (mode == 'drawing') {
            this._isDrawing = true;
            this._ensureDrawInteraction();
            this._editableFeature?.setStyle(this._drawingStyle);
            this.setCursorTo('crosshair');
        } else if (mode == 'modifying') {
            this._isDrawing = false;
            this._ensureModifyInteraction();
            this._editableFeature?.setStyle(this._modifyStyle);
            this.setCursorTo('');
        } else {
            throw new Error(`Unexpected mode ${mode}`);
        }
    }

    _ensureDrawInteraction() {
        trace(8, `_ensureDrawInteraction`);
        this._olMap.removeInteraction(this.modify);
        this._olMap.removeInteraction(this.olDraw); //ensures we don't get duplicate
        if (!this.olDraw) {
            this.olDraw = new Draw({
                type: this._geomType,
                source: this.source,
                style: this._drawingStyle,
                condition: primaryAction //Don't want to start drawing on mouse secondary button
            });
        }

        if (this._editableFeature && this.geomType !== 'Point') {
            this.source.clear();
            this.olDraw.extend(this._editableFeature);
        }
        this._olMap.addInteraction(this.olDraw);
    }

    _ensureModifyInteraction() {
        trace(8, `_ensureModifyInteraction`);
        //Set marker style to be invisible
        this._olMap.removeInteraction(this.olDraw);
        if (this.modify) {
            this._olMap.removeInteraction(this.modify);
            //Remove event listeners
            //Need to create a new interaction each time for it to work
            this.modify.un('modifystart', this._handleModifyStart);
            this.modify.un('modifyend', this._handleModifyEnd);
        }
        //Create modify interaction
        this.modify = new olModifyInteraction({
            source: this.source,
            map: this.map,
            style: this._modifyStyle,
            deleteCondition: this._deleteVertexCondition
        });
        this.modify.on('modifystart', this._handleModifyStart);
        this.modify.on('modifyend', this._handleModifyEnd);

        this._olMap.addInteraction(this.modify);
    }

    /*
     * If the latest point intersects with the previously laid points,
     * Its considered as an invalid polygon and the point is removed from the map
     */
    async _validatePolygon(e) {
        if (this.geomType !== 'Polygon') return;
        const feature = this._editableFeature;
        if (!feature) return;
        await geometry.init();

        this.isPolygonValid = true;
        if (this._overlay) {
            const pol = geometry(feature.getGeometry()).removeDuplicates();
            this.isPolygonValid = pol.isValid();
        }

        this._markPolygonAsValid(this.isPolygonValid);
    }

    /*
     * Marks the polygon being drawn or edited as valid by changing its color to its configured color
     */
    _markPolygonAsValid(valid) {
        if (valid) this._setPolygonColor(this.options.create.polygon.color);
        else this._setPolygonColor(this.options.errorColor);
    }

    /*
     * Sets the color provided as the polygon's boundary and fill color
     * @param {string} color
     */
    _setPolygonColor(color) {
        const fillColor = hexToRGBA(color, this.options.create.polygon.fillOpacity);
        const lineColor = hexToRGBA(color, this.options.create.polygon.lineOpacity);

        let style = this._editableFeature.getStyle();
        if (!style)
            style = new Style({
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: lineColor })
            });
        else {
            style = [...style]; //style[0] - vertex, style[1] - midpoint, style[2] - fill
            style[2] = new Style({
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({ color: lineColor })
            });
        }
        this._editableFeature.setStyle(style);
    }

    /*
     * Sets keyboard events
     * @param {event} e
     */
    _onKeyDown(e) {
        if (escPressed(e)) {
            this.clear();
        } else if (backspacePressed(e) && this._geomType != 'Point') {
            //Delete key
            this.deleteLast();
        } else if (undoPressed(e)) {
            //Ctrl+z
            this.undo();
        }
    }

    /**
     * Returns the geometry drawn by the user
     * @return {geojsonGeom|null} Returns null if there are no coordinates
     */
    getGeometry() {
        const coordinates = this._getEditedGeomCoords();
        if (!coordinates) return null;
        const geom = {
            type: this.geomType,
            coordinates,
            world_name: this.map.worldId
        };
        return geom;
    }

    /**
     * Returns rotation
     * @return {number} rotation on rotateable feature
     */
    getRotation() {
        return this._rotation;
    }

    /**
     * Sets rotation on geomDrawMode
     * @param {number} theta
     */
    setRotation(theta) {
        // ENH: Add validation before updating rotation
        this._rotation = theta;
    }

    /**
     *
     * remove the editableFeature from the map
     */
    clear() {
        this.setCoords(null), { type: 'clear' };
    }

    /**
     * Reverse the LineString geometry
     * Assumes current feature is LineString
     */
    reverse() {
        const coords = this.getCoords();
        coords.reverse();
        this.setCoords(coords, { type: 'reverse' });
    }

    /*
     * Finishes openLayers draw mode on draw end as we only ever want to draw one feature
     * Styles inserted feature
     * @param {event} e
     */
    _handleDrawingCommit(e) {
        this._editableFeature = lngLatFeature(e.feature);
        this._clicked = true;
        this.setInteractionsFor('modifying');

        this.map.fire('geomdraw-end', { ...e, geomDrawMode: this });
        this._changed(); //Ensure point geom is updated
    }

    /*
     * When drawing is started need to set this._editableFeature as drawing may be saved without commiting the drawing
     * Sets this._editableFeature
     * If appendingVertex dont do anything here as that mode is handled elsewhere
     * @param {event} e
     */
    _handleDrawStart(e) {
        if (this._editableFeature) return false;
        this._editableFeature = lngLatFeature(e.feature);
        this._editableFeature.setStyle(this._drawingStyle);
        const lngLat = this._editableFeature.getFirstLngLat();
        this.map.fire('geomdraw-start', { ...e, lngLat, geomDrawMode: this });
    }

    /*
     * Util to set clicked and trigger changed
     */
    _handleDragEnd() {
        //Must have clicked to drag
        this._clicked = true;
        this._changed();
    }

    /**
     * Handle click on map
     */
    _handleClick(e) {
        this.map.getContainer().focus();
        this._setClicked();
        this._changed(e);
        if (this._geomType == 'Polygon') this._startDrawingHole(e);
    }

    /**
     * On pointer up validate polygon and give focus to the map
     */
    _handlePointerUp() {
        this.map.getContainer().focus(); //Map needs focus for keydown events and may not have clicked (when dragging points for example)
        this._validatePolygon();
    }

    /*
     *  Sets up events to handle adding a vertex to LineString
     */
    enableDrawing() {
        if (this._isDrawing) return;
        if (this._geomType !== 'LineString') return;

        this.setInteractionsFor('drawing');
    }

    /**
     * Open coordinates dialog if required
     */
    toggleCoordinatesDialog() {
        if (!this.coordinatesDialog) {
            this.coordinatesDialog = new myw.CoordinatesDialog(this, {
                geomDrawMode: this,
                coords: this.getCoords(),
                geomType: this.geomType,
                setCoords: this.setCoords,
                precision: this.options.precision
            });
        }
        this.coordinatesDialog.show();
    }

    /**
     * Delete the last vertex of LineString or Polygon.
     * If Point, calls clear which will remove the overlay
     */
    deleteLast() {
        const initialCoords = this.getCoords();
        const coords = this.geomType == 'Polygon' ? initialCoords[0] : initialCoords;
        const coordCount = coords.length;

        if (coordCount > 1) {
            if (this.geomType == 'Polygon') {
                //coord to remove is second to last, as there is a closing coord
                coords.splice(coordCount - 2, 1);
                this.setCoords([coords]);
            } else {
                coords.pop(); //remove last element of array
                this.setCoords(coords);
            }
        } else {
            this.clear();
        }
    }

    /**
     * Undo the last change made to the geometry
     */
    undo() {
        let coords = this._redoStack.unDo();
        trace(
            3,
            `Undo. stack: ${this._redoStack.stack.length}, curIndex: ${
                this._redoStack.currentStackIndex
            }, latLngs: ${!!coords}`
        );

        if (coords?.length) this.setCoords(coords, { type: 'undo' });

        if (!this._editableFeature?.getGeometry().getCoordinates().length)
            this.map.removeInteraction(this.olDraw); //When undoing a clear, feature will have geometry, so don't want to be able to draw a new feature
    }

    /**
     * Returns true if overlay can be rotated
     * @returns {boolean}
     */
    canBeRotated() {
        if (!this._isOverlayRotatable || this._modifying) return false;
        if (this._creating) return this._clicked;
        return true;
    }

    /**
     * Indicates if we have an activated geomRotateMode
     * @return {boolean} True if we have a geomRotateMode reference
     * @private
     */
    isRotating() {
        return this.geomRotateMode;
    }

    /**
     *
     */
    activateGeomRotateMode() {
        let geomRotateMode;
        const options = {
            rotation: this.getRotation(),
            coordinatesDialog: this.coordinatesDialog
        };

        if (!this.canBeRotated()) return;

        //Don't set rotate mode if coordinates dialog input fields are in focus - otherwise they lose focus which causes problems for copying and pasteing
        if (document.activeElement.name?.includes('coord_dialog')) return;

        geomRotateMode = new GeomRotateMode(this.map, options);
        geomRotateMode.setGeomType(this._geomType);
        geomRotateMode.setFeatureCoords(this.getCoords(), this._editableFeature); //Change this
        geomRotateMode.setRotationChangeHandler(this.setRotation);
        this.geomRotateMode = geomRotateMode;

        this.map.setInteractionMode(this.geomRotateMode);
    }

    endGeomRotateMode() {
        if (this.isRotating() && this.map.isGeomRotateMode()) {
            this.map.endCurrentInteractionMode();
        }
    }

    /**
     * Returns the current lat/long coordinates of the overlay being created/edited
     */
    getCoords() {
        if (!this._editableFeature) return [];
        return this._getEditedGeomCoords();
    }

    /**
     * Obtains the coordinates of the edited geometry. (geojson format for geometry coordinates)
     * @return {Array} depending on geom type: Point: [102.0, 0.5], LineString:  [ [102.0, 0.0], [103.0, 1.0], [104.0, 0.0], [105.0, 1.0]]
     *                           or Polygon: [ [ [100.0, 0.0], [101.0, 0.0], [101.0, 1.0],[100.0, 1.0], [100.0, 0.0] ] ]
     * @private
     */
    _getEditedGeomCoords() {
        if (!this._editableFeature) return null; //Return null if no geometry, so show message to user to place point
        const coordinates = this._editableFeature.getLngLats();

        if (this._isDrawing) {
            //account for additional 'mouse position' coordinate when drawing lines and polygons
            if (this.geomType === 'LineString') coordinates.pop();
            if (this.geomType === 'Polygon') coordinates[0].splice(coordinates[0].length - 2, 1);
        }

        const geom = geometry({ type: this._geomType, coordinates });
        const mappedGeom = geom.mapCoordinates(c => this._roundtripToOriginal[c.join(',')] ?? c);
        return mappedGeom.coordinates;
    }

    /**
     * Sets the given latLngs on the editable feature
     * @param {Array} coords
     * @param {object} evt
     */
    setCoords(coords, evt = { type: 'set-coords' }) {
        if (coords) {
            this._setCoords(coords);
            this._updateOpenLayersSketchFeature(
                this._editableFeature.getGeometry().getCoordinates()
            );
        } else {
            this._clicked = false;
            this._editableFeature = null;
            this.source.clear();
            this.setInteractionsFor('drawing');
        }
        this._setContextMenuForGeomDrawMode();
        this._changed(evt);
    }

    /**
     * Sets coordinates of the editable feature, creating it if necessary
     * @param {geojsonCoordinates} coordinates
     * @private
     */
    _setCoords(coordinates) {
        trace(5, `_setCoords. len:${coordinates.length}`);
        const type = this._geomType;
        coordinates = this._processCoordsForEditGeom(coordinates);
        if (this._editableFeature) {
            //Feature already exists, set updated coords
            this._editableFeature.setLngLats(coordinates);
        } else {
            //Need to create new ol feature to modify
            this.source.clear();
            this._editableFeature = this._overlay.addGeom({ type, coordinates });
            this.setInteractionsFor(this._isDrawing ? 'drawing' : 'modifying');
        }

        this._roundtripToOriginal = this._roundtripMapping(
            geometry({ type, coordinates }),
            geometry({ type, coordinates: this._editableFeature.getLngLats() })
        );

        this._validatePolygon();
    }

    /**
     * When removing the last point in a linestring geom when drawing or appending (ie not editing) the last point must be
     *  duplicated to ensure geometry is not lost
     * Pushs the last coord to coords
     * @param {Array} coords
     */
    _processCoordsForEditGeom(coords) {
        if (!coords) return;
        if (this.geomType !== 'LineString') return coords;

        //geom is LineString

        //olDraw modifies the last coordinate to follow the mouse movements
        //we need to include a coordinate to be used for this otherwise the last coordinate gets lost
        //also, OpenLayers expects linestring features to always have two points
        if (this._isDrawing || coords.length === 1) {
            return [...coords, coords[coords.length - 1]];
        }
        return coords;
    }

    _handleModifyStart(e) {
        this._modifying = true;
    }

    _handleModifyEnd(e) {
        this._modifying = false;
        this.map.fire('geomdraw-modifyend', e);
        return this._changed(e);
    }

    /*
     * Called when the user changes the geometry
     * information can then be used for undo
     */
    _changed(e) {
        let coords = this._getEditedGeomCoords();

        if (e?.type == 'pointerdown') this._clicked = true;

        trace(8, `geometry changed. coords: ${coords}`);

        if (this._shouldAddToRedoStack(coords) && e?.type !== 'undo') {
            this._redoStack.push(coords);
            trace(6, `redo stack changed. size: ${this._redoStack.currentStackIndex}`);
        }
        this.map.fire('geomdraw-changed', e);
        return true; //Want other interactions to be able to handle pointerdown events
    }

    /**
     * Returns true if a new set of coordinates should get added to the undo stack
     * @param {Object} latLngs
     * @returns {boolean}
     * @private
     */
    _shouldAddToRedoStack(latLngs) {
        const currentRedoStack = this._redoStack.current();
        return !isEqual(currentRedoStack, latLngs);
    }

    /**
     * Update openlayers sketch feature to reflect coords of current _editableFeature
     * OpenLayers draw sketch feature is updated on pointer move or drawing commit
     * as this geometry changes based on the context menu click the geom will not be updated to reflect the reversed geom
     * Not a problem when not appending vertex as geom will be updated via a different event before it is seen to be wrong by the user
     * Seems to be a deficiency in OL.
     * ENH: Check if OL provide an 'updateSketchCoords' API in a future update
     */
    _updateOpenLayersSketchFeature(coords) {
        this.olDraw.sketchFeature_?.getGeometry().setCoordinates(coords);
        this.olDraw.sketchCoords_ = coords;
        if (this.geomType == 'Polygon' && this.olDraw.sketchLine_) {
            this.olDraw.sketchLineCoords_ = coords[0].slice(0, -1);
            this.olDraw.sketchLine_.getGeometry().setCoordinates(this.olDraw.sketchLineCoords_);
        }
        this.olDraw.updateSketchFeatures_();
    }

    /*
     * Sets new draw mode to start drawing a hole
     * @param {*} e
     */
    _startDrawingHole(e) {
        if (!modifierKeyPressed(e.originalEvent) || this.holeDraw) return;
        this._olMap.removeInteraction(this.drag);
        this._clicked = true; //Must have clicked if drawing hole

        const styleFunction = getEditStyleFor(this._geomType, this.options);
        this.holeDraw = new Draw({
            source: this.source,
            type: 'Polygon',
            style: styleFunction,
            condition: this._holeDrawCondition
        });
        this._olMap.addInteraction(this.holeDraw);
        this.holeDraw.startDrawing_(e.coordinate); //ENH: Find a way without using internal method
        this.holeDraw.on('drawend', this._handleHoleCommit);
        return false;
    }

    _holeDrawCondition(event) {
        if (primaryAction(event) || platformModifierKeyOnly(event)) return true;
    }

    /*
     * Removes draw mode when hole is commited, set geom of editable feature
     * @param {*} e
     */
    _handleHoleCommit(e) {
        if (!this._editableFeature) return; //Not really drawing so should return
        this.holeDraw.un('drawend', this._handleHoleCommit);
        this._olMap.removeInteraction(this.holeDraw);
        this.holeDraw = null;
        const coords = e.feature.getGeometry().getCoordinates()[0];
        const linearRing = new LinearRing(coords);
        this._editableFeature.getGeometry().appendLinearRing(linearRing);
    }

    /**
     * Returnings a mapping from roundtrip coordinates to original ones
     * A routrip coordinate is a coordinate that has been projected an unprojected back.
     * In this process precision can be affected by a small amount but this can be a problem when modifying
     * coordinates that haven't been touched by the user
     * This mapping can be used to keep the original values of the coordinates not modified by the user
     * @param {geometry} originalGeometry
     * @param {geometry} roundtripGeom
     * @private
     */
    _roundtripMapping(originalGeometry, roundtripGeom) {
        const roundtripFlat = roundtripGeom.flatCoordinates();
        const roundtripToOriginal = {};
        originalGeometry.forEachCoord((c, i) => {
            roundtripToOriginal[roundtripFlat[i].join(',')] = c;
        });
        return roundtripToOriginal;
    }

    /**
     * Util to return true if user is drawing from scratch, or adding hole, else false
     * @returns {boolean}
     */
    isDrawing() {
        return this._isDrawing || this.holeDraw;
    }

    /**
     * Util to return true if user is drawing the first point
     * @returns {boolean}
     */
    isDrawingFirstPoint() {
        return this._isDrawing && !this._clicked;
    }

    /*
     * Used by client test suite to work out which sort of events to fire
     * @returns true
     */
    shouldUseOpenLayersEvents() {
        return true;
    }
}

export default GeomDrawMode;
