import { EsriJSON, GeoJSON } from 'ol/format';
import { Vector as VectorLayer, Group as GroupLayer } from 'ol/layer';
import { bbox } from 'ol/loadingstrategy';
import VectorSource from 'ol/source/Vector';
import { boundingExtent } from 'ol/extent';
import { toProjCoords } from 'myWorld/base/proj';
import { MissingImplementationError } from 'myWorld/base/errors';
import EsriDrawingInfoParser from './esriDrawingInfoParser';
import { getUserProjection } from 'ol/proj';

//  We use this to translate the OpenLayers objects into GeoJSON, so that they render properly on the map when we use them
const _geoJson = new GeoJSON();
export class ArcGISVectorRestSource extends VectorSource {
    constructor(options) {
        super({
            ...options,

            /*
             * From the information provided, we construct the URL and fetch the data. Once it arrives, we use the EsriJSON class to translate the features into a format we can store
             */
            loader: async function (extent, resolution, projection) {
                await this.loadWithOffset(extent, resolution, projection, 0);
            },
            strategy: bbox
        });
        this.params_ = {
            f: 'json',
            returnGeometry: true,
            spatialRel: 'esriSpatialRelIntersects',
            geometryType: 'esriGeometryEnvelope',
            outFields: '*',
            ...(options.params || {})
        };
        this.layerId = options.layerId;
    }

    async loadWithOffset(extent, resolution, projection, resultOffset = 0) {
        const srid = projection
            .getCode()
            .split(/:(?=\d+$)/)
            .pop();

        const geometry = JSON.stringify({
            xmin: extent[0],
            ymin: extent[1],
            xmax: extent[2],
            ymax: extent[3],
            spatialReference: {
                wkid: srid
            }
        });
        const args = {
            ...this.params_,
            inSR: srid,
            geometry,
            outSR: srid,
            resultOffset
        };
        const baseUrl = this.getUrl();
        const url = new URL(`${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}${this.layerId}/query`);
        for (const [paramName, param] of Object.entries(args)) {
            url.searchParams.set(paramName, param);
        }
        const res = await fetch(url).then(res => res.json());
        const features = new EsriJSON().readFeatures(res, {
            featureProjection: projection
        });
        if (features.length > 0) {
            //  Cache the ESRI object ID to the name here. We use this later for selecting the correct feature definition later
            features.forEach(feature => {
                feature.esriLayerID = this.layerId;
            });
            this.addFeatures(features);
        }
        //  Just in case we go over the number of features, get the next batch here
        if (res.exceededTransferLimit) {
            this.loadWithOffset(extent, resolution, projection, resultOffset + features.length);
        }
    }

    getParams() {
        return this.params_;
    }

    updateParams(params) {
        Object.assign(this.params_, params);
    }

    /*
     * Features are stored in the source in their own format, use this to translate them into a format we can use
     */
    _olFeatureToGeoJSON(feature) {
        return {
            ..._geoJson.writeFeatureObject(feature, {
                featureProjection: getUserProjection()
            }),
            esriLayerID: feature.esriLayerID
        };
    }

    /*
     * Finds objects that exist at the projection coordinate, then translates them into GeoJSON
     */
    getFeaturesAtProjCoord(projCoord) {
        let features = super.getFeaturesAtCoordinate(projCoord);
        if (features.length) {
            features = features.map(feature => this._olFeatureToGeoJSON(feature));
        }
        return features;
    }

    /*
     * Finds objects that exist within the given extent, then translates them into GeoJSON
     */
    getFeaturesInExtent(extent, projection, translate = false) {
        let features = super.getFeaturesInExtent(extent, projection);
        if (translate && features.length) {
            features = features.map(feature => this._olFeatureToGeoJSON(feature));
        }
        return features;
    }

    /*
     * Finds objects by their ID, then translates them into GeoJSON
     */
    getFeatureById(id) {
        let feature = super.getFeatureById(id);
        if (feature) {
            feature = this._olFeatureToGeoJSON(feature);
        }
        return feature;
    }
}

/**
 * Layer that is used to render features from a specific layer on an ESRI FeatureServer
 */
export class EsriFeatureServerItemLayer extends VectorLayer {
    constructor(options) {
        const source = new ArcGISVectorRestSource({
            ratio: 1,
            url: options.url,
            layerId: options.layerId,
            params: {}
        });
        const layerOptions = {
            source,
            ...options
        };
        super(layerOptions);

        //  This is a function that we use to get style information for a given feature
        this.style = null;
        this.legendInfo = null;
        this.setStyle(this.getStyleForESRIFeature.bind(this));
        this.map = options.map;
    }

    getStyleForESRIFeature(feature) {
        return this.style(feature, this.map);
    }

    /*
     * This sets the style function to style the feature as either an ESRI or myWorld feature, depending on what is set in the config
     */
    parseStyle(featureDD, layerFeatureItem) {
        const renderingType = this.get('renderingType');
        let styleInfo = null;
        const parser = new EsriDrawingInfoParser();
        if (renderingType == 'myworld') {
            styleInfo = parser.parseMyWorldStyle(featureDD, layerFeatureItem);
        } else {
            const { drawing_info } = layerFeatureItem;
            styleInfo = parser.parseStyle(drawing_info?.renderer);
        }
        this.style = styleInfo?.style;
        this.legendInfo = styleInfo?.legendInfo;
    }

    getLegendInfo() {
        return this.legendInfo || null;
    }
}

/**
 * Layer that is used to render features from an ESRI FeatureServer
 * This is actually a group layer that interacts with several sub-layers for each FeatureServer layer
 */
export class EsriFeatureServerLayer extends GroupLayer {
    constructor(options, featuresDD, layerDef) {
        /*
         * We create a new layer for each ESRI feature. We also create a lookup table for ESRI layer IDs to where in the array we've put them
         */
        const layers = [];
        let len = 0;
        let lookup = {};
        for (let layerFeatureItem of layerDef.feature_types) {
            const featureDD = featuresDD[layerFeatureItem.name];
            const { layerId } = featureDD;
            const renderingType = layerDef.featureRendering?.[layerFeatureItem.name];
            const newLayer = new EsriFeatureServerItemLayer({
                layerId,
                ...options,
                renderingType
            });
            newLayer.parseStyle(featureDD, layerFeatureItem);
            layers[len] = newLayer;
            lookup[layerId] = {
                pos: len,
                name: layerFeatureItem.name,
                externalName: featureDD.external_name
            };
            len++;
        }
        super({ layers, ...options });
        this.lookup = lookup;
        this._getLayerIDsMethod = null;
    }

    setGetLayerIDsMethod(method) {
        this._getLayerIDsMethod = method;
    }

    onAdd(map) {
        this.map = map;
        this.setLayersFromZoom(map);
        map.on('moveend', this.setLayersFromZoom.bind(this, map));
        return false;
    }

    setVisibleLayers(visibleLayers) {
        const layers = this.getLayersArray();
        for (let layer of layers) {
            const layerID = layer.get('layerId');
            layer.map = this.map;
            layer.setVisible(visibleLayers.includes(layerID));
        }
    }

    setLayersFromZoom(map) {
        if (!this.setVisibleLayers) {
            throw new MissingImplementationError('Layer does not implement setVisibleLayers()');
        }

        if (this._getLayerIDsMethod == null) {
            throw new MissingImplementationError(
                'Layer does not have a method for fetching layer IDs to display set'
            );
        }

        const layerIds = this._getLayerIDsMethod(map.getView().getZoom(), false);
        if (layerIds) this.setVisibleLayers(layerIds);
    }

    /*
     * Gets the features from each object at the specified LatLng, then returns them as a FeatureCollection
     */
    getFeatureCollectionAtLatLng(latLng, hitTolerance, layerIDs) {
        const pixel = this.map.latLngToPixel(latLng);
        if (!layerIDs) layerIDs = [];
        const layers = this.getLayersArray().filter(layer =>
            layerIDs.includes(layer.get('layerId'))
        );
        const features = [];
        this.map.forEachFeatureAtPixel(
            pixel,
            function (feature, layer) {
                const source = layer.getSource();
                features.push(source._olFeatureToGeoJSON(feature));
            },
            {
                hitTolerance,
                layerFilter: layer => layers.includes(layer)
            }
        );
        return {
            type: 'FeatureCollection',
            features
        };
    }

    /*
     * Gets the features from each object within the specified LatLng bounds, then returns them as a FeatureCollection
     */
    getFeatureCollectionInBounds(bounds, layerID) {
        const projection = getUserProjection();
        const northEastLatLng = bounds.getNorthEast();
        const southWestLatLng = bounds.getSouthWest();
        const northEastProj = toProjCoords(northEastLatLng, projection);
        const southWestProj = toProjCoords(southWestLatLng, projection);

        const extent = boundingExtent([northEastProj, southWestProj]);

        const layers = this.getLayersArray();
        let features = [];
        for (let layer of layers) {
            if (layer.get('layerId') == layerID) {
                const source = layer.getSource();
                features = features.concat(source.getFeaturesInExtent(extent, projection, true));
            }
        }
        return {
            type: 'FeatureCollection',
            features
        };
    }

    /*
     * Gets the features from the specified ESRI layer ID and feature ID
     */
    getFeatureById(layerId, id) {
        const layers = this.getLayersArray();
        const layer = layers[this.lookup[layerId].pos];
        const source = layer.getSource();
        return source.getFeatureById(id);
    }

    authenticate(token) {
        this._updateParamValue('TOKEN', token);
    }
    _updateParamValue(paramName, value) {
        const layers = this.getLayersArray();
        for (const layer of layers) {
            const source = layer.getSource();
            const params = source.getParams();
            params[paramName] = value;
            source.updateParams(params);
        }
    }

    /*
     * Gets the legend info for each layer and returns them in an object,
     * where the layer name is the key name and the legend info is the value
     */
    getLegendInfo() {
        const layers = this.getLayersArray();
        const combined = {};
        for (const layer of layers) {
            const legendInfo = layer.getLegendInfo();
            if (legendInfo) {
                const layerId = layer.get('layerId');
                const featureType = this.lookup[layerId].name;
                combined[featureType] = { label: this.lookup[layerId].externalName, legendInfo };
            }
        }
        return combined;
    }

    /*
     * Since this group layer doesn't actually have a source itself, we should be able to just use the first layer source
     * If there aren't any layers, just return null
     */
    getSource() {
        const layers = this.getLayersArray();
        if (layers.length > 0) {
            return layers[0].getSource();
        } else {
            return null;
        }
    }
}

export default EsriFeatureServerLayer;
