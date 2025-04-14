// Copyright: IQGeo Limited 2010-2023
import config from 'myWorld/base/config';
import { MywClass } from 'myWorld/base/class';
import { stylesForConfig } from 'myWorld/styles/styleUtils';
import { Style, PointStyle, LineStyle, FillStyle, TextStyle, LookupStyle } from '../styles/styles';

export class StyleManager extends MywClass {
    static {
        this.mergeOptions({
            defaultPointStyle: '',
            defaultLineStyle: 'rgba(0,128,0):2',
            defaultFillStyle: 'rgba(0,128,0):40',
            minFontSize: 4,
            arrowLength: 5, //size (length) of arrow relative to line weight
            minArrowLength: 2 //Minimum length of arrows (px) - below which arrows are not drawn
        });
    }

    static getDefaultStyles(geomType) {
        if (!StyleManager._defaultStyles) {
            const styles = stylesForConfig(config);
            //store in class so it gets shared for future instances
            StyleManager._defaultStyles = styles;
        }
        return StyleManager._defaultStyles[geomType];
    }

    /**
     * @class Manages style for features on a vector layer. Main function is to convert the style strings into options objects
     *   to be used by {@link FeatureRepresentation}
     * @extends {MywClass}
     * @param {ol/View} view
     * @param {styleManagerOptions} options
     * @constructs
     */
    constructor(view, options) {
        super();
        this.setOptions(options);
        this._view = view;
        this._styleCache = {};
    }

    /**
     * Return style information for a feature.
     * Results are cached on feature's type and geometry field name
     * @param  {DDFeature} feature to return style for
     * @param  {LayerFeatureItem} lfItem  Describes styling for this feature in layer
     * @param  {string} fieldName  Geometry field name
     * @return {Style}  Style to be used with the given feature
     */
    getStyleFor(feature, lfItem, fieldName, layer) {
        const featureDD = feature.featureDD;
        if (!fieldName) fieldName = feature.getGeometryFieldNameInWorld('geo'); //for backwards compatibility

        const styles = this.getStyleForField(featureDD, fieldName, lfItem, layer);

        this._ensureCalcRenderFields(feature, styles.normal); //only checking for normal as highlighted should be simpler

        // Pass to a possible custom method which may modify the style structure or return
        // a completely different one.
        return feature.getCustomStyles(styles);
    }

    /**
     * Return style information for a feature type.
     * Results are cached on feature type and field name
     * @param  {FeatureDD} featureDD to return style for
     * @param  {string} fieldName  Geometry field name
     * @param  {LayerFeatureItem|function(FeatureDD, string)} lfItem  LayerFeatureItem or function that obtains it.
     *                      Function is only used when populating cache so can be used to save processing (compared to calculating before each call)
     * @return {Style}
     */
    getStyleForField(featureDD, fieldName, lfItem, layer) {
        if (!featureDD.name)
            throw new Error(`Incomplete DD information for '${featureDD.external_name}'`);

        const key = `${featureDD.name}/${fieldName}`;
        if (!(key in this._styleCache)) {
            if (typeof lfItem == 'function') lfItem = lfItem(featureDD, fieldName);
            const styleDef = { ...lfItem };
            if (layer) {
                styleDef.opacity = layer.getOpacity();
                styleDef.max_vis = styleDef.max_vis ?? layer.options.maxZoom;
                styleDef.min_vis = styleDef.min_vis ?? layer.options.minZoom;
            }

            this._styleCache[key] = this._getStyleForField(featureDD, fieldName, styleDef);
        }
        return this._styleCache[key];
    }

    _getGeometryTypeFromFeatureDD(featureDD, fieldName) {
        return featureDD.fields[fieldName].type;
    }

    _getStyleForField(featureDD, fieldName, styleDef) {
        const geomType = this._getGeometryTypeFromFeatureDD(featureDD, fieldName, styleDef);
        const layerOpacity = styleDef.opacity;
        const minZoom = styleDef.min_vis;
        const maxZoom = styleDef.max_vis;

        const textStyle = this.getTextStyle(
            featureDD,
            fieldName,
            styleDef.text_style,
            minZoom,
            maxZoom
        );
        //process any lookup styles for this feature.
        const pointStyle = styleDef.point_style;
        const lineStyle = styleDef.line_style;
        const fillStyle = styleDef.fill_style;

        //note that currently highlight styles are not used by vector layers
        let normal, highlight;
        switch (geomType) {
            case 'point':
                normal = this.getPointStyle(
                    pointStyle || this.options.defaultPointStyle,
                    layerOpacity,
                    fieldName,
                    featureDD
                );
                highlight = this.getPointStyle(
                    styleDef.point_style_highlight,
                    layerOpacity,
                    fieldName,
                    featureDD
                );
                break;
            case 'linestring':
                normal = this.getLineStyle(
                    lineStyle || this.options.defaultLineStyle,
                    layerOpacity
                );
                highlight = this.getLineStyle(styleDef.line_style_highlight, layerOpacity);
                break;
            case 'polygon':
                normal = this.getPolygonStyle(
                    lineStyle || this.options.defaultLineStyle,
                    fillStyle || this.options.defaultFillStyle,
                    layerOpacity
                );
                highlight = this.getPolygonStyle(
                    styleDef.line_style_highlight,
                    styleDef.fill_style_highlight,
                    layerOpacity
                );
                break;
        }

        if (textStyle) {
            //if style is a function we need to wrap it in a new function that also returns the text style
            normal = new Style(normal, textStyle);
            highlight = new Style(highlight, textStyle);
        }

        return { normal, highlight };
    }

    /**
     * Create an icon marker for point feature
     * @param  {string} pointStyleString Marker icon options that contains icon url or json string with icon settings
     * @return {Style}                   Style options for marker
     */
    getPointStyle(pointStyleString, opacity, geomFieldName, featureDD) {
        if (!pointStyleString) return;
        let style = LookupStyle.parse(pointStyleString, PointStyle);
        if (!style) style = PointStyle.parse(pointStyleString);
        style.opacity = opacity;
        style.orientationProp = `myw_orientation_${geomFieldName}`;

        return style;
    }

    /**
     * Create line style option object for vector polylines
     * @param  {string} lineStyleString a ':' delimited string with color and width info ie: 'red:5'
     * @returns {Object|Array} Returns a lineStyle Object or an Array of lineStyle objects
     */
    getLineStyle(lineStyleString, opacity) {
        let style = LookupStyle.parse(lineStyleString, LineStyle);
        if (!style) style = LineStyle.parse(lineStyleString || this.options.defaultLineStyle);
        style.minArrowLength = this.options.minArrowLength;
        style.opacity = opacity || 1;

        return style;
    }

    /**
     * Returns text style options
     * @param  {string} textStyleString [description]
     * @param  {number}[minZoom] Default min zoom to be used if style doesn't specify one
     * @param  {number}[maxZoom] Default max zoom to be used if style doesn't specify one
     * @return {textStyle}
     */
    getTextStyle(featureDD, fieldName, textStyleString, minZoom, maxZoom) {
        if (!textStyleString) return;
        const fieldDD = featureDD.fields[fieldName];
        const isLine = fieldDD.type == 'linestring';

        let style = LookupStyle.parse(textStyleString, TextStyle);
        if (!style) style = TextStyle.parse(textStyleString);
        style.minVis = style.minVis || minZoom;
        style.maxVis = style.maxVis || maxZoom;
        style.placement = isLine ? 'line' : 'point';
        style.minFontSize = this.options.minFontSize;

        return style;
    }

    /**
     * Create polygon fill option object for leaflet vector polygons. We allow the possibility of either one of the
     * line or fill styles being blank.
     * @param  {string} lineStyleString a ':' delimited string with color and width info ie: 'red:5'
     * @param  {string} fillStyleString a ':' delimited string with color and opacity as a percent info ie: 'red:75'
     * @return {polygonStyle}
     */
    getPolygonStyle(lineStyleString, fillStyleString, layerOpacity = 1) {
        let lineStyle = LookupStyle.parse(lineStyleString, LineStyle);
        if (!lineStyle)
            lineStyle = LineStyle.parse(lineStyleString || this.options.defaultLineStyle);
        let fillStyle = LookupStyle.parse(fillStyleString, FillStyle);
        if (!fillStyle)
            fillStyle = FillStyle.parse(fillStyleString || this.options.defaultFillStyle);
        fillStyle.opacity = (fillStyle.opacity ?? 1) * layerOpacity;
        return new Style(lineStyle, fillStyle);
    }

    _ensureCalcRenderFields(feature, style) {
        if (!style) return;

        const loopkupFields = style.lookupProps();

        //for each lookup field check if it is a calculated field and calculate it (if it has not been calculated yet)
        for (let fieldName of loopkupFields) {
            if (!fieldName || feature.getProperties()[fieldName] !== undefined) continue; //does not exist or is already calculated
            const fieldDD = feature.featureDD.fields[fieldName];
            if (fieldDD.value?.startsWith('method(')) {
                feature.properties[fieldName] = feature.getCalculatedValueFor(fieldDD);
            }
        }
    }
}

/**
 * Style definition
 * @typedef styleDefinition
 * @property {ol/style/Style~StyleLike}    normal      Style to use by default
 * @property {ol/style/Style~StyleLike}    highlight   Style to use when the feature is highlighted
 */

/**
 * Symbol style definition
 * @typedef symbolStyle
 * @property {string} name Name of symbol. One of 'circle', 'square', 'triangle', 'arrow', 'cross' or 'x'
 * @property {string} color Colour of symbol
 * @property {string} size Size of symbol
 */

/**
 * Line style definition
 * @typedef lineStyle
 * @property {string} color Colour of line
 * @property {string} weight Weight/thickness of line
 * @property {string} start_arrow  'none' or 'arrow' to indicate an arrow is not or is to be drawn at start of line
 * @property {string} send_arrow 'none' or 'arrow' to indicate an arrow is not or is to be drawn at end of line
 * @property {string} dashArray Description of how the line is to be dashed
 */

export default StyleManager;
