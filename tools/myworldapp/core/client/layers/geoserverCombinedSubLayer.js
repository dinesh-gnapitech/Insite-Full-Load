// Copyright: IQGeo Limited 2010-2023
import Layer from 'ol/layer/Layer';

export class GeoserverCombinedSubLayer extends Layer {
    /**
     * @class Geoserver layer that delegates the rendering to a (parent) GeoserverCombinedLayer in order to reduce number of requests to the server
     * When self is added to the map, the parent is informed so self's features/layers are included when sending requests.
     * @param {GeoserverCombinedLayer} parent The layer that we will add / remove layer defs to / from
     * @param {Object} layerDef The layer definition to handle
     */
    constructor(parent, layerDef, options) {
        super({});
        this.parent = parent;
        this.layerDef = layerDef;
        this.options = options;
    }

    //  onAdd / onRemove will just forward events to the parent object then let the map know we've handled the event properly
    onAdd(map) {
        this.parent.addSubLayer(map, this);
        return true;
    }

    onRemove(map) {
        this.parent.removeSubLayer(map, this);
        return true;
    }

    /**
     * Obtains the CQL filter for the given predicate
     * @param {string} geoserverLayer
     * @param {DBPredicate} predicate
     * @param {object} sessionVars
     * @returns {string}
     */
    getCQLFor(geoserverLayer, predicate, sessionVars) {
        if (predicate) {
            return predicate.sqlFilter(predicate.layer, undefined, sessionVars, 'CQL');
        } else {
            return 'INCLUDE';
        }
    }
}

export default GeoserverCombinedSubLayer;
