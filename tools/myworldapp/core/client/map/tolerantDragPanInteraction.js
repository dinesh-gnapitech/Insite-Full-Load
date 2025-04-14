import DragPan from 'ol/interaction/DragPan';

/**
 * A custom implementation of the DragPan interaction that will only start dragging after
 * the user drags at least 15 pixels, and will fire a click event if its under that.
 * This is to prevent issues where a touch will cause a very small drag, and will make it
 * easier for users to select features
 */
export class TolerantDragPanInteraction extends DragPan {
    constructor(opt_options) {
        super(opt_options);
        //  Track the pointer's coordinates in this object
        this._trackedPointerPositions = {};
        this.toleranceEnabled = false;
    }

    setToleranceMode(enable) {
        this.toleranceEnabled = enable;
    }

    /**
     * If the default handler states we are to handle this touch event, store the initial pixel position of the touch for distance calculation
     */
    handleDownEvent(mapBrowserEvent) {
        const ret = DragPan.prototype.handleDownEvent.call(this, mapBrowserEvent);
        if (this.toleranceEnabled && ret) {
            const event_1 = mapBrowserEvent.originalEvent;
            const id = event_1.pointerId.toString();
            this._trackedPointerPositions[id] = mapBrowserEvent.pixel_;
        }
        return ret;
    }

    /**
     * Compare the touch up position against it's initial position. If the initial touch position isn't the same
     * as the current mapBrowserEvent position, emit a click event at the specified LatLng.
     * After this, clear the stored coordinates for this touch ID
     */
    handleUpEvent(mapBrowserEvent) {
        const ret = DragPan.prototype.handleUpEvent.call(this, mapBrowserEvent);

        if (this.toleranceEnabled) {
            const event_1 = mapBrowserEvent.originalEvent;
            const id = event_1.pointerId.toString();
            const trackedPos = this._trackedPointerPositions[id];
            if (
                trackedPos &&
                trackedPos !== true &&
                (trackedPos[0] !== mapBrowserEvent.pixel_[0] ||
                    trackedPos[1] !== mapBrowserEvent.pixel_[1])
            ) {
                const map = mapBrowserEvent.map;
                map.simulateClickOnMap(mapBrowserEvent.lngLat[1], mapBrowserEvent.lngLat[0]);
            }
            delete this._trackedPointerPositions[id];
        }
        return ret;
    }

    /**
     * For each touch event, if the initial coordinates are flagged as dragging, just call the default handler.
     * If the event pixel distance is 15 pixels or higher, flag this touch as dragging.
     */
    handleDragEvent(mapBrowserEvent) {
        if (this.toleranceEnabled) {
            const event_1 = mapBrowserEvent.originalEvent;
            const id = event_1.pointerId.toString();
            if (this._trackedPointerPositions[id] === true) {
                return DragPan.prototype.handleDragEvent.call(this, mapBrowserEvent);
            }
            const trackedPos = this._trackedPointerPositions[id];
            if (!trackedPos) return DragPan.prototype.handleDragEvent.call(this, mapBrowserEvent);
            const currentPos = mapBrowserEvent.pixel_;
            const hyp = Math.hypot(trackedPos[0] - currentPos[0], trackedPos[1] - currentPos[1]);
            if (hyp >= 15) {
                this._trackedPointerPositions[id] = true;
                return DragPan.prototype.handleDragEvent.call(this, mapBrowserEvent);
            }
        } else {
            return DragPan.prototype.handleDragEvent.call(this, mapBrowserEvent);
        }
    }
}

export default TolerantDragPanInteraction;
