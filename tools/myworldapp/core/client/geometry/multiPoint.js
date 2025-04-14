// Copyright: IQGeo Limited 2010-2023
import factory from './factory';
import geometryMixin from './geometryMixin';

/**
 * @see {@link module:geometry} for object creation
 * @class MultiPoint
 * @extends {GeometryMixin}
 */
export default factory(geometryMixin, {
    type: 'MultiPoint'
});
