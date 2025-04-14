// Copyright: IQGeo Limited 2010-2023
import geometryFactory from './geomFactory';
import point from './point';
import linestring from './linestring';
import polygon from './polygon';
import multiPoint from './multiPoint';
import multiLineString from './multiLineString';
import multiPolygon from './multiPolygon';

/**
 * An object with the same structure as GeoJson geometry but with behaviour apropriate to its type
 * See {@link http://geojson.org/geojson-spec.html#geometry-objects} for details on geojson
 * All types include the behaviour from {@link GeometryMixin}
 * Can be used in place of {@link geojsonGeom}
 * @typedef {geometry.Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon} Geometry
 * @property {string} type          One of "Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"
 * @property {Array} coordinates    Depends on type. See {@link http://geojson.org/geojson-spec.html#appendix-a-geometry-examples}
 */

/**
 * One of 'meters', 'degrees', 'radians', 'miles', or 'kilometers'
 * @typedef {string} unit
 */

/**
 * Module to provide behaviour to GeoJson geometries. <br/>
 * The module can be invoked directly as a factory, passing in a geoJson geometry - the result will be a {@link Geometry}.
 * Convenience factory functions are also provided for creating objects directly from coordinates. See examples below. </br>
 * Some methods on {@link Geometry} will depend on additional libraries. These dependencies can be loaded by initializing the module. To ensure the module is initialized, call geometry.init() and wait for the
 * returned promise to resolve.
 * @module geometry
 * @example
 * var l = geometry({type: 'LineString', coordinates: [[0.1261,52.2014], [1.2675,52.2009]]});
 * l.selfIntersects(); //returns false
 * l.length(); //returns length in meters
 * l.buffer(10); //returns a Polygon
 * l.buffer(20).area(); //Polygon has appropriate methods
 * @example
 * var p1 = geometry.point([0.1261, 52.2014]);
 * @example //Module initialization
 * geometry.init().then(() => {
 *     //geometry operations
 * })
 */

const convertCoords = coords => {
    if (Object.prototype.hasOwnProperty.call(coords, 'lat')) return [coords.lng, coords.lat];
    else if (coords.length == 2 && typeof coords[0] == 'number') return coords;
    else return coords.map(convertCoords);
};

const mapping = {
    Point: point,
    MultiPoint: multiPoint,
    LineString: linestring,
    MultiLineString: multiLineString,
    Polygon: polygon,
    MultiPolygon: multiPolygon
};

Object.assign(geometryFactory.mapping, mapping);

//add factory methods for each geom type that take just the coordinates
const specificFactory = (key, coords) => {
    coords = convertCoords(coords);
    return geometryFactory({ type: key, coordinates: coords });
};
for (const key in mapping) {
    const name = key.charAt(0).toLowerCase() + key.slice(1);
    geometryFactory[name] = specificFactory.bind(null, key);
    geometryFactory[key] = specificFactory.bind(null, key);
}

/**
 * Create a Point directly from coordinate
 * @function module:geometry.point
 * @param {coordinate} coordinate
 * @returns {Point}
 * @example
 * var p1 = geometry.point([0.1261,52.2014]);
 * var p2 = geometry.point({lng: 0.1261, lat:52.2014});
 * //p1 and p2 are equivalent
 */

/**
 * Create a LineString directly from coordinates
 * @function module:geometry.lineString
 * @param {coordinate[]} coordinates
 * @returns {LineString}
 * @example
 * var p1 = geometry.lineString([[0.175, 52.188], [0.176, 52.190], [0.176, 52.192]]);
 */

/**
 * Create a Polygon directly from coordinates
 * @function module:geometry.polygon
 * @param {coordinate[]} coordinates
 * @returns {Polygon}
 * @example
 * var p1 = geometry.polygon([[0.175, 52.188], [0.176, 52.190], [0.176, 52.192]]);
 */

/**
 * Create a MultiPoint directly from coordinates
 * @function module:geometry.multiPoint
 * @param {coordinate[]} coordinates
 * @returns {MultiPoint}
 */

/**
 * Create a MultiLineString directly from coordinates
 * @function module:geometry.multiLineString
 * @param {coordinate[]} coordinates
 * @returns {MultiLineString}
 */

/**
 * Create a MultiPolygon directly from coordinates
 * @function module:geometry.multiPolygon
 * @param {coordinate[]} coordinates
 * @returns {MultiPolygon}
 */

export default geometryFactory;
