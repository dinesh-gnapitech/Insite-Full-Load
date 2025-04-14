// Copyright: IQGeo Limited 2010-2023
import GeoserverLayer from './geoserverLayer';
import GeoserverCombinedSubLayer from './geoserverCombinedSubLayer';

export class GeoserverCombinedLayer extends GeoserverLayer {
    /**
     * @class Layer that combines a group of layers from the same Geoserver instance
     * Used to optimise/reduce requests to geoserver
     * Sub layers are first created by calling createSubLayer()
     * As the sub layers are added to the map, addSubLayer() is called and its features/layer are from then on included in requests
     * @param {string} url Base URL for the requests
     * @param {object} options Layer options
     */
    constructor(url, options) {
        super(url, options);
        this.layers = [];
        this._layerOptions = [];
        this.mapEventHandled = true;
    }

    //  Create a stub layer for this layer. This gets returned to the map control and acts as an interface between this and the map
    createSubLayer(layerDef, options) {
        const ds = this.options.ds;
        const GeoserverCombinedSubLayerClass = ds._getLayerClassFor(
            layerDef,
            GeoserverCombinedSubLayer
        );
        return new GeoserverCombinedSubLayerClass(this, layerDef, options);
    }

    //  These two functions return true, unless we actually want to add or remove this layer on the map, which we will trigger manually
    onAdd(map) {
        return this.mapEventHandled;
    }
    onRemove(map) {
        return this.mapEventHandled;
    }

    //  These two functions add or remove the layer def, then update the source with the calculated layer defs.
    //  If we need to add or remove this layer, we will manually call the appropriate functions on the map
    addSubLayer(map, layer) {
        if (this.layers.includes(layer)) return; //already been added

        this.layers.push(layer);
        this._layerOptions.push(layer.options);
        this.updatePrefixes();
        this._updateFeatureItems(this._layersToFeatureItems());
        this.updatePredicates();
        if (this.layers.length == 1) {
            //if it's the first layer being added, add self to the map
            this.mapEventHandled = false;
            map.addLayer(this);
            this.mapEventHandled = true;
        }
    }

    removeSubLayer(map, layer) {
        const index = this.layers.indexOf(layer);
        if (index === -1) return; //already removed

        this.layers.splice(index, 1);
        this._layerOptions.splice(index, 1);
        this.updatePrefixes();
        this._updateFeatureItems(this._layersToFeatureItems());
        this.updatePredicates();
        if (this.layers.length == 0) {
            this.mapEventHandled = false;
            map.removeLayer(this);
            this.mapEventHandled = true;
        }
    }

    /*
     * Returns a list of layers for the list of registered layerDefs, handling whether or not a list of
     *  layers to render has been defined
     * @returns {layerFeatureItem[]}
     */
    _layersToFeatureItems() {
        return [].concat(
            ...this.layers.map((layer, layerIndex) =>
                this._layerDefToFeatureItems(layer.layerDef, layerIndex)
            )
        );
    }

    _getLayers(zoom) {
        //  Copied from TileWMSSource, but we need to add the prefix here to match behaviour in GeoserverLayer (which stores featureItem names with prefixes)
        const layers = [];
        this.layers.forEach((layer, layerIndex) => {
            let { wmsLayerGroup, feature_types } = layer.layerDef;
            wmsLayerGroup = wmsLayerGroup || layer.options.wmsLayerGroup;
            const prefix = this._calculatedPrefixes[layerIndex] ?? '';
            if (wmsLayerGroup) {
                layers.push(...wmsLayerGroup.split(','));
            } else {
                feature_types
                    .filter(item => item.field_name)
                    .forEach(featureItem => {
                        if (featureItem.min_vis && zoom < featureItem.min_vis) {
                            return;
                        }

                        if (featureItem.max_vis && zoom > featureItem.max_vis) {
                            return;
                        }
                        layers.push((prefix ?? '') + featureItem.name);
                    });
            }
        });
        return layers;
    }

    /*
     * Obtains layer feature items for a given layer definition, omitting any that don't have a geometry field
     * @param {LayerDef} layerDef
     * @param {number}layerIndex Used to obtain prefix for layerDef
     * @returns {layerFeatureItem[]}
     */
    _layerDefToFeatureItems(layerDef, layerIndex) {
        const prefix = this._calculatedPrefixes[layerIndex] ?? '';
        const { geoserverLayer, wmsLayerGroup, feature_types } = layerDef;

        if (geoserverLayer) {
            return geoserverLayer
                .split(',')
                .filter(String)
                .map(name => ({ name: prefix + name }));
        } else if (wmsLayerGroup) {
            return wmsLayerGroup.split(',').map(name => ({ name, field_name: name }));
        } else {
            return feature_types
                .filter(item => item.field_name)
                .map(featureDef => ({
                    ...featureDef,
                    name: prefix + featureDef.name
                }));
        }
    }

    /**
     * Obtains the CQL filter for the given predicate
     * @param {string} geoserverLayer
     * @param {DBPredicate} predicate
     * @param {object} sessionVars
     * @returns {string}
     */
    getCQLFor(geoserverLayer, predicate, sessionVars) {
        //  Check if the layer def has a custom getCQL implementation
        const subLayer = this.layers.find((layer, layerIndex) => {
            const featureItems = this._layerDefToFeatureItems(layer.layerDef, layerIndex).map(
                item => item.name
            );
            return featureItems.includes(geoserverLayer);
        });
        return subLayer.getCQLFor(geoserverLayer, predicate, sessionVars);
    }
}

export default GeoserverCombinedLayer;
