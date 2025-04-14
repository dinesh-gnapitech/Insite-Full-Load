import { Pointer as PointerInteraction } from 'ol/interaction';
import { distance } from 'ol/coordinate';
import { getVerticesAndMidpointsOf } from './geomUtils';

/**
 * Drags a feature under the mouse. If the feature is a LineString or Polygon,
 * dragging is disabled when pointerdown is over a vertex or midpoint of a line
 * @extends {ol/interaction/Pointer}
 * @private
 */
export class olDragInteraction extends PointerInteraction {
    /**
     * @param {Object} options
     * @param {Map} options.map
     */
    constructor(options) {
        super();

        this.map = options.map;

        /**
         * @type {ol/coordinate/Coordinate}
         * @private
         */
        this.coordinate = null;

        /**
         * @type {string|undefined}
         * @private
         */
        this._cursor = 'pointer';

        /**
         * @type {Feature}
         * @private
         */
        this._feature = null;

        /**
         * @type {string|undefined}
         * @private
         */
        this._previousCursor = undefined;

        /**
         * Vector source
         * @type {ol/Vector}
         */
        this.source = options.source;

        /**
         * Option to enable dragging when modifing a point - used in rotation mode
         */
        this.usePoints = options.usePoints;
    }

    /**
     * Starts dragging if clicked on a feature
     * If feature is LineString or Polygon doesn't allow dragging when clicked on vertex or midpoint
     * @param {ol/MapBrowserEvent} evt Map browser event.
     * @return {boolean} `true` to start the drag sequence.
     */
    handleDownEvent(evt) {
        const map = evt.map;
        const pixelTolerance = this.map.getSelectTolerance();

        const features = this.source.getFeatures();
        const feature = map.forEachFeatureAtPixel(
            evt.pixel,
            function (feature) {
                if (features.includes(feature)) return feature;
            },
            { hitTolerance: pixelTolerance }
        );
        let shouldDrag = true;
        if (!feature) return false;

        //Disable dragging when clicking on a vertex or midpoint (unless this.usePoints is true)
        const shouldEnableDragging = feature.getGeometry().getType() !== 'Point' && !this.usePoints;
        if (shouldEnableDragging) {
            const coordinates = getVerticesAndMidpointsOf(feature);

            const pixelTolerance = this.map.getSelectTolerance();
            const tolerance = pixelTolerance * this.map.getResolution();
            for (const olCoord of coordinates) {
                if (distance(evt.coordinate, olCoord) <= tolerance) {
                    shouldDrag = true;
                    break;
                }
            }
        }

        this.coordinate = evt.coordinate;
        this._feature = feature;

        return !!feature && shouldDrag;
    }

    /**
     * Moves feature
     * @param {ol/MapBrowserEvent} evt Map browser event.
     */
    handleDragEvent(evt) {
        if (!this.coordinate) return;
        const deltaX = evt.coordinate[0] - this.coordinate[0];
        const deltaY = evt.coordinate[1] - this.coordinate[1];

        //Move feature
        const geometry = this._feature.getGeometry();
        geometry.translate(deltaX, deltaY);

        this.coordinate[0] = evt.coordinate[0];
        this.coordinate[1] = evt.coordinate[1];
        this.dispatchEvent('drag');
    }

    /**
     * Sets cursor when mouse moves over a feature
     * @param {ol/MapBrowserEvent} evt Event.
     */
    handleMoveEvent(evt) {
        if (this._cursor && !this.map.currentInteractionMode().isDrawing()) {
            const map = evt.map;
            const feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
                return feature;
            });
            const element = evt.map.getTargetElement();
            if (feature && this.source.getFeatures()[0]?.ol_uid === feature.ol_uid) {
                if (element.style.cursor != this._cursor) {
                    this._previousCursor = element.style.cursor;
                    element.style.cursor = this._cursor;
                }
            } else if (this._previousCursor !== undefined) {
                element.style.cursor = this._previousCursor;
                this._previousCursor = undefined;
            }
        }
    }

    /**
     * Dispatches dragend event
     * @return {boolean} `false` to stop the drag sequence.
     */
    handleUpEvent() {
        this.dispatchEvent('dragend');
        this.coordinate = null;
        this._feature = null;

        return false;
    }
}

export default olDragInteraction;
