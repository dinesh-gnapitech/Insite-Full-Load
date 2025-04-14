import Snap from 'ol/interaction/Snap';
import Point from 'ol/geom/Point';
import { Feature } from 'ol';
import { Vector as VectorSource } from 'ol/source';
import VectorLayer from 'ol/layer/Vector';
import { Fill, RegularShape, Stroke, Style } from 'ol/style';

/**
 * Extends the default ol/Snap interaction by adding a snap guide feature
 * to the position the current feature will snap to on mouse up
 * Only adds a marker when the user is drawing the first point of a polygon or a linestring
 * @extends {ol/interaction/Snap}
 * @private
 */
export class olSnapInteraction extends Snap {
    /**
     * @param {Object} options
     */
    constructor(options) {
        super({ features: options.features, pixelTolerance: options.pixelTolerance });
        this.map = options.map;
    }

    /**
     * Adds snap marker to the vertex returned by the super's snap to method
     * Only adds a marker when the user is drawing the first point of a polygon or a linestring
     * @param {Array} pixel
     * @param {Array} pixelCoordinate
     * @param {ol/map} map
     * @returns {Object} results - same as what is returned from the super's snapTo method
     */
    snapTo(pixel, pixelCoordinate, map) {
        const results = super.snapTo(pixel, pixelCoordinate, map);
        const intMode = this.map.currentInteractionMode();
        //We want a snap marker only if user is drawing or editing a point feature
        if (!intMode.isDrawingFirstPoint() || intMode.geomType == 'Point') {
            //User has clicked or is drawing point, so no need for marker
            this.removeSnapMarker();
            return results;
        }
        if (results) {
            if (!this._snapMarker) {
                //Add snap marker feature
                this.addSnapMarker(results.vertex);
            } else {
                this._snapMarker.getGeometry().setCoordinates(results.vertex);
            }
            this.snappedCoordinates = results.vertex;
        } else {
            this.removeSnapMarker();
        }

        return results;
    }

    /**
     * Creates a snap marker at location
     * @param {Array} coordinate Projected coordinate
     */
    addSnapMarker(coordinate) {
        this._snapMarker = new Feature(new Point(coordinate));
        const styleFunction = this.getSnapMarkerStyle();
        this._snapMarker.setStyle(styleFunction);
        this.source = new VectorSource();
        this.source.addFeature(this._snapMarker);
        const overlay = new VectorLayer({ source: this.source });
        overlay.setZIndex(210); //should be above geom draw mode layer
        this.map.addLayer(overlay);
    }

    removeSnapMarker() {
        if (this.source && this._snapMarker) this.source.removeFeature(this._snapMarker);
        this._snapMarker = null;
    }

    getSnapMarkerStyle() {
        const snapMarkerSquare = new RegularShape({
            points: 4,
            radius: 6.5,
            fill: new Fill({
                color: 'white'
            }),
            angle: Math.PI / 4,
            stroke: new Stroke({ color: '#666', width: 1 })
        });
        return new Style({ image: snapMarkerSquare });
    }
}

export default olSnapInteraction;
