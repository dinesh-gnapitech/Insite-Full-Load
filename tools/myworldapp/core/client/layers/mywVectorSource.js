import GeoJSONSource from './geoJSONSource';
import { bbox } from 'ol/loadingstrategy';

/**
 * Source for myWorld vector layers
 * {ol/source/Vector} includes a caching of extents that doesn't fit with myWorld's behaviour of
 *  allowing visibility of feature types depending on zoom level.
 * With this class the loader method is called on every map view change and the optimisations are left to
 * the loader
 */
export class MywVectorSource extends GeoJSONSource {
    /**
     * @param {object} See {ol/source/Vector}
     * @extends {ol/source/Vector}
     */
    constructor(options) {
        //strategy should be bbox so that it generates a call to source.loadFeatures on every map view change
        super({ ...options, strategy: bbox });
    }

    /**
     * Overridden as the loaded extents concept doesn't work with our services
     * (it may be necessary to issue a new request to get more feature types - visible at different zoom levels)
     * @param {ol/Extent} extent Extent.
     * @param {number} resolution Resolution.
     * @param {ProjectionLike} projection Projection.
     */
    loadFeatures(extent, resolution, projection) {
        this.loader_.call(this, extent, resolution, projection);
    }
}

export default MywVectorSource;
