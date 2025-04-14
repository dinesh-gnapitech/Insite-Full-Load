// Copyright: IQGeo Limited 2010-2023
import geometry from './geomFactory';
import { coordEach, coordMap } from './utils';

/* globals turf: false */

/**
 * Mixin with common behaviour for any type of geometry
 * @mixin GeometryMixin
 */

/** @lends GeometryMixin.prototype */
const GeometryMixin = {
    initialize(coordinates) {
        if (coordinates) this.coordinates = coordinates;
    },

    /**
     * @returns {string}
     */
    getType() {
        return this.type;
    },

    /**
     * @returns {geojsonCoordinates}
     */
    getCoordinates() {
        return this.coordinates;
    },

    /**
     * Calls a given function on each coordinate of self
     * @param {function} fn
     */
    forEachCoord(fn) {
        coordEach(this, fn);
    },

    /**
     * Returns a copy of self where each coordinate has been applied to the given function
     * @param {function} fn
     * @returns {Geometry}
     */
    mapCoordinates(fn) {
        return geometry({ ...this, coordinates: coordMap(this, fn) });
    },

    /**
     * Returns a copy of self
     * @returns {Geometry}
     */
    clone() {
        return this.mapCoordinates(coord => coord);
    },

    /**
     * @returns {coordinate[]} A flat list of the coordinates of self
     */
    flatCoordinates() {
        const flat = [];
        this.forEachCoord(c => flat.push(c));
        return flat;
    },

    /**
     * Calculate a buffer around self's geometry
     * @param  {number} size
     * @param  {unit}   [unit='meters']
     * @return {Polygon}
     */
    buffer(size, unit) {
        this.assertTurf();
        const buffer = turf.buffer(this, size, { units: unit || 'meters' });
        return geometry(buffer.geometry);
    },

    /**
     * Self's bounding box
     * @return {Number[]} bbox extent in minX, minY, maxX, maxY order
     */
    bbox() {
        const result = [Infinity, Infinity, -Infinity, -Infinity];
        this.forEachCoord(coord => {
            if (result[0] > coord[0]) result[0] = coord[0];
            if (result[1] > coord[1]) result[1] = coord[1];
            if (result[2] < coord[0]) result[2] = coord[0];
            if (result[3] < coord[1]) result[3] = coord[1];
        });
        return result;
    },

    /**
     * Returns true if self wholy contains a given geometry
     * @param {Geometry} other
     */
    contains(other) {
        this.assertTurf();
        return turf.booleanContains(this.noProto(), other.noProto());
    },

    /**
     * Self's bounding box as a polygon
     * @return {Polygon}
     */
    bboxPolygon() {
        this.assertTurf();
        const polygon = turf.bboxPolygon(this.bbox());
        return geometry(polygon.geometry);
    },

    assertTurf() {
        if (typeof turf == 'undefined')
            throw new Error(
                'Geometry module not yet initialized. Ensure geometry.init() has resolved.'
            );
    },

    /**
     * Returns self as part of a mock GeoJson feature
     * @return {object}
     * @private
     */
    _asFeature() {
        return { type: 'Feature', geometry: this.noProto() };
    },

    /**
     * Returns self as a GeoJson geometry with no additional behaviour (i.e. no prototype chain)
     * Usefull when other turf tries to identify type by checking for length etc...
     * @return {object}
     * @private
     */
    noProto() {
        return { type: this.type, coordinates: this.coordinates };
    }
};

export default GeometryMixin;
