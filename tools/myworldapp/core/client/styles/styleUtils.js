// Copyright: IQGeo Limited 2010-2023
import { IconStyle, SymbolStyle, LineStyle, FillStyle, Style } from './styles';
import { fromString } from 'ol/color';
import Polygon from 'ol/geom/Polygon';
import MultiPolygon from 'ol/geom/MultiPolygon';
import { symbols, shapeWorldSide } from './symbols';
import svgRenderer from './svgRenderer';
export { symbols, svgRenderer };

/**
 * Available via myw.styleUtils
 * @module styleUtils
 */

/**
 * Given a coordinate(s), shape name, rotation and size a polygon of that shape at the coordinate
 * @param {coordinate|Array<coordinate>} coords  A coordinate or a list of coordinates of where do draw the shape
 * @param {string} shapeName
 * @param {number} rotation in radians
 * @param {number} width In meters (projected)
 * @returns {function}  feature->ol/geom/Polygon
 */
export function shapeGeometryAt(coords, shapeName, rotation, width) {
    if (typeof coords[0] == 'object') {
        //multi coordinates / multi-point
        const polygons = coords.map(coord => shapeGeometryAt(coord, shapeName, rotation, width));
        return new MultiPolygon(polygons);
    }
    //single coordinate
    const coord = coords;
    const scaleFactor = width / shapeWorldSide;
    const symbolCoords = symbols[shapeName];

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const ancX = shapeWorldSide / 2;
    const ancY = shapeWorldSide / 2;
    const mappedCoords = symbolCoords.map(([x, y]) => {
        let nx;
        let ny;
        if (shapeName == 'arrow') {
            //Need to place tip of arrow on end of line
            nx = cos * (x - ancX) + sin * (y - 35 - ancY);
            ny = cos * (y - 35 - ancY) - sin * (x - ancX);
        } else {
            nx = cos * (x - ancX) + sin * (y - ancY);
            ny = cos * (y - ancY) - sin * (x - ancX);
        }

        return [coord[0] + nx * scaleFactor, coord[1] + ny * scaleFactor];
    });

    return new Polygon([mappedCoords]);
}

export function colorFromString(str) {
    const inHex = colorNameToHex(str);
    try {
        return fromString(inHex);
    } catch (e) {
        console.warn(`Error applying fromString to '${str} (${inHex})'`);
        return [0, 0, 0, 0];
    }
}

/**
 * Add text marker to overlay at specified position and orientation
 * @private
 */
export function getLabelTextFor(feature, propName) {
    let text;
    if (propName.slice(-2) == '()') {
        try {
            text = feature[propName.slice(0, -2)]();
        } catch (e) {
            text = propName;
        }
    } else {
        text = feature.getProperties()[propName];
    }
    if (!text) return;

    // Coerce value to text
    text = '' + text;

    // Simple support for multi-line text.
    text = text.replace(/\n/g, '<br>');

    return text;
}

/**
 * Gets coordinate and angle to position an arrow on a lineString
 * If there is only room for one arrow in the line it will find the coordinate and the angle on the middle of the line
 * @param {ol/geom/LineString} feature open layers lineString
 * @param {number} currentDist length along linestring
 * @param {number} length length of lineString
 * @param {number} stepLength length to go along lineString
 * @return {Object} point and angle to place arrow
 */
export function getPointAndAngleForArrowOnLine(line, currentDist, length, stepLength) {
    //If only room for one arrow per section place at midpoint (looks better)
    const fraction = currentDist / length;
    if (fraction > 0.5 && stepLength > length / 2) currentDist = length * 0.5;

    //Get point slightly before and after distance
    const firstFraction = Math.max(0, (currentDist - 0.01) / length);
    const firstPoint = line.getCoordinateAt(firstFraction);

    const nextFraction = Math.min(length, (currentDist + 0.01) / length);
    const nextPoint = line.getCoordinateAt(nextFraction);

    const angle = bearingBetween(firstPoint, nextPoint); //rads

    return { point: nextPoint, angle };
}

/**
 * Calculates bearing between two points
 * @param {Array} point1 openLayers coordinate pair
 * @param {Array} point2 openLayers coordinate pair
 * @returns angle in radians
 */
export function bearingBetween(point1, point2) {
    let rads = Math.atan2(point2[0] - point1[0], point2[1] - point1[1]);
    return rads;
}

/**
 * Returns default styles given a system configuration
 * @param {object} config System settings from database
 * @returns {Object<string,styleDefinition>} Keyed on geometry type
 */
export function stylesForConfig(config) {
    const markerHighlightStyle = config['core.defaultMarkerStyleHighlight'];
    const markerNormalStyle = config['core.defaultMarkerStyleNormal'];
    const markerStyle = styleOptions => {
        const MarkerStyle = styleOptions.iconUrl ? IconStyle : SymbolStyle;
        return new MarkerStyle(styleOptions);
    };
    const styles = {
        Point: {
            highlight: markerStyle(markerHighlightStyle),
            normal: markerStyle(markerNormalStyle)
        },
        LineString: {
            highlight: new LineStyle(config['core.defaultPolylineStyleHighlight']),
            normal: new LineStyle(config['core.defaultPolylineStyleNormal'])
        },
        Polygon: {
            highlight: styleFromPolygonDef(config['core.defaultPolygonStyleHighlight']),
            normal: styleFromPolygonDef(config['core.defaultPolygonStyleNormal'])
        }
    };
    styles.MultiPoint = styles.Point;
    styles.MultiLineString = styles.LineString;
    styles.MultiPolygon = styles.Polygon;
    return styles;
}

/**
 * Returns a Style from a line/polygon style definition
 * @param {object} def
 * @returns {ol/style/Style}
 */
function styleFromPolygonDef(def) {
    if (def.line && def.fill) {
        //new format
        return new Style(new LineStyle(def.line), new FillStyle(def.fill));
    }

    //old format
    const color = def.color || 'black';
    const line = new LineStyle({ color, width: def.weight, opacity: def.opacity ?? 1 });
    const fillColor = def.fillColor || 'transparent';
    const fill = new FillStyle({ color: fillColor, opacity: def.fillOpacity ?? 1 });
    return new Style(line, fill);
}

const isValidHex = hex => /^#([A-Fa-f0-9]{3,4}){1,2}$/.test(hex);

const getChunksFromString = (st, chunkSize) => st.match(new RegExp(`.{${chunkSize}}`, 'g'));

const convertHexUnitTo256 = hexStr => parseInt(hexStr.repeat(2 / hexStr.length), 16);

const getAlphafloat = (a, alpha) => {
    if (typeof a !== 'undefined') {
        return a / 256;
    }
    if (typeof alpha !== 'undefined') {
        if (1 < alpha && alpha <= 100) {
            return alpha / 100;
        }
        if (0 <= alpha && alpha <= 1) {
            return alpha;
        }
    }
    return 1;
};

export function hexToRGBA(hex, alpha) {
    if (hex.charAt(0) == 'r') return hex; //given rgba value: dont modify
    if (!isValidHex(hex)) {
        throw new Error('Invalid HEX');
    }
    const chunkSize = Math.floor((hex.length - 1) / 3);
    const hexArr = getChunksFromString(hex.slice(1), chunkSize);
    const [r, g, b, a] = hexArr.map(convertHexUnitTo256);
    return `rgba(${r}, ${g}, ${b}, ${getAlphafloat(a, alpha)})`;
}

function rgbaToHex(str) {
    const components = str.split('(')[1].split(')')[0].split(',');
    return '#' + components.map(componentToHex).join('');
}

function componentToHex(c) {
    var hex = parseInt(c).toString(16);
    return hex.length == 1 ? '0' + hex : hex;
}

/**
 * Changes color to hex value as named colors are not supported by react color picker used by the stylepick in the config pages and color names are in the database
 * @param {string} color
 */
export function colorNameToHex(color) {
    if (!color) return '';
    if (color[0] === '#') return color;
    if (color.startsWith('rgba(')) return rgbaToHex(color);
    const colors = {
        aliceblue: '#f0f8ff',
        antiquewhite: '#faebd7',
        aqua: '#00ffff',
        aquamarine: '#7fffd4',
        azure: '#f0ffff',
        beige: '#f5f5dc',
        bisque: '#ffe4c4',
        black: '#000000',
        blanchedalmond: '#ffebcd',
        blue: '#0000ff',
        blueviolet: '#8a2be2',
        brown: '#a52a2a',
        burlywood: '#deb887',
        cadetblue: '#5f9ea0',
        chartreuse: '#7fff00',
        chocolate: '#d2691e',
        coral: '#ff7f50',
        cornflowerblue: '#6495ed',
        cornsilk: '#fff8dc',
        crimson: '#dc143c',
        cyan: '#00ffff',
        darkblue: '#00008b',
        darkcyan: '#008b8b',
        darkgoldenrod: '#b8860b',
        darkgray: '#a9a9a9',
        darkgreen: '#006400',
        darkkhaki: '#bdb76b',
        darkmagenta: '#8b008b',
        darkolivegreen: '#556b2f',
        darkorange: '#ff8c00',
        darkorchid: '#9932cc',
        darkred: '#8b0000',
        darksalmon: '#e9967a',
        darkseagreen: '#8fbc8f',
        darkslateblue: '#483d8b',
        darkslategray: '#2f4f4f',
        darkturquoise: '#00ced1',
        darkviolet: '#9400d3',
        deeppink: '#ff1493',
        deepskyblue: '#00bfff',
        dimgray: '#696969',
        dodgerblue: '#1e90ff',
        firebrick: '#b22222',
        floralwhite: '#fffaf0',
        forestgreen: '#228b22',
        fuchsia: '#ff00ff',
        gainsboro: '#dcdcdc',
        ghostwhite: '#f8f8ff',
        gold: '#ffd700',
        goldenrod: '#daa520',
        gray: '#808080',
        green: '#008000',
        greenyellow: '#adff2f',
        honeydew: '#f0fff0',
        hotpink: '#ff69b4',
        'indianred ': '#cd5c5c',
        indigo: '#4b0082',
        ivory: '#fffff0',
        khaki: '#f0e68c',
        lavender: '#e6e6fa',
        lavenderblush: '#fff0f5',
        lawngreen: '#7cfc00',
        lemonchiffon: '#fffacd',
        lightblue: '#add8e6',
        lightcoral: '#f08080',
        lightcyan: '#e0ffff',
        lightgoldenrodyellow: '#fafad2',
        lightgrey: '#d3d3d3',
        lightgreen: '#90ee90',
        lightpink: '#ffb6c1',
        lightsalmon: '#ffa07a',
        lightseagreen: '#20b2aa',
        lightskyblue: '#87cefa',
        lightslategray: '#778899',
        lightsteelblue: '#b0c4de',
        lightyellow: '#ffffe0',
        lime: '#00ff00',
        limegreen: '#32cd32',
        linen: '#faf0e6',
        magenta: '#ff00ff',
        maroon: '#800000',
        mediumaquamarine: '#66cdaa',
        mediumblue: '#0000cd',
        mediumorchid: '#ba55d3',
        mediumpurple: '#9370d8',
        mediumseagreen: '#3cb371',
        mediumslateblue: '#7b68ee',
        mediumspringgreen: '#00fa9a',
        mediumturquoise: '#48d1cc',
        mediumvioletred: '#c71585',
        midnightblue: '#191970',
        mintcream: '#f5fffa',
        mistyrose: '#ffe4e1',
        moccasin: '#ffe4b5',
        navajowhite: '#ffdead',
        navy: '#000080',
        oldlace: '#fdf5e6',
        olive: '#808000',
        olivedrab: '#6b8e23',
        orange: '#ffa500',
        orangered: '#ff4500',
        orchid: '#da70d6',
        palegoldenrod: '#eee8aa',
        palegreen: '#98fb98',
        paleturquoise: '#afeeee',
        palevioletred: '#d87093',
        papayawhip: '#ffefd5',
        peachpuff: '#ffdab9',
        peru: '#cd853f',
        pink: '#ffc0cb',
        plum: '#dda0dd',
        powderblue: '#b0e0e6',
        purple: '#800080',
        rebeccapurple: '#663399',
        red: '#ff0000',
        rosybrown: '#bc8f8f',
        royalblue: '#4169e1',
        saddlebrown: '#8b4513',
        salmon: '#fa8072',
        sandybrown: '#f4a460',
        seagreen: '#2e8b57',
        seashell: '#fff5ee',
        sienna: '#a0522d',
        silver: '#c0c0c0',
        skyblue: '#87ceeb',
        slateblue: '#6a5acd',
        slategray: '#708090',
        snow: '#fffafa',
        springgreen: '#00ff7f',
        steelblue: '#4682b4',
        tan: '#d2b48c',
        teal: '#008080',
        thistle: '#d8bfd8',
        tomato: '#ff6347',
        transparent: '#00000000',
        turquoise: '#40e0d0',
        violet: '#ee82ee',
        wheat: '#f5deb3',
        white: '#ffffff',
        whitesmoke: '#f5f5f5',
        yellow: '#ffff00',
        yellowgreen: '#9acd32'
    };

    if (typeof colors[color.toLowerCase()] != 'undefined') return colors[color.toLowerCase()];

    return false;
}
