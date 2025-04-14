// Copyright: IQGeo Limited 2010-2023

/**
 * Mixin for common behaviour in {@link Polygon} and {@link MultiPolygon}
 * @mixin PolygonMixin
 */

/** @lends PolygonMixin.prototype */
const PolygonMixin = {
    /**
     * Obtains the outer boundary of self
     * @return {LineString|MultiLineString}
     */
    outer() {},

    /**
     * Obtains the boundaries of self
     * @return {MultiLineString}
     */
    boundaries() {}
};

export default PolygonMixin;
