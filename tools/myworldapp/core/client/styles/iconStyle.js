// Copyright: IQGeo Limited 2010-2023
import { convertUrl } from 'myWorld/base/util';
import SimpleStyle from './simpleStyle';
import StyleDefParser from './styleDefParser';
import { Icon, Style } from 'ol/style';

/**
 * A point style based on an image or SVG
 *
 * Supports rotation, offsetting, world size units, etc. Provides functions for
 * serialise/de-serialise from style string  building OpenLayers style
 * @extends SimpleStyle
 */
// ENH: Support proportional anchor, angle, ...
export class IconStyle extends SimpleStyle {
    /**
     * Construct from style definition string
     * @param {string} defStr
     */
    static parse(defStr) {
        const parser = new StyleDefParser(defStr);

        const opts = {};
        opts.iconUrl = parser.get();
        // anchor Default values picked for backwards compatibility.
        [opts.anchorX, opts.anchorXUnit] = parser.get('unit_value', [16, 'px']);
        [opts.anchorY, opts.anchorYUnit] = parser.get('unit_value', [32, 'px']);
        [opts.size, opts.sizeUnit] = parser.get('unit_value', []);

        return new this(opts);
    }

    /**
     * Constructor
     * @param {object} options
     * @param {string} options.iconUrl
     * @param {number}[options.size]
     * @param {string} [options.sizeUnit='px'] Pixels (px) or meters (m)
     * @param {number} [options.anchorX=0] X-axis anchor/offset
     * @param {number} [options.anchorY=0] Y-axis anchor/offset
     * @param {string} [options.anchorUnit='px'] Units for anchor. 'px', 'm' or '%'
     * @param {string} [options.anchorXUnit] Defaults to anchorUnit
     * @param {string} [options.anchorYUnit] Defaults to anchorUnit
     * @param {string} [options.orientationProp] Name of property to use for symbol's orientation
     * @param {boolean} [options.rotateWithView] Defaults to false, unless orientationProp is set, in which case defaults to true
     * @param {number} [options.opacity=1] Opacity. Between 0 and 1
     * @param {color} [options.color]

     */
    constructor(options) {
        super(options);
        this.iconUrl = options.iconUrl || '';
        this.size = options.size;
        this.sizeUnit = options.sizeUnit || 'px';
        const iconAnchor = options.iconAnchor || []; //old format used in default styles settings
        this.anchorX = options.anchorX || iconAnchor[0] || 0;
        this.anchorY = options.anchorY || iconAnchor[1] || 0;
        this.anchorUnit = options.anchorUnit || 'px';
        this.anchorXUnit = options.anchorXUnit || this.anchorUnit;
        this.anchorYUnit = options.anchorYUnit || this.anchorUnit;
        this.orientationProp = options.orientationProp;
        this._rotateWithView = options.rotateWithView; //see getter
        this.opacity = options.opacity;
        this.color = options.color;
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
        const anchorXUnit = this.anchorXUnit == 'px' ? '' : this.anchorXUnit;
        const anchorYUnit = this.anchorYUnit == 'px' ? '' : this.anchorYUnit;

        const fields = [];
        fields.push(this.iconUrl);
        fields.push(this.anchorX + anchorXUnit);
        fields.push(this.anchorY + anchorYUnit);
        fields.push(this.size + sizeUnit);

        return fields.join(':'); // ENH: Trim trailing empty items
    }

    get isDynamic() {
        //if target size isn't defined, scale is always 1
        return !!this.size || this.orientationProp;
    }

    _getOlStyle(view) {
        const { iconUrl, size, sizeUnit, orientationProp, anchorXUnit, anchorYUnit } = this;
        const { opacity, rotateWithView } = this;
        if (!iconUrl) return new Style();
        const anchorX = anchorXUnit == '%' ? this.anchorX / 100 : this.anchorX;
        const anchorY = anchorYUnit == '%' ? this.anchorY / 100 : this.anchorY;
        const iconOptions = {
            rotateWithView,
            anchor: [anchorX, anchorY],
            anchorXUnits: anchorXUnit == '%' ? 'fraction' : 'pixels',
            anchorYUnits: anchorYUnit == '%' ? 'fraction' : 'pixels',
            src: convertUrl(iconUrl),
            scale: 1,
            opacity
        };
        if (this.color) iconOptions.color = this.color;
        const icon = new Icon(iconOptions);
        const style = new Style({ image: icon });

        if (!this.isDynamic) return style;
        //size is defined so a scale needs to be calculated. Icon size is necessary, which we'll only know once image is loaded
        //return function that adjusts scale
        return (feature, resolution) => {
            if (orientationProp) {
                const orientation = orientationProp && feature.getProperties()[orientationProp]; //degrees
                const rotation = (Math.PI / 180) * (orientation || 0); //in radians
                style.getImage().setRotation(rotation);
            }
            if (!size) return style;
            const imgSize = icon.getSize();
            if (!imgSize) return style;

            const imgWidth = imgSize[0];
            //calculate scale from specified width
            const adjResolution = this._getPointResolutionFor(feature, resolution, view);
            let scale;
            if (sizeUnit == '%') scale = size / 100;
            else if (sizeUnit == 'm') scale = this._metersToPixels(size, adjResolution) / imgWidth;
            else scale = size / imgWidth; //size is in pixels

            style.getImage().setScale(scale);
            return style;
        };
    }
}

/**
 * Point style sub-type
 */
IconStyle.prototype.type = 'icon';

export default IconStyle;
