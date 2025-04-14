import TileLayer from 'ol/layer/Tile';
import BingMaps from 'ol/source/BingMaps';

/**
 * Represents a layer with tiles sourced from Bing Maps
 */
export class BingLayer extends TileLayer {
    /**
     * @param {String} key The license key for the Bing maps layer
     * @param {Object} options Options to pass into the TileLayer
     */
    constructor(key, options) {
        const sourceOptions = {
            key,
            imagerySet: options.type
        };
        const source = new BingMaps(sourceOptions);

        const layerOptions = {
            source,
            ...options
        };
        super(layerOptions);
    }
}

export default BingLayer;
