// Copyright: IQGeo Limited 2010-2023
import MywVectorTileCombinedSource from './mywVectorTileCombinedSource';
import { getTileGridFor } from './tileLayerUtils';
import MywMVTFormat from './mywMVTFormat';
import { Vector as VectorLayer } from 'ol/layer';
import { delay } from 'myWorld/base/util';
import { trace as mywTrace } from 'myWorld/base/trace';
import { getUserProjection } from 'ol/proj';

const trace = mywTrace('layer');

export class MywSharedVectorSource extends VectorLayer {
    /**
     * @class "Ghost" layer to drive a vector tile source which serves a group of vector layers
     * Used to reduce number of requests sent by browser as browsers only allow a few concurrent requests, in turn
     * degrading performance as seen by user.
     * Layers that want to use this source need to call addLayer() so its features types are then included in requests
     * @param {MyWorldDatasource} datasource
     * @param {object} options
     */
    constructor(datasource, options = {}) {
        const { tileSize = 512, maxTileZoom = 17, url, cacheExpiryTimeout = 1000 * 10 } = options;
        const format = new MywMVTFormat(datasource);
        const tileGrid = getTileGridFor(maxTileZoom, tileSize);
        const source = new MywVectorTileCombinedSource({
            url,
            handleResultsCallback: features => this.handleLayerFeaturesResults(features),
            tileGrid,
            format
        });

        super({ source });
        this.datasource = datasource;
        this.layers = [];
        this._cacheExpiryTimeout = cacheExpiryTimeout;
    }

    /**
     * Implementation of ILayer.onAdd
     * @param {ol/Map} map
     */
    onAdd(map) {
        this.map = map;
        this._projection = getUserProjection();
    }

    refresh() {
        //uses timeout to avoid multiple refreshes generated from different layers
        trace(7, `MywSharedVectorSource: refresh request`);
        if (this._refreshTimeoutId) return;
        this._updateRequestParams(); //done before actual refresh in case something else (like a pan/zoom) triggers new requests
        this._refreshTimeoutId = setTimeout(() => {
            trace(6, `MywSharedVectorSource: refreshing`);
            this.getSource().refresh();
            this.changed();
            this._refreshTimeoutId = null;
        }, 10);
    }

    //  These two functions add or remove the layer def, then update the source with the calculated layer defs.
    //  If we need to add or remove this layer, we will manually call the appropriate functions on the map
    async addLayer(map, layer) {
        if (this.layers.includes(layer)) return; //already been added

        this.layers.push(layer);
        this.initialized = this.datasource.getDDInfoFor(this.getFeatureTypes());

        //ensure self is on the map
        if (this.layers.length === 1) map.addLayer(this);

        //introduce small delay to give chance for other layers to be added (e.g. on startup) before starting to send requests
        await delay(10);

        this._onLayersChanged();
    }

    removeLayer(map, layer) {
        const index = this.layers.indexOf(layer);
        if (index === -1) return; //already removed

        this.layers.splice(index, 1);
        this._onLayersChanged();

        //remove self from the map (if last sub layer)
        if (this.layers.length === 0) map.removeLayer(this);
    }

    _onLayersChanged() {
        this._updateRequestParams();
        this._layersForGeomMap = null; //if layers change, this mapping cache needs to be cleared, otherwise older layers would be kept preventing newer versions from being used
        this._hasDynamicLayers = this.layers.some(layer => layer.options.isStatic === false);
    }

    /**
     * Processes a list of features obtained from the database,
     * creating feature representations on the map control if necessary
     * @param  {boolean} redraw Whether the existing feature representations should be refreshed as well
     * @param  {Array<DDFeature>} features Features obtained from the database
     */
    async handleLayerFeaturesResults(features) {
        await this.initialized;

        trace(11, `MywSharedVectorSource: handleLayerFeaturesResults (${features.length})`);

        this._scheduleExpireCache();

        for (const feature of features) {
            if (!feature) continue;
            const {
                feature_type,
                geom_field: geomFieldName,
                // eslint-disable-next-line no-unused-vars
                layer: discard_,
                ...properties
            } = feature.getProperties();
            trace(12, feature_type, geomFieldName, feature.ol_uid);

            const geom = feature.getGeometry();
            const mywFeature = this.toMywFeature(feature_type, geomFieldName, properties, geom);

            //add to each layer this geom is in
            const layers = this._layersForGeom(feature_type, geomFieldName);
            for (let i = 0; i < layers.length; i++) {
                const [layer, lfItem] = layers[i];
                //if feature is in more than one layer, each layer needs a copy so OpenLayers renders it
                const feat = i > 0 ? feature.clone() : feature;
                layer.add(feat, lfItem, mywFeature);
            }
        }
    }

    toMywFeature(feature_type, geomFieldName, properties, olGeom) {
        let geometry = {
            type: olGeom.getType(),
            coordinates: olGeom.getFlatCoordinates()
        };
        delete properties.geometry;
        const secondary_geometries = {};
        const featureDD = this.datasource.featuresDD[feature_type];
        if (!featureDD) {
            console.error(`Missing DD for '${feature_type}'`);
            return;
        }
        const primaryGeomFieldName = featureDD.primary_geom_name;
        if (primaryGeomFieldName != geomFieldName) {
            secondary_geometries[geomFieldName] = geometry;
            geometry = undefined;
        }
        const geoJsonFeature = {
            properties,
            geometry,
            myw: { feature_type },
            secondary_geometries
        };
        const mywFeature = this.datasource._asFeature(geoJsonFeature, feature_type);
        return mywFeature;
    }

    /**
     * Returns the feature type names for this layer.
     * Combines types of sub layers
     * @return {string[]} Feature types to render on this layer
     */
    getFeatureTypes() {
        const names = new Set();
        this.layers?.forEach(layer => layer.options.featureTypes.forEach(ft => names.add(ft.name)));
        return [...names.values()];
    }

    async _updateRequestParams() {
        const featureNames = this.getFeatureTypes();
        const dsParams = await this.datasource.getRenderRequestArgs(featureNames);
        this.getSource().setRequestParams({
            ...dsParams,
            world_name: this.map.worldId,
            layer_names: this.layers.map(layer => layer.options.name)
        });
        this.getSource().clear();
    }

    /**
     * Layers that include the given geometry field
     * @param {string} featureType
     * @param {string} geomFieldName
     * @returns {MywVectorSharedSourceLayer[]}
     * @private
     */
    _layersForGeom(featureType, geomFieldName) {
        if (!this._layersForGeomMap) this._layersForGeomMap = new Map();

        const key = featureType + '/' + geomFieldName;
        if (!this._layersForGeomMap[key]) {
            this._layersForGeomMap[key] = this.layers
                .map(layer => [
                    layer,
                    layer.options.featureTypes.find(
                        lfItem => lfItem.name == featureType && geomFieldName == lfItem.field_name
                    )
                ])
                .filter(pair => pair[1]);
        }
        return this._layersForGeomMap[key];
    }

    _scheduleExpireCache() {
        if (!this._cacheExpiryTimer && this._hasDynamicLayers) {
            this._cacheExpiryTimer = setTimeout(() => {
                trace(9, `VectorSharedSourceLayer: Expiring tile cache`);
                this.getSource().clear();
                this._cacheExpiryTimer = null;
            }, this._cacheExpiryTimeout);
        }
    }
}

export default MywSharedVectorSource;
