// Copyright: IQGeo Limited 2010-2023

const mapping = {};

/**
 * Returns an object with appropriate behaviour for the type of a given geojsonGeom
 * The new object is a shallow copy of the given GeoJSon geometry
 * @function
 * @param {geojsonGeom} geojsonGeom
 * @return {Geometry}
 */
const geometryFactory = function geometry(geojsonGeom) {
    if (!geojsonGeom) return geojsonGeom;

    const type = geojsonGeom.type || geojsonGeom.getType();
    const factory = mapping[type];
    if (!factory) throw new Error(`geometry factory: Missing factory for ${type}`);

    const geom = factory();
    Object.assign(geom, geojsonGeom);
    geom.type = type;
    geom.coordinates = geojsonGeom.coordinates || geojsonGeom.getCoordinates();

    return geom;
};

geometryFactory.mapping = mapping;

export default geometryFactory;
