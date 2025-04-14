// Copyright: IQGeo Limited 2010-2023
import SimpleStyle from './simpleStyle';
import StyleDefParser from './styleDefParser';

import { Fill, Stroke, Style, Text } from 'ol/style';
import { getUserProjection, get as getProjection } from 'ol/proj';

/**
 * A text style
 *
 * Supports world size text, min/max zoom level etc. Provides functions for
 * serialise/de-serialise from style string + building OpenLayers style
 * @extends SimpleStyle
 */
export class TextStyle extends SimpleStyle {
    /**
     * Construct from style definition string
     * @param {string} defStr
     */
    static parse(defStr) {
        const parser = new StyleDefParser(defStr);

        // Parse string
        const opts = {};
        opts.textProp = parser.get();
        opts.color = parser.get();
        [opts.size, opts.sizeUnit = 'pt'] = parser.get('unit_value', []);
        [opts.vAlign, opts.vOffset] = parser.get('string_and_offset', []);
        [opts.hAlign, opts.hOffset] = parser.get('string_and_offset', []);
        opts.backgroundColor = parser.get();
        opts.borderWidth = parser.get('float');
        opts.minVis = parser.get('integer');
        opts.maxVis = parser.get('integer');
        opts.orientationProp = parser.get('string', null);

        // Upgrade old formats
        if (opts.hAlign == 'centre') opts.hAlign = 'center';

        return new this(opts);
    }

    /**
     * Constructor
     * @param {object} options
     * @param {string} [options.text] Text to render. Provide either this or textProp
     * @param {string} [options.textProp] Feature property to obtain text to render. Provide either this or text
     * @param {string} [options.orientationProp] Name of property to use for text's orientation
     * @param {boolean} [options.rotateWithView] Defaults to false, unless orientationProp is set, in which case defaults to true
     * @param {color} [options.color='black']
     * @param {number} [options.size=20]
     * @param {sizeUnit} [options.sizeUnit='px']
     * @param {string} [options.vAlign='middle'] Vertical alignment
     * @param {string} [options.hAlign='center'] Horizontal alignment. If 'center' and placement is 'line', actual aligment will be determined depending on the line
     * @param {number} [options.vOffset=0] Vertical offset. If vAlign is 'bottom', a positive value means text will shift up
     * @param {number} [options.hOffset=0] Horizontal offset. If hAlign is 'right', a positive value means text will shift left
     * @param {color} [options.backgroundColor] If given a background 'box' is created, filled in this color
     * @param {number} [options.borderWidth] Border for background 'box'
     * @param {number}[options.minVis] Minimum zoom level to show the text
     * @param {number}[options.maxVis] Maximum zoom level to show the text
     * @param {string} [options.placement='point'] 'point' or 'line'. {@link https://openlayers.org/en/latest/apidoc/module-ol_style_TextPlacement.html}
     * @param {string} [options.fontFamily='Arial']
     * @param {number} [options.minSize=4] in pt. If the text would be smaller than this size it is not rendered
     * @param {number} [options.maxAngle] When placement is set to 'line', allow a maximum angle between adjacent characters. The expected value is in radians. Defaults to PI/4
     * @param {strokeDef} [options.stroke] Stroke style
     * @param {strokeDef} [options.backgroundStroke] Stroke style for the text background when placement is 'point'. Default is no stroke.
     */
    constructor(options) {
        super(options);
        this.text = options.text;
        this.textProp = options.textProp;
        this.orientation = options.orientation;
        this.orientationProp = options.orientationProp;
        this._rotateWithView = options.rotateWithView; //see getter
        this.color = options.color || '#000000';
        this.size = options.size || 20;
        this.sizeUnit = options.sizeUnit || 'px';
        this.vAlign = options.vAlign || 'middle';
        this.hAlign = options.hAlign || 'center';
        this.vOffset = options.vOffset || 0;
        this.hOffset = options.hOffset || 0;
        this.backgroundColor = options.backgroundColor;
        this.borderWidth = options.borderWidth;
        this.minVis = options.minVis;
        this.maxVis = options.maxVis;
        this.placement = options.placement || 'point';
        this.fontFamily = options.fontFamily || 'Arial';
        this.minSize = options.minSize || 4; //in pt
        this.maxAngle = options.maxAngle ?? Math.PI / 4;
        this.stroke = options.stroke;
        this.backgroundStroke = options.backgroundStroke;
    }

    get rotateWithView() {
        //default value depends on existing an orientation
        return this._rotateWithView ?? (!!this.orientationProp || this.orientation !== undefined);
    }

    /**
     * style definition string for self
     */
    defStr() {
        const sizeUnit = this.sizeUnit == 'px' ? '' : this.sizeUnit;
        const vOffset = this.offsetStrFor(this.vOffset);
        const hOffset = this.offsetStrFor(this.hOffset);

        const fields = [];
        fields.push(this.textProp);
        fields.push(this.color);
        fields.push(this.size + sizeUnit);
        fields.push(this.vAlign + vOffset);
        fields.push(this.hAlign + hOffset);
        fields.push(this.backgroundColor);
        fields.push(this.borderWidth);
        fields.push(this.minVis);
        fields.push(this.maxVis);
        fields.push(this.orientationProp || '');

        return fields.join(':');
    }

    /**
     * Helper to build an offset string
     */
    offsetStrFor(n) {
        if (n == 0) return '';
        if (n > 0) return '+' + n;
        return '' + n;
    }

    /*
     * OpenLayers style for self
     */
    _getOlStyle(view) {
        const { color, size, fontFamily, sizeUnit, vAlign, hAlign, vOffset, hOffset } = this;
        const { backgroundColor, borderWidth, minVis, maxVis, placement, minSize } = this;
        const { textProp, orientationProp, rotateWithView, maxAngle } = this;
        const { stroke, backgroundStroke } = this;
        let textAlign = hAlign == 'centre' ? 'center' : hAlign; //openlayers uses US term
        //if textAlign is set when placement is 'line' and maxAngle is exceeded the text won't be shown so we leave it undefined to ' to let the renderer choose a placement where maxAngle is not exceeded'
        if (placement == 'line' && textAlign == 'center') textAlign = undefined;
        const offsetX = hAlign == 'right' ? -hOffset : hOffset;
        const offsetY = vAlign == 'bottom' ? -vOffset : vOffset;
        const textOptions = {
            rotateWithView,
            font: `${size}pt ${fontFamily}`,
            fill: new Fill({ color }),
            textAlign,
            textBaseline: vAlign,
            offsetX,
            offsetY,
            placement,
            maxAngle, //When placement is set to 'line', allow a maximum angle between adjacent characters. The expected value is in radians
            overflow: true //For polygon labels or when placement is set to 'line', allow text to exceed the width of the polygon at the label position or the length of the path that it follows.
        };

        textOptions.text = typeof this.text == 'string' ? this.text : '';

        if (backgroundColor) {
            //add background box
            textOptions.backgroundFill = new Fill({ color: backgroundColor });
            textOptions.padding = [size / 4, 0, 0, size / 4];
        }
        if (backgroundStroke) {
            textOptions.backgroundStroke = new Stroke(backgroundStroke);
        } else if (borderWidth) {
            //Add border
            textOptions.backgroundStroke = new Stroke({ color, width: borderWidth });
        }
        if (stroke) textOptions.stroke = new Stroke(stroke);

        const style = new Style({ text: new Text(textOptions) });
        let lastResolution = undefined;

        if (!this.isDynamic) return style; //doesn't depend on feature or resolution

        //font will vary according to zoom/resolution. need to return function that adjust font size
        //feature is in user projection, resolution is in web mercator projection
        return (feature, resolution) => {
            const zoomLevel = view.getZoomForResolution(resolution);
            if ((minVis && zoomLevel < minVis) || (maxVis && zoomLevel > maxVis)) return undefined; //out of zoom range

            const olText = style.getText();
            if (typeof this.text == 'function') olText.setText(this.text(feature));
            else if (textProp) olText.setText(this._getTextFor(feature, textProp));

            let orientation = 0;
            if (typeof this.orientation == 'number') orientation = this.orientation;
            else if (typeof this.orientation == 'function') orientation = this.orientation(feature);
            else if (orientationProp) orientation = feature.getProperties()[orientationProp];
            const rotation = (Math.PI / 180) * (orientation ?? 0); //in radians
            olText.setRotation(rotation);

            if (sizeUnit != 'm') return style;

            //world relative size, calculate font in pt
            const ns = Math.pow(2, zoomLevel - 17);
            const fontSize = size * ns;
            if (fontSize < minSize) return undefined; //too small

            //check if we're still at same resolution/zoom level
            if (lastResolution == resolution) return style;
            else lastResolution = resolution;

            //text for this feature needs to be rendered at a new zoom level
            olText.setFont(`${fontSize}pt ${fontFamily}`);

            //calculate offset in pixels (from meters)
            const webMercatorFeature = feature.clone();
            webMercatorFeature
                .getGeometry()
                .transform(getUserProjection(), getProjection('EPSG:3857'));
            const adjResolution = this._getPointResolutionFor(webMercatorFeature, resolution, view);
            olText.setOffsetX(this._metersToPixels(offsetX, adjResolution));
            olText.setOffsetY(this._metersToPixels(offsetY, adjResolution));
            if (backgroundColor) olText.setPadding([fontSize / 4, fontSize / 4, 0, fontSize / 4]);
            return style;
        };
    }

    get isDynamic() {
        return !!(
            this.minVis ||
            this.maxVis ||
            typeof this.text == 'function' ||
            this.sizeUnit == 'm' ||
            this.textProp ||
            this.orientation !== undefined ||
            this.orientationProp
        );
    }

    textProps() {
        return this.textProp ? [this.textProp] : [];
    }

    _getTextFor(feature, propName) {
        let text;
        if (propName.slice(-2) == '()') {
            try {
                const mywFeature = feature._rep?.feature ?? feature._mywFeature;
                text = mywFeature[propName.slice(0, -2)]();
            } catch (e) {
                text = propName;
            }
        } else {
            text = feature.getProperties()[propName];
        }
        if (!text) return;

        // Coerce value to text
        text = '' + text;

        return text;
    }
}

/**
 * Stroke definition, currently as per the options of https://openlayers.org/en/latest/apidoc/module-ol_style_Stroke-Stroke.html
 * @typedef {object} strokeDef
 */

export default TextStyle;
