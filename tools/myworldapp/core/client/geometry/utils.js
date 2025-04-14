// Copyright: IQGeo Limited 2010-2023

/*
 * Removes consecutive duplicate coordinates from self
 */
export function withoutDuplicates(coords) {
    const uniquePoints = [];
    let prev = null;

    for (const c of coords) {
        if (!prev || c[0] !== prev[0] || c[1] !== prev[1]) {
            uniquePoints.push(c);
        }
        prev = c;
    }

    return uniquePoints;
}

/*
 * Executes a function on each coordinate of the given geometry
 * @param {geometry|geojsonCoordinates} geom
 * @param {function} fn
 */
export function coordEach(geom, fn, i = 0) {
    const coords = geom.coordinates ?? geom;
    if (!isNaN(coords[0]) && !isNaN(coords[1])) fn(coords, i);
    if (!Array.isArray(coords)) return;
    for (const coord of coords) {
        coordEach(coord, fn, i++);
    }
}

/*
 * Maps each coordinate in a given geometry with a given function
 * @param {geometry|geojsonCoordinates} geom
 * @param {function} fn Function to apply to each coordinate
 * @returns {geojsonCoordinates}}
 */
export function coordMap(geom, fn) {
    const coords = geom.coordinates ?? geom;
    if (!isNaN(coords[0]) && !isNaN(coords[1])) return fn(coords);
    if (!Array.isArray(coords)) return fn(coords);
    return coords.map(el => coordMap(el, fn));
}
