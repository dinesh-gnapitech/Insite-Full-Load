// Copyright: IQGeo Limited 2010-2023
import factory from './factory';
import geometryMixin from './geometryMixin';
import polygonMixin from './polygonMixin';
import multiLineString from './multiLineString';
import { withoutDuplicates } from './utils';

/**
 * @see {@link module:geometry} for object creation
 * @class MultiPolygon
 * @extends {GeometryMixin}
 * @extends {LineMixin}
 */

export default factory(
    geometryMixin,
    polygonMixin,
    /** @lends MultiPolygon.prototype */
    {
        type: 'MultiPolygon',

        /**
         * Obtains the outer boundary or boundaries of the polygon/multi polygon
         * @return {MultiLineString}
         */
        outer() {
            return multiLineString(this.coordinates.map(linearRings => linearRings[0]));
        },

        /**
         * Obtains the boundaries of self
         * @return {MultiLineString}
         */
        boundaries() {
            //flatten and return as multilinestring
            return multiLineString(
                this.coordinates.reduce((acc, linearRings) => acc.concat(linearRings), [])
            );
        },

        /**
         * Removes consecutive duplicate coordinates from self
         */
        removeDuplicates() {
            this.coordinates = this.coordinates.map(linearRings =>
                linearRings.map(withoutDuplicates)
            );
            return this;
        }
    }
);
