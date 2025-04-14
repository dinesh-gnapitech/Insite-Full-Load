// Copyright: IQGeo Limited 2010-2023
import geometry from './geomFactory';
import factory from './factory';
import geometryMixin from './geometryMixin';

/* globals turf: false */

/**
 * @see {@link module:geometry} for object creation
 * @class Point
 * @extends {GeometryMixin}
 * @example
 * var p = geometry({type: 'Point', coordinates: [0.1261,52.2014]});
 * p.area();
 * @example
 * var p1 = geometry.point([0.1261, 52.2014]);
 */

export default factory(
    geometryMixin,
    /** @lends Point.prototype */
    {
        type: 'Point',

        /**
         * Distance to another point using haversine formula for global curvature
         * @param  {Point}  another
         * @param  {string} [units=meters]
         * @return {number}
         */
        distanceTo(another, units = 'meters') {
            this.assertTurf();
            return turf.distance(this, another, { units });
        },

        /**
         * Calculates a Polygon buffer aproximating a circle, around self's coordinate
         * @param  {number}  radius
         * @param  {number}[steps=64]
         * @param  {unit}    [units='meters']
         * @return {Polygon}
         */
        circle(radius, steps = 64, units = 'meters') {
            this.assertTurf();
            const buffer = turf.circle(this, radius, { steps, units });
            return geometry(buffer.geometry);
        },

        /**
         * Returns self
         * So that you can call on any type of geometry without testing
         */
        removeDuplicates() {
            //so it can be applied to any kind of geometry
            return this;
        },

        /**
         * Returns self's coordinate
         * So that you can call on any type of geometry without testing
         */
        firstCoord() {
            return this.coordinates;
        },
        /**
         * Returns self's coordinate
         * So that you can call on any type of geometry without testing
         */
        lastCoord() {
            return this.coordinates;
        }
    }
);
