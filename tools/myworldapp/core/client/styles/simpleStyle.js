// Copyright: IQGeo Limited 2010-2023
import Style from './style';
import { colorFromString } from './styleUtils';
import { getPointResolution } from 'ol/proj';
import Map from 'ol/Map';

/**
 * Abstract superclass for basic IQGeo Platform styles
 *
 * Subclasses must implement:
 *   .olStyle() (or _getOlStyle() if it can be cached)
 *
 * They may also provide serialisation from/to style string format:
 *   .parse(str)
 *   .defStr()
 *
 * Note that, even if serialisation is provided, not all information may be retained
 *
 * Subclasses:
 * {@link SymbolStyle}
 * {@link IconStyle}
 * {@link LineStyle}
 * {@link FillStyle}
 * {@link TextStyle}
 * {@link LookupStyle}
 *
 * @abstract
 */
export class SimpleStyle {
    clone() {
        return new this.constructor(this);
    }

    /**
     * Returns compound style built from self and 'other'
     * @param {SimpleStyle} other
     */
    // ENH: Replace by overload of '+' operator when JS supports it
    plus(other) {
        return new Style(this, other);
    }

    lookupProps() {
        return [];
    }

    textProps() {
        return [];
    }

    /**
     * OpenLayers style for self
     * @param {ol/View|ol/Map} view
     */
    olStyle(view) {
        if (!this._olStyle) {
            if (view instanceof Map) view = view.getView();
            this._olStyle = this._getOlStyle(view); //ENH: cache for different views
        }
        return this._olStyle;
    }

    _getPointResolutionFor(feature, resolution, view) {
        const coord = feature.getGeometry().getFirstCoordinate?.() ?? feature.getFlatCoordinates(); //Some points in Vector Tiles are a RenderFeature which doesn't implement getFirstCoordinate
        return getPointResolution(view.getProjection(), resolution, coord);
    }

    /*
     * Converts a size in real meters to a size in projected meters so it can be given to the rendering engine to draw in the correct size
     * @param {number} size  In (real) meters
     * @param {number} adjResolution  Resolution adjusted for the lat/lng where we want the real meters
     * @param {number} resolution   Resolution (relative only to zoom level)
     */
    _realToProjectedMeters(size, adjResolution, resolution) {
        return size * (resolution / adjResolution);
    }

    /*
     * Converts a value in meters to pixels, given a map resolution
     */
    _metersToPixels(size, resolution) {
        return size / resolution;
    }

    /**
     * Get the RGBA color correspoding to this.color and this.opacity
     * @returns {Array} an array of RGBA color breakdown [R, G, B, A]
     */
    get rgbaColor() {
        const { color, opacity } = this;
        if (!color) return undefined;
        return this._colorFromString(color, opacity);
    }

    //obtain a color from a string, considering the given opacity
    //opacity defaults to the self's opacity
    _colorFromString(color, opacity = this.opacity) {
        if (!color) return [0, 0, 0, 0];
        const olColor = colorFromString(color).slice();
        const alpha = olColor[3] ?? 1; //alpha of string (transparent or rgba will have a value)
        olColor[3] = alpha * (opacity ?? 1); //"merge" alpha with given opacity
        return olColor;
    }
}

export default SimpleStyle;

/**
 * @typedef {string} color
 * Color in one of the following forms:
 *  - name ('blue')
 *  - hexadecimal ('#0000ff')
 *  - rgba ('rgba(0,0,255,255)')
 */

/**
 * @typedef {string} sizeUnit
 * Size in pixels ('px') or meters ('m')
 */
