import { toProjCoord, toLatLng } from 'myWorld/base/proj';
import myw, { trace, Util, msg } from 'myWorld-base';
import { getRotationMarkerStyle } from './geomUtils';
import { MapInteractionMode } from './mapInteractionMode';
import { Feature } from 'ol';
import LineString from 'ol/geom/LineString';
import { Vector as VectorSource } from 'ol/source';
import VectorLayer from 'ol/layer/Vector';
import olDragInteraction from './olDragInteraction';
import activeContextMenuIconImg from 'images/activeContextMenuItem.png';
import rotationHandleImg from 'images/markers/rotation_handle.svg';

export class GeomRotateMode extends MapInteractionMode {
    static {
        this.prototype.isGeomRotate = true;

        this.mergeOptions({
            offset: 100,
            rotation: 0
        });
    }

    /**
     * Initialization. Doesn't enable the mode
     * @class Provides a RotationMarker to allow a geometry to be rotated.
     * @param {Map}  map               Map on which the mode will be enabled
     * @param {object}        [options]         *optional* for overwriting default options
     * @param {number}      [options.offset]  Default offset of rotation handle in pixels
     * @constructs
     * @extends {MapInteractionMode}
     */
    constructor(map, options) {
        super(map);
        this._map = map;
        this.setOptions(options);

        this._rotating = false;
        this._rotationMarker = undefined;

        this.handleMapClick = this.handleMapClick.bind(this);
    }

    /**
     * Enables geometry rotating mode with the currently set options
     */
    enable() {
        trace('rotation', 3, 'enable');
        super.enable();
        this._setContextMenuForGeomRotateMode();

        if (!this._overlay) {
            this.source = new VectorSource();
            this._overlay = new VectorLayer({ source: this.source });
            this._map.addLayer(this._overlay);
        }

        this.startRotating();
        if (this.options.coordinatesDialog && !this.coordinatesDialog) {
            //Open coordinates dialog if set in options - pass in same options
            this.coordinatesDialog = new myw.CoordinatesDialog(
                this,
                this.options.coordinatesDialog.options
            );
            this.coordinatesDialog.show();
        }
    }

    /**
     * Disables geometry rotating mode
     */
    disable() {
        trace('rotation', 3, 'disable');
        super.disable();
        this.stopRotating();
        this._map.contextmenu.clear();
        this._rotating = false;
        const mode = this._map.currentInteractionMode();
        if (this.coordinatesDialog) {
            //Close coordinates dialog on leaving mode
            this.coordinatesDialog.close();
            this.coordinatesDialog = null;
            mode.toggleCoordinatesDialog();
        }
        this._overlay.getSource().clear();
        this._map.removeLayer(this._overlay);
        this._overlay = null;

        const coordinates = this.coords;
        mode.setFeatureCoords(coordinates, mode._isOverlayRotatable, mode._rotation);
    }

    /**
     * This RotationMarker will rotate to face map clicks.
     * @param  {MouseEvent} event Mouse click event
     */
    handleMapClick(event) {
        this.rotateToPointer(event);
        return true;
    }

    /**
     * @return {boolean} True if a rotation marker is currently active
     */
    isRotating() {
        return this.isUsable() && this._rotating;
    }

    /**
     * Check if this GeomRotateMode has what it requires to rotate a geometry
     * @returns {boolean} True if this mode is able to create a rotation marker
     */
    isUsable() {
        if (!this.isEnabled()) return false;
        if (!this._map) return false;
        if (this._geomType != 'Point') return false;
        if (!this._editableFeature) return false; //cannot turn on rotate mode when feature has failed to be inserted
        return true;
    }

    /**
     * Sets the geometry type to create/edit.
     * @param {string} geomType One of 'Point', 'LineString' or 'Polygon'
     */
    setGeomType(geomType) {
        this._geomType = geomType;
    }

    /**
     * Sets the overlay to use when rotating an existing geometry
     * @param {geomCoordinates} overlay Overlay/geometry to rotate
     */
    setFeatureCoords(coords, feature) {
        this._editableFeature = feature;
        this.coords = coords;
    }

    /**
     * Assign an operation to handle rotation changes within this mode
     * @param {Function} func   The operation to run when rotation changes
     */
    setRotationChangeHandler(func) {
        this._rotationChangeHandler = func;
    }

    /**
     * Adds a RotationMarker to manage rotating the geometry.
     * If the optional event is provide the RotationMaker will rotate to
     * face the event.
     * @param  {MouseEvent} event (optional) Mouse click event
     */
    startRotating(event) {
        if (!this.isUsable()) return;

        if (this._rotationMarker) this.removeRotationMarker();

        const bounds = this._map.toLatLngBounds(this._editableFeature.getGeometry().getExtent());
        const geomCenter = bounds.getCenter();
        const latlng = event?.latlng
            ? this._map.toLatLng(event.latlng)
            : this._calculateOffsetPosition(geomCenter, this.options.rotation);

        this.addRotationMarker(latlng, geomCenter);
        if (this._rotationChangeHandler)
            this._rotationMarker.setRotationChangeHandler(this._rotationChangeHandler);
        if (event?.latlng) this._rotationMarker.setLatLng(event.latlng);
    }

    /**
     * Removes the existing RotationMarker.
     */
    stopRotating() {
        this.removeRotationMarker();
    }

    /**
     * Start rotating, or stop rotating if already active.
     * @param  {MouseEvent} event (optional) Mouse click event
     */
    toggleRotation(event) {
        if (!this._rotating) this.startRotating(event);
        else this.stopRotating();
    }

    /**
     * Add a new RotationMarker to the map.
     * Remove's the existing rotationMarker if one is present
     * @param {LatLng} latlng              Position of the RotationMarker's handle
     * @param {LatLng} centerOfRotation    Position of the RotationMarker's center of rotation
     */
    addRotationMarker(latlng, centerOfRotation) {
        if (this._rotationMarker) this.removeRotationMarker();

        this._rotationMarker = new RotationMarker(latlng, centerOfRotation, this.source, {
            offset: this.options.offset,
            calculateOffsetPosition: this._calculateOffsetPosition.bind(this),
            map: this._map
        });
        this._rotationMarker.add(this._map);
        this._rotating = true;
        this.setMapEventListeners(this._map, 'on');
    }

    /**
     * Remove existing RotationMarker.
     */
    removeRotationMarker() {
        if (this._rotationMarker) {
            this.setMapEventListeners(this._map, 'off');
            this._rotationMarker.remove();
            this._rotationMarker = undefined;
        }
        this._overlay.getSource().clear();
        this._map.removeLayer(this._overlay);
        this._rotating = false;
    }

    /**
     * Enable or disable map Event listeners
     * The rotation engine listenst to these events while rotating to control rotation.
     * @param {Map}    map       The map being used we add the rotationMarkers to.
     * @param {string} onOrOff   'on' to enable, 'off' to disable
     */
    setMapEventListeners(map, onOrOff) {
        map[onOrOff]('singleclick', this.handleMapClick);
        map[onOrOff]('zoomend', this._rotationMarker.onMapZoomEnd);
    }

    /**
     * Rotates RotationMarker to face the Mouse click event
     * Will call startRotating if we aren't already rotating.
     * @param  {MouseEvent} event (optional) Mouse click event
     */
    rotateToPointer(event) {
        if (!event || !event.latlng) return;

        if (!this.isRotating()) {
            this.startRotating(event);
        } else {
            const centerOfRotation = this._rotationMarker.getCenterOfRotation();
            const theta = centerOfRotation.bearingTo(event.latlng);
            const latlng = this._calculateOffsetPosition(centerOfRotation, theta);
            this._rotationMarker.setLatLng(latlng);
        }
    }

    /*
     * Ends the current map interaction mode.
     */
    _endGeomRotateMode() {
        this._map.endCurrentInteractionMode();
    }

    /*
     * Context menu provides option to end this rotation mode
     */
    _setContextMenuForGeomRotateMode() {
        const contextmenu = this._map.contextmenu;
        contextmenu.clear();

        const endGeomRotateMode = {
            text: msg('GeomRotateMode', 'geomRotateMode'),
            icon: activeContextMenuIconImg,
            callback: this._endGeomRotateMode.bind(this)
        };

        contextmenu.extend([endGeomRotateMode]);
    }

    /**
     * calculates an offset position using an origin and direction
     * @param {LatLng} origin   Original LatLng
     * @param {float}    theta    Bearing in decimal degrees
     * @returns {LatLng}
     * @private
     */
    _calculateOffsetPosition(origin, theta = 0) {
        const PtA = toProjCoord(origin, this._map.getView().getProjection());
        const resolution = this._map.getView().getResolution();
        const offsetInMeters = this.options.offset * resolution;
        const PtB = Util.createPointByVector(PtA, offsetInMeters, theta);
        return toLatLng(PtB, this._map.getView().getProjection());
    }
}

export class RotationMarker {
    /**
     * @class Provides RotationMarker when editing a rotatable geometry.
     * @param  {LatLng}   latlng            Position of the RotationMarker's handle
     * @param  {LatLng}   centerOfRotation  Position of the RotationMarker's center of rotation
     * @param  {object}   [options]
     * @param  {boolean}  [options.offset=50] Length of RotationMarker's handle in pixels.
     * @constructs
     */
    constructor(latlng, centerOfRotation, source, options) {
        this._latlng = latlng;
        this.source = source;
        this._calculateOffsetPosition = options.calculateOffsetPosition;
        this.map = options.map;

        [
            'getCenterOfRotation',
            'setCenterOfRotation',
            'getOffset',
            'setOffset',
            'setRotationChangeHandler',
            'update',
            'onDrag',
            'onDragEnd',
            'onMapZoomEnd',
            '_reposition',
            '_setEventListeners',
            '_updateRotationLine',
            '_updateRotation'
        ].forEach(method => (this[method] = this[method].bind(this)));

        this.drag = new olDragInteraction({
            map: this.map,
            source: this.source,
            usePoints: true
        });
        this.map.addInteraction(this.drag);

        this._offset = options.offset;
        this._lineStyle = options.lineStyle;
        this.setCenterOfRotation(centerOfRotation);
        this._rotation = this._centerOfRotation.bearingTo(this._latlng);

        options.iconUrl = options.iconUrl || rotationHandleImg;
        options.lineStyle = options.lineStyle || {
            color: 'rgba(128,0,0,0.6)',
            weight: 2,
            dashArray: [2, 4]
        };
        options.offset = options.offset || 50;

        const rotationMarkerStyle = getRotationMarkerStyle(
            options.lineStyle,
            options.iconUrl,
            options.offset
        );

        this._rotationLine = new Feature(
            new LineString([
                toProjCoord(this.getCenterOfRotation(), this.map.proj),
                toProjCoord(this._latlng, this.map.proj)
            ])
        );
        this._rotationLine.setStyle(rotationMarkerStyle);
    }

    /**
     * Get this marker's center of rotation
     * @return {LatLng}
     */
    getCenterOfRotation() {
        return this._centerOfRotation;
    }

    /**
     * Update RotationMarker to a new center of rotation.
     * @param {LatLng} latlng
     */
    setCenterOfRotation(latlng) {
        this._centerOfRotation = latlng;
        this.update();
    }

    /**
     * Updates rotationLine when RotationMarker is updated.
     */
    update(e) {
        if (e) this._latlng = this.map.toLatLng(e.target.coordinate);
        this._updateRotationLine();
        this._updateRotation();
    }

    /**
     * Returns this RotationMarker's current offset value
     * @returns {float} distance in pixels
     */
    getOffset() {
        return this._offset;
    }

    /**
     * Assign a new offset to this rotationMarker
     * This will reposition the end of the rotationMarker
     * @param {float} offset  distance of offset in pixels
     */
    setOffset(offset) {
        this._offset = offset;
        this._reposition();
    }

    /**
     * Assign function to call when this marker's rotation changes.
     * @param {Function} func function to call when rotation changes.
     */
    setRotationChangeHandler(func) {
        this._rotationChangeHandler = func;
    }

    /**
     * Redraw this marker's rotation line
     * @private
     */
    _updateRotationLine() {
        if (this._rotationLine) {
            const center = toProjCoord(this._centerOfRotation, this.map.proj);
            const endPoint = toProjCoord(this._latlng, this.map.proj);
            this._rotationLine.getGeometry().setCoordinates([center, endPoint]);
        }
    }

    /**
     * Update this marker's rotation and trigger rotationChange
     * @private
     */
    _updateRotation() {
        this._rotation = this._centerOfRotation.bearingTo(this._latlng);
        this._rotationChangeHandler?.(this._rotation);
    }

    /**
     * Add rotationLine and listeners for this marker when it is added to a map.
     */
    add() {
        this._setEventListeners('on');
        this.source.addFeature(this._rotationLine);
    }

    /**
     * Remove rotationLine and listeners when this marker is removed from a map.
     */
    remove() {
        this.source.removeFeature(this._rotationLine);
        this.map.removeInteraction(this.drag);
        this._setEventListeners('un');
    }

    setLatLng(latlng) {
        this._latlng = latlng;
        this.update();
    }

    /**
     * Reposition rotationLine as this marker is dragged
     */
    onDrag() {
        this.update();
    }

    /**
     * Update this marker's rotation when drag ends.
     */
    onDragEnd() {
        this.update();
    }

    /**
     * Reposition this marker when MapZoom changes.
     * @param {event} e original event
     */
    onMapZoomEnd(e) {
        this._reposition();
    }

    /**
     * Enable/disable this marker's listeners
     * @param {string} onOrUn
     * @private
     */
    _setEventListeners(onOrUn) {
        this.drag[onOrUn]('drag', this.update);
        this.drag[onOrUn]('dragend', this.update);
    }

    /**
     * Reposition this marker according to it's center of rotation, rotation, and offset
     * @private
     */
    _reposition() {
        this._latlng = this._calculateOffsetPosition(this._centerOfRotation, this._rotation);
        this._updateRotationLine();
    }
}

export default GeomRotateMode;
