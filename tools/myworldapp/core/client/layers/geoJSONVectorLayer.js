// Copyright: IQGeo Limited 2010-2023
import GeoJSONSource from './geoJSONSource';
import VectorLayer from 'ol/layer/Vector';
import { getUserProjection } from 'ol/proj';

/**
 * Provides a convenient layer for adding geojson geometries to a map
 * By default creates a {@link GeoJSONSource} with the featureProjection of the given map (EPSG:3857 if no map is given)
 * @extends {ol/layer/Vector}
 */
export class GeoJSONVectorLayer extends VectorLayer {
    /**
     * @param {objects} options Options for ol/layer/Vector
     * @example
     * const layer = new GeoJSONVectorLayer({ map });
     * layer.addPoint([0.18,52.1], style);
     */
    constructor(options) {
        const { map } = options;
        const featureProjection = getUserProjection() ?? 'EPSG:3857';
        const source = options.source ?? new GeoJSONSource({ featureProjection });

        if (map) delete options.map;

        super({ source, ...options });

        if (map) map.addLayer(this);
        this._map = map;
    }

    /**
     * Returns features from the source inside a given bounds
     * @param {LatLngBounds} bounds
     * @returns {ol/Feature[]}
     */
    getFeaturesInBounds(bounds) {
        return this.getSource().getFeaturesInBounds(bounds);
    }

    /**
     * Loads a geojson feature or geometry in WGS84 (lat/lng) and adds it
     * @param {geojsonFeature|geojsonGeometry} featureOrGeom
     * @param {ol/style/Style} [style]
     * @returns {MywOlFeature}
     */
    addGeoJSON(featureOrGeom, style) {
        if (style && typeof style.olStyle == 'function') {
            const view = this._map?.getView();
            style = style.olStyle(view);
        }
        return this.getSource().addGeoJSON(featureOrGeom, style);
    }

    /**
     * Adds a geojson geometry in WGS84 (lat/lng)
     * @param {geojsonGeometry} geom
     * @param {ol/style/Style} [style]
     * @returns {MywOlFeature}
     */
    addGeom(geom, style) {
        return this.addGeoJSON(geom, style);
    }

    /**
     * Adds a point
     * @param {coordinate|LatLng} coord
     * @param {ol/style/Style} [style]
     * @returns {MywOlFeature}
     */
    addPoint(coord, style) {
        //for convenience check if it's a LatLng
        if (
            Object.prototype.hasOwnProperty.call(coord, 'lat') &&
            Object.prototype.hasOwnProperty.call(coord, 'lng')
        )
            coord = [coord.lng, coord.lat];

        return this.addGeom({ type: 'Point', coordinates: coord }, style);
    }
    /**
     * Adds a Line
     * @param {coordinate[]} coordinates
     * @param {ol/style/Style} [style]
     * @returns {MywOlFeature}
     */
    addLine(coordinates, style) {
        return this.addGeom({ type: 'LineString', coordinates }, style);
    }
    /**
     * Adds a polygon
     * @param {coordinate[][]} coordinates
     * @param {ol/style/Style} [style]
     * @returns {MywOlFeature}
     */
    addPolygon(coordinates, style) {
        return this.addGeom({ type: 'Polygon', coordinates }, style);
    }

    /**
     * Removes a feature from the layer
     * Convenience method to calling removeFeature() on layer's source
     * @param {} feature
     */
    remove(feature) {
        return this.getSource().removeFeature(feature);
    }

    /**
     * Removes features in the layer
     * Convenience method to calling clear() on layer's source
     */
    clear() {
        return this.getSource().clear();
    }
}

export default GeoJSONVectorLayer;
