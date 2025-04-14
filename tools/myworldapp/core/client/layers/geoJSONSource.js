// Copyright: IQGeo Limited 2010-2023
import { lngLatFeature } from '../features/lngLatFeature';
import { tooltipFeature } from '../features/tooltipFeature';
import { toProjExtent } from 'myWorld/base/proj';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { getUserProjection } from 'ol/proj';

/**
 * Provides a convenient OpenLayers source for adding geojson geometries to a map
 * Used by {@link GeoJSONVectorLayer}
 * @extends {ol/source/Vector}
 */
export class GeoJSONSource extends VectorSource {
    /**
     * Create a GeoJSONSource
     * @param {objects} options Options for ol/source/Vector  featureProjection defaults to 'EPSG:3857'
     * @example
     * const source = GeoJSONSource();
     * source.addGeoJSON({type: 'LineString', coordinates: [[0.18,52.1],[0.181,52.08]]}, style);
     */
    constructor(options) {
        const { featureProjection = getUserProjection() ?? 'EPSG:3857' } = options;
        const format = new GeoJSON({ featureProjection });
        super({ format, ...options });

        this._projection = featureProjection;
    }

    /**
     * Returns self's features inside a given bounds
     * @param {LatLngBounds} bounds
     * @returns {ol/Feature}
     */
    getFeaturesInBounds(bounds) {
        const extent = toProjExtent(bounds, this._projection);
        return this.getFeaturesInExtent(extent);
    }

    /**
     * Loads a geojson feature or geometry in WGS84 (lat/lng) and adds it
     * @param {geojsonFeature|geojsonGeometry} featureOrGeom
     * @param {ol/style/Style} [style]
     * @returns {MywOlFeature}
     */
    addGeoJSON(featureOrGeom, style) {
        let feature = featureOrGeom;
        if (!feature.geometry) feature = { type: 'Feature', geometry: featureOrGeom };
        const projFeature = this.getFormat().readFeature(feature);

        if (style) projFeature.setStyle(style);

        this.addFeature(projFeature);

        return tooltipFeature(lngLatFeature(projFeature));
    }
}

/**
 * Type of features created by GeoJSONSource and rendered by GeoJSONVectorLayer
 * Extends OpenLayers features with addidional myWorld behaviour, in particular WSG84 utility functions
 * and tooltip behaviour
 * @class MywOlFeature
 * @extends {ol/Feature}
 * @extends LngLatFeatureMixin
 * @extends TooltipFeatureMixin
 */

export default GeoJSONSource;
