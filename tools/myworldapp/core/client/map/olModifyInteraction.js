import { Modify } from 'ol/interaction';
import { always } from 'ol/events/condition';
import { distance } from 'ol/coordinate';
import { getVerticesAndMidpointsOf } from './geomUtils';

/**
 * Modifies a LineString or Polygon feature by allowing the vertex or midpoint to be moved.
 * Should not be used with Point features.
 * When the vertex or midpoint is not clicked, feature is not modified - allows olDragInteraction
 * @extends {ol/interaction/Modify}
 * @private
 */
export class olModifyInteraction extends Modify {
    /**
     * @param {Object} options
     */
    constructor(options) {
        super({
            source: options.source,
            condition: always,
            style: options.style,
            deleteCondition: options.deleteCondition
        });
        this.map = options.map;
        //  There was a bug where clicks were propagated up to the map if a vertex was clicked. We intercept it using this variable
        this._pointWasRemoved = false;
    }

    /**
     * Allows modification to feature if feature is clicked and if vertex or midpoint is clicked
     * @param {event} evt
     */
    handleDownEvent(evt) {
        //Check if we have a feature
        const editFeature = this.source_.getFeatures()[0];
        const feature = this.map.forEachFeatureAtPixel(evt.pixel, clickedFeature => {
            if (clickedFeature == editFeature) return editFeature;
        });
        let shouldModify = false;
        if (!feature) return false;

        //Check is click is on vertex or midpoint
        let coordinates;
        if (feature.getGeometry().getType() !== 'Point') {
            coordinates = getVerticesAndMidpointsOf(feature);
        } else {
            //Points should always be modified on pointer down
            super.handleDownEvent(evt);
            return true;
        }

        const pixelTolerance = this.map.getSelectTolerance();
        const tolerance = pixelTolerance * this.map.getResolution();
        for (const olCoord of coordinates) {
            if (distance(evt.coordinate, olCoord) <= tolerance) {
                shouldModify = true;
                break;
            }
        }

        if (shouldModify) {
            super.handleDownEvent(evt);
            return true;
        } else return false; //Click isn't on vertex or midpoint - dont modify
    }

    /*
    Calls the original handleUpEvent with the additional functionality of stopping event propagation if a vertex was removed
    */
    handleUpEvent(evt) {
        const ret = super.handleUpEvent(evt);
        if (this._pointWasRemoved) {
            this._pointWasRemoved = false;
            evt.stopPropagation();
        }
        return ret;
    }

    /*
    Intercept the original call to removePoint, storing the result for use in handleUpEvent
    */
    removePoint() {
        const ret = super.removePoint();
        this._pointWasRemoved = ret;
        return ret;
    }
}

export default olModifyInteraction;
