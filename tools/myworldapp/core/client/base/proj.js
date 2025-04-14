import { fromLonLat, toLonLat } from 'ol/proj';
import { latLng } from './latLng';
import { latLngBounds } from './latLngBounds';

/**
 * Module with convenience functions to convert geographic data in longitude/latitude to projected coordinates.
 * "project" functions accept data with {@link LatLng} coordinates as well as [lng,lat]
 * "unproject" functions have both {@link LatLng}/{@link LatLngBounds} and [lng,lat] versions
 * By default the Web Mercator, i.e. 'EPSG:3857' projection, will be used
 * These functions should only be necessary when writing/using interaction modes or creating new layer classes.
 * When creating transient vector layers consider using {@link GeoJSONVectorLayer}
 * @module proj
 * @example
 * const { toLatLng, toProjCoord } = myw.proj;
 * map.on('singleclick', event => {
        const latlng = toLatLng(event.coordinate);
 */

// ######################## coordinates
/**
 * Converts a projected coordinate to a lat/lng
 * @function module:proj.toLatLng
 * @param {coordinate} coordinate
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {LatLng}
 */
export function toLatLng(coordinate, projection) {
    const [lng, lat] = toLonLat(coordinate, projection);
    return latLng(lat, lng);
}

/**
 * Converts a projected coordinate to a lng/lat coordinate
 * @function module:proj.toLngLat
 * @param {coordinate} coordinate
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {coordinate} [lng, lat]
 */
export { toLonLat as toLngLat };

/**
 * Transforms a coordinate from longitude/latitude to a Web Mercator, i.e. 'EPSG:3857' projection
 * @function module:proj.toProjCoord
 * @param {LatLng} coord    Coordinate in WGS84
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {point}    [x,y]
 */
export function toProjCoord(latlng, projection) {
    latlng = latLng(latlng);
    return fromLonLat([latlng.lng, latlng.lat], projection);
}

/**
 * Transforms coordinates of a geometry from longitude/latitude to a Web Mercator, i.e. 'EPSG:3857' projection
 * @function module:proj.toProjCoord
 * @param {geomCoordinates} coords
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {point}    [x,y]
 */
export function toProjCoords(coords, projection) {
    const olCoords = [];
    if (isCoord(coords)) {
        //Point
        return toProjCoord(coords, projection);
    } else if (coords[0].length && isCoord(coords[0][0])) {
        //Polygon
        coords.forEach((polgyonnHole, holeIndex) => {
            olCoords.push([]);
            polgyonnHole.forEach(coord => {
                const olCoord = toProjCoord(coord, projection);
                olCoords[holeIndex].push(olCoord);
            });
        });
    } else {
        //Linestring
        coords.forEach(coord => {
            olCoords.push(toProjCoord(coord, projection));
        });
    }

    return olCoords;
}

function isCoord(coord) {
    return (
        (Object.prototype.hasOwnProperty.call(coord, 'lat') &&
            Object.prototype.hasOwnProperty.call(coord, 'lng')) ||
        (Array.isArray(coord) && typeof coord[0] == 'number' && typeof coord[1] == 'number')
    );
}

// ######################## geometries

/**
 * Converts a geometry in Web Mercator projected coordinates to a geometry in lat/lng coordinates
 * @function module:proj.toLatLngs
 * @param {Geometry|ol/geom/Geometry} geom Projected geometry
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {geomCoordinates}  Array(s) of LatLng objects
 */
export function toLngLats(geom, projection) {
    const olCoords = geom.getCoordinates();
    const geomType = geom.getType();
    const coordFn = c => toLonLat(c, projection);
    if (geomType == 'Point') {
        return coordFn(olCoords);
    } else if (geomType == 'Polygon') {
        return olCoords.map(ring => ring.map(coordFn));
    } else if (geomType == 'LineString') {
        //Linestring
        return olCoords.map(coordFn);
    } else {
        throw new Error(`Geometry type '${geomType} 'not supported`);
    }
}

// ############################# Bounds

/**
 * Converts an extent to bounds in lat/lng
 * @function module:proj.toLatLngBounds
 * @param {number[]} extent [minx, miny, maxx, maxy]
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {LatLngBounds}
 */
export function toLatLngBounds(extent, projection) {
    const corner1 = toLatLng([extent[0], extent[1]], projection);
    const corner2 = toLatLng([extent[2], extent[3]], projection);
    return latLngBounds(corner1, corner2);
}

/**
 * Transforms a given bounds in longitude/latitude to a Web Mercator, i.e. 'EPSG:3857' projection
 * @function module:proj.toProjExtent
 * @param {LatLngBounds} bounds
 * @param {ProjectionLike} [projection] Projection of the coordinate. The default is Web Mercator, i.e. 'EPSG:3857'.
 * @returns {number[]} [minx, miny, maxx, maxy]
 */
export function toProjExtent(bounds, projection) {
    bounds = latLngBounds(bounds); //ensure it's the right type
    const se = toProjCoord(bounds.getSouthEast(), projection);
    const nw = toProjCoord(bounds.getNorthWest(), projection);

    //  Extents are presented in the format [minx, miny, maxx, maxy]
    return [
        Math.min(se[0], nw[0]),
        Math.min(se[1], nw[1]),
        Math.max(se[0], nw[0]),
        Math.max(se[1], nw[1])
    ];
}

// #############

export default {
    toLatLng,
    toLngLat: toLonLat,
    toProjCoord,
    toProjCoords,
    toLngLats,
    toLatLngBounds,
    toProjExtent
};

/**
 * See {@link https://openlayers.org/en/latest/apidoc/module-ol_proj.html#~ProjectionLike}
 * @typedef {Projection|string|undefined}
 */
