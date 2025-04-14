// Copyright: IQGeo Limited 2010-2023
import SimpleStyle from './simpleStyle';
import StyleDefParser from './styleDefParser';
import { bearingBetween, shapeGeometryAt, getPointAndAngleForArrowOnLine } from './styleUtils';

import { Fill, Stroke, Style } from 'ol/style';
import MultiPolygon from 'ol/geom/MultiPolygon';
import { toGeometry } from 'ol/render/Feature';
import { getUserProjection, get as getProjection } from 'ol/proj';

const dashStyles = {
    dash: [5, 5],
    shortdash: [2, 2],
    longdash: [10, 4],
    dot: [1, 2],
    longdashdot: [10, 5, 1, 5]
};

/**
 * A line style
 *
 * Supports world size width, patterns, arrows, etc. Provides functions for
 * serialise/de-serialise from style string + building OpenLayers style
 * @extends SimpleStyle
 */
export class LineStyle extends SimpleStyle {
    /**
     * Construct from style definition string 'defStr'
     */
    static parse(defStr) {
        const parser = new StyleDefParser(defStr);

        const opts = {};
        opts.color = parser.get();
        [opts.width, opts.widthUnit] = parser.get('unit_value', []);
        opts.lineStyle = parser.get();
        opts.startStyle = parser.get();
        opts.endStyle = parser.get();

        return new this(opts);
    }

    /**
     * Constructor
     * @param {object} options
     * @param {color} [options.color='black']  color
     * @param {number}[options.width=1]
     * @param {sizeUnit} [options.widthUnit='px']
     * @param {string} [options.lineStyle='solid'] One of solid, arrowed, dash, shortdash, longdash, dot, longdashdot
     * @param {number[]} [options.linePattern] Alternative to 'lineStyle' with the pattern of dots and dashes. e.g [10, 4]
     * @param {string} [options.startStyle=''] '' or 'arrow'
     * @param {string} [options.endStyle=''] '' or 'arrow'
     * @param {number} [options.arrowLength=5] (when 'arrow' is used in patter or style) size (length) of arrow relative to line weigh
     * @param {number} [options.minArrowLength=2] (when 'arrow' is used in patter or style) If arrow is smaller than this value it isn't drawn
     * @param {number} [options.opacity=1] Opacity. Between 0 and 1
     */
    constructor(options) {
        super(options);
        this.color = options.color || '#000000';
        this.width = options.width || options.weight || 1;
        this.widthUnit = options.widthUnit || 'px';
        this.lineStyle = options.lineStyle || 'solid';
        this.linePattern = options.linePattern;
        this.startStyle = options.startStyle || '';
        this.endStyle = options.endStyle || '';
        this.arrowLength = options.arrowLength ?? 5; //size (length) of arrow relative to line weight
        this.minArrowLength = options.minArrowLength ?? 2;
        this.opacity = options.opacity;
    }

    /**
     * definition string for self
     */
    defStr() {
        const widthUnit = this.widthUnit == 'px' ? '' : this.widthUnit;

        const fields = [];
        fields.push(this.color);
        fields.push(this.width + widthUnit);
        fields.push(this.lineStyle);
        fields.push(this.startStyle);
        fields.push(this.endStyle);

        return fields.join(':'); // ENH: Trim trailing empty items
    }

    /*
     * OpenLayers style for self
     */
    _getOlStyle(view) {
        const { color, lineStyle, width, widthUnit, startStyle, endStyle } = this;
        const { arrowLength, opacity } = this;
        const hasArrows = startStyle == 'arrow' || endStyle == 'arrow' || lineStyle == 'arrowed';

        const olColor = this._colorFromString(color, opacity);
        const stroke = new Stroke({ color: olColor, width: width });
        this._setLineDash(stroke);
        const lineBodyStyle = new Style({ stroke });

        // check if weight is in pixels or meters (requires function to adjust depending on zoom)
        // Arrowed lines always require a function regardless of px or meters
        if (widthUnit == 'px' && !hasArrows) return lineBodyStyle;

        //we either have arrows or a size in meters

        const arrowStroke = new Stroke({
            color: lineBodyStyle.getStroke().getColor() || [0, 0, 0, 0],
            width: 2
        });
        const arrowFill = new Fill({ color: lineBodyStyle.getStroke().getColor() || [0, 0, 0, 0] });
        const arrowStyle = new Style({ stroke: arrowStroke, fill: arrowFill });

        //size (length) of arrow is relative to line weight (whether in meters or px)
        let arrowLengthRelative = arrowLength * width;

        //feature is in user projection, resolution is in web mercator projection
        return (userFeature, resolution) => {
            const feature = userFeature.clone();
            feature.getGeometry().transform(getUserProjection(), getProjection('EPSG:3857'));

            //Weight in meters - need to adjust on zoom
            const adjResolution = this._getPointResolutionFor(feature, resolution, view);
            const adjWidth = this._metersToPixels(width, adjResolution);
            if (widthUnit == 'm') lineBodyStyle.getStroke().setWidth(adjWidth);

            const arrowLengthPixels = arrowLengthRelative / resolution;

            //in meters (projected units)
            const arrowLengthRealMeters =
                widthUnit == 'm'
                    ? this._realToProjectedMeters(arrowLengthRelative, adjResolution, resolution) // targetWidth is real meters
                    : arrowLengthRelative * resolution; //targetWidth is pixels

            const arrowPolygons = new MultiPolygon({ coordinates: [] });
            const arrowOptions = {
                startStyle,
                endStyle,
                arrowPolygons,
                arrowLengthRealMeters
            };
            const geom = feature.getGeometry();
            if (geom.getType() == 'MultiLineString') {
                const lineStrings = geom.getLineStrings();
                lineStrings.forEach(lineString => this._addArrows(lineString, arrowOptions));
            } else {
                this._addArrows(geom, arrowOptions);
            }

            if (lineStyle == 'arrowed' && this._shouldAddArrows(arrowLengthPixels)) {
                const arrows = this._getDirectionArrowPolygons(feature, arrowLengthRealMeters);
                arrows.forEach(arrow => arrowPolygons.appendPolygon(arrow));
            }
            // Convert back to user projection after calculations are done in web mercator
            arrowStyle.setGeometry(
                arrowPolygons.transform(getProjection('EPSG:3857'), getUserProjection())
            );
            let style;
            //If has any kind of arrow on line, need to return arrowStyle
            if (hasArrows) style = [lineBodyStyle, arrowStyle];
            else style = lineBodyStyle;

            return style;
        };
    }

    /*
     * Adds arrows on the ends of the lineString if configured
     * @param {ol/geom/LineString} lineString   open layers lineString geometry
     * @param {object} options
     */
    _addArrows(lineString, options) {
        const { startStyle, endStyle, arrowPolygons, arrowLengthRealMeters } = options;
        if (startStyle == 'arrow')
            arrowPolygons.appendPolygon(
                this._getEndpointArrowPolygon(lineString, arrowLengthRealMeters, true)
            );

        if (endStyle == 'arrow')
            arrowPolygons.appendPolygon(
                this._getEndpointArrowPolygon(lineString, arrowLengthRealMeters, false)
            );
    }

    _setLineDash(stroke) {
        const { lineStyle, linePattern, width } = this;
        const pattern = LineStyle.dashStyles[lineStyle] ?? linePattern;
        if (pattern) {
            const adjustedPattern = pattern.map(d => d * width);
            stroke.setLineDash(adjustedPattern);
        }
    }

    /*
     * If arrow is below the minimum length for an arrow return false
     * @param {number} arrowLength px
     * @returns {boolean} true if arrowLength is above the minimum length (px)
     */
    _shouldAddArrows(arrowLength) {
        return arrowLength > this.minArrowLength;
    }

    /*
     * Returns an array of polygons which have the geometry of the arrows to add along the line
     * @param {ol/geom/LineString} feature open layers lineString feature
     * @param {number} arrowLengthRealMeters meters (real)
     * @returns {Array<ol/geom/Polygon>} Array of open layer Polygons
     */
    _getDirectionArrowPolygons(feature, arrowLengthRealMeters) {
        const arrowStyles = [];

        //Set step length
        const stepLength = arrowLengthRealMeters * 4;

        const geom = feature.getGeometry();
        const linestrings = geom.getType() == 'LineString' ? [geom] : geom.getLineStrings?.() || [];
        linestrings.forEach(linestring => {
            //For each segment of line place arrow a step length along (if appropriate)

            if (!linestring.getLength) linestring = toGeometry(linestring);

            const length = linestring.getLength();
            let currentDist = stepLength; //Leave room to add an arrow at start of line

            if (length < stepLength / 2) {
                //very short length - don't add arrow
                return;
            } else if (length < stepLength) {
                // Short length, just put one arrow in the middle
                currentDist = Math.ceil(0.5 * length);
            }

            while (currentDist <= length) {
                const { point, angle } = getPointAndAngleForArrowOnLine(
                    linestring,
                    currentDist,
                    length,
                    stepLength
                );

                arrowStyles.push(shapeGeometryAt(point, 'arrow', angle, arrowLengthRealMeters));
                currentDist += stepLength;
            }
        });
        return arrowStyles;
    }

    /*
     * Create an open layers polygon with arrow geometry
     * @param {ol/geom/LineString} geom open layers lineString geometry
     * @param {number} arrowLengthRealMeters in meters (real)
     * @param {boolean} start should the arrow be added at start or end of line
     * @returns {ol/geom/Polygon} open layer Polygon
     */
    _getEndpointArrowPolygon(geom, arrowLengthRealMeters, start = false) {
        let coordinate;
        let nextCoordinate;
        const coordinates = geom.getCoordinates();
        if (start) {
            coordinate = coordinates[0];
            nextCoordinate = coordinates[1];
        } else {
            coordinate = coordinates[coordinates.length - 1];
            nextCoordinate = coordinates[coordinates.length - 2];
        }
        let angle = bearingBetween(nextCoordinate, coordinate);

        return shapeGeometryAt(coordinate, 'arrow', angle, arrowLengthRealMeters);
    }
}

LineStyle.dashStyles = dashStyles;
export default LineStyle;
