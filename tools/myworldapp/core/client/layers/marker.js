// Copyright: IQGeo Limited 2010-2023
import Overlay from 'ol/Overlay';
import { toProjCoord } from '../base/proj';
import { getUserProjection } from 'ol/proj';

/**
 * Provides a convenient way to create a marker/overlay to add to a map
 * @extends {ol/Overlay/Overlay}
 */
export class Marker extends Overlay {
    /**
     * Creates a marker to be added to a map
     * @param {LatLng} options Options for ol/Overlay/Overlay
     * @param {objects} options Options for ol/Overlay/Overlay
     * @example
     * const layer = new GeoJSONVectorLayer({ map });
     * layer.addPoint([0.18,52.1], style);
     */
    constructor(location, options) {
        const { map } = options;
        const projection = getUserProjection();
        const position = toProjCoord(location, projection);

        if (map) delete options.map;

        super({ position, ...options });
    }
}

export default Marker;
