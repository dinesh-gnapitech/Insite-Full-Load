// Copyright: IQGeo Limited 2010-2023
import geometry from './geomFactory';
import factory from './factory';
import geometryMixin from './geometryMixin';
import lineMixin from './lineMixin';
import { withoutDuplicates } from './utils';

/* globals turf: false */

/**
 * One dimensional connected directed object.
 * Internally consists of list of coordinates. Must have two or more to be valid
 * @class LineString
 * @extends {GeometryMixin}
 * @extends {LineMixin}
 * @see {@link module:geometry} for object creation
 * @example
 * var p = geometry({type: 'LineString', coordinates: [[0.175, 52.188], [0.176, 52.190], [0.176, 52.192]]});
 * p.area();
 * @example
 * var p1 = geometry.lineString([[0.175, 52.188], [0.176, 52.190], [0.176, 52.192]]);
 */

export default factory(
    geometryMixin,
    lineMixin,
    /** @lends LineString.prototype */
    {
        type: 'LineString',

        /**
         * Returns a curved version by applying a Bezier spline algorithm
         * @param  {number} [resolution=10000]
         * @param  {number} [sharpness=0.85]
         * @return {LineString}
         */
        bezier(resolution = 10000, sharpness = 0.85) {
            this.assertTurf();
            const f = turf.bezierSpline(this, { resolution, sharpness });
            return geometry(f.geometry);
        },

        /**
         * Returns a point at a given distance along the line
         * @param  {number} distance
         * @param  {number} [units=meters]
         * @return {Point}
         */
        pointAtDistance(distance, units = 'meters') {
            this.assertTurf();
            const f = turf.along(this, distance, { units });
            return geometry(f.geometry);
        },

        /**
         * Returns details about the point on self nearest to a given point
         * @param  {Point} point
         * @param  {string} [unit=meters]
         * @return {Point} The closest point with three additional properties:
         *  distance: distance between given point and the closest point
         *  index: closest point was found on nth line part
         *  distanceAlong: distance along the line to the closest point
         */
        pointNearestTo(point, units = 'meters') {
            this.assertTurf();
            const f = turf.pointOnLine(this, point, { units });
            const nearestPoint = geometry(f.geometry);
            nearestPoint.distance = f.properties.dist;
            nearestPoint.index = f.properties.index;
            nearestPoint.distanceAlong = f.properties.location;
            return nearestPoint;
        },

        /**
         * Returns a subsection of self between two points
         * The start & stop points don't need to fall exactly on the line.
         * @param  {Point} startPoint
         * @param  {Point} stopPoint
         * @return {LineString}
         */
        slice(startPoint, stopPoint) {
            this.assertTurf();
            const feature = this._asFeature();
            // when self is a linestring in loop, when getting second section, `this.slice()` will
            // return the same coordinates as firstSection.
            // This is the behaviour of 'turf.lineSlice()', using `nearestPointOnLine()` to check
            // the line from the start of coordinates array.
            // So, getting section from target point to the end of line, will be handled as
            // from first point to target point.
            // Skipping the first point as workaround to prevent this problem
            if (
                this.isLineLoop() &&
                this.isLastPoint(stopPoint) &&
                feature.geometry.coordinates.length > 2
            ) {
                // prevent mutate the coordinates directly, spread geometry object and use new coordinates array
                feature.geometry = {
                    ...feature.geometry,
                    coordinates: feature.geometry.coordinates.slice(1)
                };
            }
            const sliced = turf.lineSlice(startPoint, stopPoint, feature);
            return geometry(sliced.geometry);
        },

        /**
         * Returns a subsection of self between the points specified by the distances along the line
         * @param  {number} startDist Distance along the line for the start point
         * @param  {number} stopDist  Distance along the line for the stop point
         * @param  {string} [units=meters]
         * @return {LineString}
         */
        sliceAlong(startDist, stopDist, units = 'meters') {
            this.assertTurf();
            const sliced = turf.lineSliceAlong(this, startDist, stopDist, { units });
            return geometry(sliced.geometry);
        },

        /**
         * Splits self into two linestrings at a given coordinate
         * @param {coordinate} coord
         * @param {boolean} [adjustToCoord=false] If true, the coordinates where the two results meet, get set to the given coordinate
         */
        splitAt(coord, adjustToCoord = false) {
            const coords = this.coordinates;
            const firstSection = this.slice(coords[0], coord);
            const secondSection = this.slice(coord, coords[coords.length - 1]);
            if (
                !firstSection ||
                !firstSection.isValid() ||
                !secondSection ||
                !secondSection.isValid()
            )
                return {};

            firstSection.removeDuplicates();
            secondSection.removeDuplicates();

            if (adjustToCoord) {
                firstSection.coordinates[firstSection.coordinates.length - 1] = coord;
                secondSection.coordinates[0] = coord;
            }

            return { firstSection, secondSection };
        },

        /**
         * Removes consecutive duplicate coordinates from self
         * Returns self
         */
        removeDuplicates() {
            this.coordinates = withoutDuplicates(this.coordinates);
            return this;
        },

        /**
         * Minimum distance to a point
         * @param  {Point}  point
         * @param  {string} [units=meters]
         * @return {number}
         */
        distanceTo(point, units = 'meters') {
            this.assertTurf();
            return turf.pointToLineDistance(point, this, { units, mercator: false });
        },

        /**
         * Returns true if one of self's vertex matches a given coordinate
         * @param  {Array} coordinate
         * @return {boolean}
         */
        containsVertex(coordinate) {
            const coords = this.coordinates;
            for (let i = 0; i < coords.length; i++) {
                if (coordinate[0] == coords[i][0] && coordinate[1] == coords[i[1]]) return true;
            }
            return false;
        },

        /**
         * Returns a new linestring with the coordinates reversed
         * @param  {Array} coordinate
         * @return {boolean}
         */
        reverse() {
            const coords = Array.from(this.coordinates).reverse();
            return geometry.lineString(coords);
        },

        /**
         * Returns the first coordinate
         * @return {coordinate}
         */
        firstCoord() {
            return this.coordinates[0];
        },

        /**
         * Returns the last coordinate
         * @return {coordinate}
         */
        lastCoord() {
            return this.coordinates[this.coordinates.length - 1];
        },

        /**
         * Returns true if the coordinate is first point of the line
         * @param  {array} coordinate
         * @return {boolean}
         */
        isFirstPoint(coordinate) {
            const firstPoint = this.firstCoord();
            return coordinate[0] === firstPoint[0] && coordinate[1] === firstPoint[1];
        },

        /**
         * Returns true if the coordinate is last point of the line
         * @param  {array} coordinate
         * @return {boolean}
         */
        isLastPoint(coordinate) {
            const lastPoint = this.lastCoord();
            return coordinate[0] === lastPoint[0] && coordinate[1] === lastPoint[1];
        },

        /**
         * Returns true if the linestring is a loop
         * when the first and last point coordinates is the same
         */
        isLineLoop() {
            const firstPoint = this.firstCoord();
            const lastPoint = this.lastCoord();
            return firstPoint[0] === lastPoint[0] && firstPoint[1] === lastPoint[1];
        },

        /**
         * Returns true if the linestring is valid
         * If it has more than two points
         * @return {boolean}
         */
        isValid() {
            if (this.coordinates.length >= 2) {
                //returns true if there
                return withoutDuplicates(this.coordinates).length >= 2;
            }
            return false;
        }
    }
);
