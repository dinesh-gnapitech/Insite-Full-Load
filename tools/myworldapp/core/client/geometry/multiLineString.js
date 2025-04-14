// Copyright: IQGeo Limited 2010-2023
import factory from './factory';
import geometryMixin from './geometryMixin';
import lineMixin from './lineMixin';
import { withoutDuplicates } from './utils';

/**
 * @see {@link module:geometry} for object creation
 * @class MultiLineString
 * @extends {GeometryMixin}
 * @extends {LineMixin}
 */
export default factory(
    geometryMixin,
    lineMixin,
    /** @lends MultiLineString.prototype */
    {
        type: 'MultiLineString',

        /**
         * Removes consecutive duplicate coordinates from self
         * Returns self
         */
        removeDuplicates() {
            this.coordinates = this.coordinates.map(withoutDuplicates);
            return this;
        }
    }
);
