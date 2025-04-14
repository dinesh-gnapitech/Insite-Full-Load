// Copyright: IQGeo Limited 2010-2023
import geometry from './geomFactory';

/* globals turf: false */

/**
 * Mixin for common behaviour in {@link LineString} and {@link MultiLineString}
 * @mixin LineMixin
 */

/** @lends LineMixin.prototype */
const LineMixin = {
    /**
     * distance using haversine formula for global curvature
     * @param  {string} [unit='meters']
     * @return {number}
     */
    length(unit = 'meters') {
        this.assertTurf();
        return turf.lineDistance({ type: 'Feature', geometry: this }, { units: unit });
    },

    /**
     * Points of intersection with another geometry
     * In the case of polygons, the boundaries are used (line intersection)
     * @param  {LineString|MultiLineString|Polygon|MultiPolygon} another
     * @return {Point[]}
     */
    intersectionsWith(another) {
        this.assertTurf();
        const fc = turf.lineIntersect(this.noProto(), another.noProto());
        const geoms = fc.features.map(feature => feature.geometry);
        return geoms.map(geometry);
    },

    /**
     * Whether self intersects with a given geometry.
     * In the case of polygons, the boundaries are used (line intersection)
     * @param  {LineString|MultiLineString|Polygon|MultiPolygon} another
     * @return {boolean}
     */
    intersects(another) {
        return this.intersectionsWith(another).length > 0;
    },

    /**
     * A list of self intersections
     * @return {Point[]}
     */
    selfIntersections() {
        this.assertTurf();
        const fc = turf.kinks(this);
        return fc.features.map(feature => feature.geometry);
    },

    /**
     * Whether there are any self-intersections or not
     * @return {boolean}
     */
    selfIntersects() {
        return this.selfIntersections().length > 0;
    }
};

export default LineMixin;
