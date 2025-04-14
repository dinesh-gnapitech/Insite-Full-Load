// Copyright: IQGeo Limited 2010-2023
import geometry from './geomFactory';
import factory from './factory';
import geometryMixin from './geometryMixin';
import polygonMixin from './polygonMixin';
import lineString from './linestring';
import multiLineString from './multiLineString';
import region from './region';
import { withoutDuplicates } from './utils';

/* globals turf: false */

/**
 * Single connected region, potentially containing holes
 * Has an outer boundary and a set of inner boundaries
 * @class Polygon
 * @extends {GeometryMixin}
 * @extends {PolygonMixin}
 * @see {@link module:geometry} for object creation
 * @example
 * var p = geometry({type: 'Polygon', coordinates: [[[0,0],[0,1],[1,1],[1,0],[0,0]]]});
 * p.area();
 * @example
 * var p1 = geometry.polygon([[0.175, 52.188], [0.176, 52.190], [0.176, 52.192]]);
 */

export default factory(
    geometryMixin,
    polygonMixin,
    /** @lends Polygon.prototype */
    {
        type: 'Polygon',

        /**
         * Returns area in square meters
         * @return {number}
         */
        area() {
            this.assertTurf();
            return turf.area(this._asFeature());
        },

        /**
         * Obtains the outer boundary or boundaries of the polygon/multi polygon
         * @return {LineString}
         */
        outer() {
            return lineString(this.coordinates[0]);
        },

        /**
         * Obtains the boundaries of self
         * @return {MultiLineString}
         */
        boundaries() {
            return multiLineString(this.coordinates);
        },

        /**
         * Returns the union of self with another polygon or polygons
         * If the input polygons are not contiguous, this function returns a MultiPolygon feature.
         * @param {Polygon|Polygon[]} others
         * @return {Poylgon|MultiPolygon}
         */
        union(others) {
            this.assertTurf();
            const pols = [this].concat(others);
            const f = turf.union(...pols.map(pol => pol._asFeature()));
            return geometry(f.geometry);
        },

        /**
         * Returns the intersection of self with another polygon or polygons
         * @param {Polygon|Polygon[]} another
         * @return {undefined|Geometry} Geometry representing the point(s) they share, the borders they share or the area they share. If they do not share any point, returns undefined
         */
        intersect(another) {
            this.assertTurf();
            const f = turf.intersect(this, another);
            return f && geometry(f.geometry);
        },

        /**
         * Removes consecutive duplicate coordinates from self
         */
        removeDuplicates() {
            this.coordinates = this.coordinates.map(withoutDuplicates);
            return this;
        },

        /**
         * True if no intersections (outer ring and holes) and holes are contained in outer ring
         * @return {Boolean}
         */
        isValid() {
            const nHoles = this.coordinates.length - 1;
            const isValid = this.coordinates.every(
                (
                    ring //check if ring is a valid region (closed, not self intersecting)
                ) => region(ring).isValid()
            );
            if (!isValid) return false;
            if (nHoles === 0) return true;
            if (this._ringsIntersect()) return false;
            if (this._holesOutsideBoundary()) return false;
            if (nHoles > 1 && this._holesInsideHoles()) return false;

            return true;
        },

        _ringsIntersect() {
            const coords = this.coordinates;
            for (let i = 0; i < coords.length; i++) {
                const ring1 = lineString(coords[i]);
                for (let j = i + 1; j < coords.length; j++) {
                    const ring2 = lineString(coords[j]);
                    if (ring1.intersects(ring2)) return true;
                }
            }
            return false;
        },

        //true if any hole is outside the boundary
        //assumes holes don't intersect boundary
        _holesOutsideBoundary() {
            const coords = this.coordinates;
            const boundary = region(coords[0]);
            for (let i = 1; i < coords.length; i++) {
                //since hole doesn't intersect boundary we can check just one point
                const ring = coords[i];
                if (!boundary.containsPoint(ring[0])) return true;
            }
        },

        //assumes holes don't intersect each other
        _holesInsideHoles() {
            const rings = this.coordinates;
            for (let i = 1; i < rings.length; i++) {
                const hole1 = region(rings[i]);
                for (let j = 1; j < rings.length; j++) {
                    if (i === j) continue;
                    const pointOfHole2 = rings[j][0];
                    if (hole1.containsPoint(pointOfHole2)) return true;
                }
            }
            return false;
        }
    }
);
