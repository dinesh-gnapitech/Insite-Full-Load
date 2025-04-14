// Copyright: IQGeo Limited 2010-2023

/**
 * Mixin which adds LatLng/WGS84 behaviour for OpenLayer features
 * Useful since OpenLayers features internally work with coordinates in the projected coordinate system
 * @mixin TooltipFeatureMixin
 */

/** @lends TooltipFeatureMixin.prototype */
export const TooltipFeatureMixin = {
    /**
     * @param {string} tooltipText
     * @returns {ol/Feature} self
     */
    bindTooltip(tooltipText) {
        this._myw_tooltip = tooltipText;
        return this;
    },

    /**
     * @returns {string}
     */
    getTooltip() {
        return this._myw_tooltip;
    }
};

/**
 * Extends the given OpenLayers feature with tooltip behaviour ({@link TooltipFeatureMixin})
 * Used by {@link GeoJSONSource}
 * @param {ol/Feature} olFeature
 * @private
 */
export function tooltipFeature(olFeature) {
    Object.assign(olFeature, TooltipFeatureMixin);
    return olFeature;
}
