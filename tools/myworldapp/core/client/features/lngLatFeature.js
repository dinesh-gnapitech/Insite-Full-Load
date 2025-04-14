// Copyright: IQGeo Limited 2010-2023
import { toLngLats, toProjCoords, toLngLat } from '../base/proj';
import { getUserProjection } from 'ol/proj';

/**
 * Mixin which adds LatLng/WGS84 behaviour for OpenLayer features
 * Useful since OpenLayers features internally work with coordinates in the projected coordinate system
 * @mixin LngLatFeatureMixin
 */

/** @lends LngLatFeatureMixin.prototype */
export const LngLatFeatureMixin = {
    /**
     * @returns {geomCoordinates}
     */
    getLngLats() {
        return toLngLats(this.getGeometry(), getUserProjection());
    },

    /**
     *
     * @param {geomCoordinates} coords
     */
    setLngLats(coords) {
        const projCoords = toProjCoords(coords, getUserProjection());
        this.getGeometry().setCoordinates(projCoords);
    },

    /**
     * @returns {coordinate} Lng/lng of first coordinate of self's geometry
     */
    getFirstLngLat() {
        const coords = this.getGeometry().getCoordinates();

        if (this.getGeometry().getType() === 'Point') return toLngLat(coords, getUserProjection());

        if (coords[0]) return toLngLat(coords[0], getUserProjection());
    },

    /**
     * @returns {coordinate} Lng/lng of last coordinate of self's geometry
     */
    getLastLngLat() {
        const coords = this.getGeometry().getCoordinates();

        if (this.getGeometry().getType() === 'Point') return toLngLat(coords, getUserProjection());

        const last = coords[coords.length - 1];
        if (last) return toLngLat(last, getUserProjection());
    }
};

/**
 * Extends the given OpenLayers feature with WGS84 behaviour ({@link LngLatFeatureMixin})
 * Useful since OpenLayers features internally work with coordinates in the projected coordinate system
 * Used by {@link GeoJSONSource}
 * @param {ol/Feature} olFeature
 * @private
 */
export function lngLatFeature(olFeature) {
    Object.assign(olFeature, LngLatFeatureMixin);
    return olFeature;
}
