// Copyright: IQGeo Limited 2010-2023
import SimpleStyle from './simpleStyle';
import StyleDefParser from './styleDefParser';
import { shapeGeometryAt } from './styleUtils';
import { getUserProjection, get as getProjection } from 'ol/proj';

import { Fill, Circle, Stroke, Style } from 'ol/style';

/**
 * A point style based on a pre-defined shape
 *
 * Supports line and fill colour, world size units, etc. Provides
 * functions for serialise/de-serialise from style string + building OpenLayers style
 * @extends SimpleStyle
 */
export class SymbolStyle extends SimpleStyle {
    /**
     * Construct an instance from a style definition string (as stored in DB)
     * @param {string} defStr
     */
    static parse(defStr) {
        const parser = new StyleDefParser(defStr);

        const opts = {};
        opts.symbol = parser.get();
        opts.color = parser.get();
        [opts.size, opts.sizeUnit] = parser.get('unit_value');
        opts.borderColor = parser.get() || opts.color;

        return new this(opts);
    }

    /**
     * Constructor
     * @param {object} options
     * @param {string} options.symbol One of: circle, triangle, arrow, square, cross, x, building, diamond, chevron
     * @param {color} options.color Fill color
     * @param {number}options.size Size the symbol should be rendered in
     * @param {string} [options.sizeUnit='px'] Units for given size. 'px' or 'm'
     * @param {color} [options.borderColor] Border color
     * @param {string} [options.orientationProp] Name of property to use for symbol's orientation
     * @param {number} [options.opacity=1] Opacity. Between 0 and 1
     */
    constructor(options) {
        super(options);
        this.symbol = options.symbol;
        this.color = options.color;
        this.size = options.size;
        this.sizeUnit = options.sizeUnit || 'px';
        this.borderColor = options.borderColor;
        this.orientationProp = options.orientationProp;
        this.opacity = options.opacity; // used in inherited _colorFromString()
    }

    /**
     * style definition string for self
     */
    defStr() {
        const sizeUnit = this.sizeUnit == 'px' ? '' : this.sizeUnit;

        const fields = [];
        fields.push(this.symbol);
        fields.push(this.color);
        fields.push(this.size + sizeUnit);
        if (this.borderColor) fields.push(this.borderColor);

        return fields.join(':'); // ENH: Trim trailing empty items
    }

    /**
     * Get the RGBA color correspoding to this.borderColor and this.opacity
     * @returns {Array} an array of RGBA color breakdown [R, G, B, A]
     */
    get rgbaBorderColor() {
        return this._colorFromString(this.borderColor);
    }

    /*
     * OpenLayers style for self
     */
    _getOlStyle(view) {
        const { symbol, color, borderColor, size, sizeUnit, orientationProp } = this;
        const stroke = new Stroke({ color: this._colorFromString(borderColor), width: 2 });
        const fill = new Fill({ color: this._colorFromString(color) });
        if (symbol == 'circle') return this._getCircleStyle(stroke, fill, view);

        const style = new Style({ stroke, fill });

        //feature is in user projection, resolution is in web mercator projection
        return (userFeature, resolution) => {
            const feature = userFeature.clone();
            feature.getGeometry().transform(getUserProjection(), getProjection('EPSG:3857'));

            const geomType = feature.getGeometry().getType();
            if (!['Point', 'MultiPoint'].includes(geomType)) {
                //geometry not point as expected - render "normally"
                style.setGeometry(); //clear any previous geometries set on the style for point geoms
                return style;
            }

            //calculate scale from specified width. size is pixels
            let width;
            if (sizeUnit == 'm') {
                const adjResolution = this._getPointResolutionFor(feature, resolution, view);
                width = this._realToProjectedMeters(size, adjResolution, resolution);
            } else {
                //pixels
                width = size * resolution; //in meters (projected units)
            }

            const coordinate =
                feature.getGeometry().getCoordinates?.() ?? feature.getFlatCoordinates(); //Some points in Vector Tiles are a RenderFeature which doesn't implement getFirstCoordinate
            const orientation = orientationProp && feature.getProperties()[orientationProp]; //degrees
            const rotation = (Math.PI / 180) * (orientation || 0); //in radians

            const shapeGeometry = shapeGeometryAt(coordinate, symbol, rotation, width);
            // Convert back to user projection after calculations are done in web mercator
            shapeGeometry.transform(getProjection('EPSG:3857'), getUserProjection());
            style.setGeometry(shapeGeometry);
            return style;
        };
    }

    /*
     * Returns an OpenLayers style to render features with a circle
     * @param {number} targetWidth  Target width in given unit
     * @param {string} unit 'm' for meters or anything else for pixels
     * @param {ol/style/Stroke} stroke
     * @param {ol/style/Fill} fill
     */
    _getCircleStyle(stroke, fill, view) {
        const { size, sizeUnit } = this;
        if (sizeUnit !== 'm') {
            const image = new Circle({ stroke, fill, radius: size / 2 });
            const style = new Style({ image });
            return style;
        }
        const styleByRes = {};

        //unit is meters - targetWidth needs to be converted to pixels depending on resolution (zoom)
        return (userFeature, resolution) => {
            const feature = userFeature.clone();
            feature.getGeometry().transform(getUserProjection(), getProjection('EPSG:3857'));
            if (!styleByRes[resolution]) {
                //calculate scale from specified width
                const adjResolution = this._getPointResolutionFor(feature, resolution, view);
                // targetWidth is real meters, width we want is in pixels
                const width = size / adjResolution;
                styleByRes[resolution] = new Style({
                    image: new Circle({ stroke, fill, radius: width / 2 })
                });
            }
            return styleByRes[resolution];
        };
    }
}

/**
 * Point style sub-type
 */
SymbolStyle.prototype.type = 'symbol';

SymbolStyle.symbols = {
    circle: [],
    triangle: [
        [50, 100],
        [0, 0],
        [100, 0],
        [50, 100]
    ],
    arrow: [
        [50, 100],
        [15, 0],
        [85, 0],
        [50, 100]
    ],
    square: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0]
    ],
    rectangle: [
        [0, 25],
        [100, 25],
        [100, 75],
        [0, 75],
        [0, 25]
    ],
    cross: [
        [0, 30],
        [0, 70],
        [30, 70],
        [30, 100],
        [70, 100],
        [70, 70],
        [100, 70],
        [100, 30],
        [70, 30],
        [70, 0],
        [30, 0],
        [30, 30],
        [0, 30]
    ],
    x: [
        [0, 20],
        [30, 50],
        [0, 80],
        [0, 100],
        [20, 100],
        [50, 70],
        [80, 100],
        [100, 100],
        [100, 80],
        [70, 50],
        [100, 20],
        [100, 0],
        [80, 0],
        [50, 30],
        [20, 0],
        [0, 0],
        [0, 20]
    ],
    building: [
        [50, 100],
        [0, 70],
        [0, 0],
        [100, 0],
        [100, 70],
        [50, 100]
    ],
    diamond: [
        [50, 0],
        [100, 50],
        [50, 100],
        [0, 50],
        [50, 0]
    ],
    chevron: [
        [50, 100],
        [0, 0],
        [50, 30],
        [100, 0],
        [50, 100]
    ]
};

export default SymbolStyle;
