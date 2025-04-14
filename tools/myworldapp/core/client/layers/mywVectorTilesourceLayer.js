// Copyright: IQGeo Limited 2010-2023
import { trace as mywTrace } from 'myWorld/base/trace';
import { argsAsURI } from 'myWorld/base/util';
import StyleManager from 'myWorld/layers/styleManager';
import { VectorImage as OlVectorLayer } from 'ol/layer';
import VectorSource from 'ol/source/Vector';
import CanvasVectorImageLayerRenderer from 'ol/renderer/canvas/VectorImageLayer.js';
import CanvasVectorLayerRenderer from 'ol/renderer/canvas/VectorLayer.js';
import MywVectorTileSource from './mywVectorTileSource';
import MywMVTFormat from './mywMVTFormat';
import MywGeoJSONFormat from './mywGeoJSONFormat';
import FeatureRepresentation from 'myWorld/features/featureRepresentation';
import { FilterParser } from 'myWorld/base/filterParser';
import { getTileGridFor } from './tileLayerUtils';

const trace = mywTrace('layer');
const parsedFilters = {};

/**
 * Layer that renders features in the myWorld database using vectors.  <br/>
 * Features for this table  will be drawn on the map via OpenLayer's vector layers <br/>
 * Creates a new GeoJSON vector layer to which Point features are added. That layer has zIndex
 * of 1 to ensure Point features are always rendered on top.
 * Problem with this class: several instances quickly multiply number of requests. e.g. 10 layers, 12 tiles -> 120 requests to render a map - browsers throttle this
 */
export class MywVectorTilesourceLayer extends OlVectorLayer {
    /**
     * @param  {MyWorldDatasource}       datasource
     * @param  {vectorLayerOptions} options
     * @constructs
     */
    constructor(datasource, options) {
        const {
            tileSize = 512,
            maxTileZoom = 17,
            attributions,
            tileLoadFunction,
            name,
            format: formatStr = 'mvt',
            ...layerOptions
        } = options;
        //setup OL vector source
        const format = format == 'geojson' ? new MywGeoJSONFormat() : new MywMVTFormat(datasource);

        const url = `${datasource.server.baseUrl}layer/${name}/tile/{z}/{x}/{y}.${formatStr}`;
        const tileGrid = getTileGridFor(maxTileZoom, tileSize);
        const source = new MywVectorTileSource({
            handleResultsCallback: features => this.handleLayerFeaturesResults(true, features),
            url,
            tileGrid,
            attributions,
            format,
            tileLoadFunction
        });
        const { opacity, zIndex, zIndexPointOffset = 0 } = options;
        super({ source, ...layerOptions, opacity, zIndex });

        //store options considering defaults
        this.options = {
            isStatic: false,
            maxGCSize: 500, // Maximum number of features to remove in one GC call.
            stableRotationDelay: 3000,
            rotationThreshold: Math.PI / 5, //36 degrees
            ...options
        };

        // this.features = features;

        //Instantiate markersSource and Marker layer
        const pointZIndex = (zIndex ?? 0) + zIndexPointOffset; // Point markers rendered with an offset (if configured) so they are above polygons and lines
        // this.markersLayer = new GeoJSONVectorLayer({ zIndex: pointZIndex }); //No map yet - add later (and add layer to map later)
        this.markersLayer = new OlVectorLayer({ source: new VectorSource(), pointZIndex }); //No map yet - add later (and add layer to map later)
        this.markersSource = this.markersLayer.getSource();
        this.linePolLayer = new OlVectorLayer({ source: new VectorSource(), zIndex }); //No map yet - add later (and add layer to map later)
        this.linePolSource = this.linePolLayer.getSource();
        //ENH: Create a third layer to seperate polygons/LineString to ensure they are all rendered in the correct order too.

        // Don't set event handlers. Test extensively if this is changed.
        this.eventHandlers = [];

        /** reference to the datasource object
         * @type {MyWorldDatasource} */
        this.datasource = datasource;

        /** holds the feature representations displayed on the map. Keyed on feature URN
         * @type {Object.<string, FeatureRepresentation[]>} */
        this.featureRepresentations = {};

        /** Style manager to use for this layer. Set when map is added to map
         * @type {StyleManager} */
        this.styleManager = undefined;

        /** Indicates that this layer is visible (ie associated to a map)
         * @type {Boolean} */
        this._isOnMap = false;

        this.lastZoom = null;

        this.initialized = this.datasource.getDDInfoFor(this.getFeatureTypes());
    }

    get isVisible() {
        if (!this._isOnMap) return false; //we need to check the zoom range as well, as the loader might get called before the layer is removed from the map, and we need to prevent out-of-range that could throw off the "static" optimizations

        const zoomLevel = this.map.getZoom();
        const inRange =
            (this.options.minZoom ?? 0) <= zoomLevel &&
            zoomLevel <= (this.options.maxZoom ?? Infinity);
        return inRange;
    }

    createRenderer() {
        return this.options.useImageCanvas
            ? new CanvasVectorImageLayerRenderer(this)
            : new CanvasVectorLayerRenderer(this);
    }

    //overriden to propagate to markers/points layers
    setZIndex(zIndex = 0) {
        super.setZIndex(zIndex); // this line is probably unnecessary
        this.linePolLayer.setZIndex(zIndex);
        this.markersLayer.setZIndex(zIndex + (this.options.zIndexPointOffset || 0));
    }

    /**
     * Returns the feature type names for this layer.
     * @return {string[]} Feature types to render on this layer
     */
    getFeatureTypes() {
        return this.options.featureTypes.map(ft => ft.name);
    }

    /**
     * Implementation of ILayer.onAdd.
     * Adds the feature representations to the map and refreshes self
     * @param {ol/Map} map
     */
    onAdd(map) {
        this.map = map;
        this.lastZoom = map.getZoom();
        this._isOnMap = true;
        this.markersLayer.setMap(map);
        this.linePolLayer.setMap(map);

        this.styleManager = new StyleManager(this.map.getView());

        for (const featureReps of Object.values(this.featureRepresentations)) {
            featureReps.forEach(featureRep => {
                featureRep.addToMap(this.map);
            });
        }
        this._updateUrl();
    }

    async _updateUrl() {
        const featureNames = this.getFeatureTypes();
        const args = await this.datasource.getRenderRequestArgs(featureNames);
        const url = this.options.url + '?' + argsAsURI(args);
        this.getSource().setUrl(url);
    }

    /**
     * Implementation of ILayer.onRemove
     * @param  {ol/Map} map
     */
    onRemove(map) {
        this.markersLayer.setMap(null);
        this.linePolLayer.setMap(null);

        for (const featureReps of Object.values(this.featureRepresentations)) {
            featureReps.forEach(featureRep => {
                featureRep.removeFromMap();
            });
        }
        this._isOnMap = false;
    }

    /**
     * Feature on layer has been modified. Update the actual feature rather than redrawing the whole layer
     * Note however that in some cases if the closing of the editor after the update results in
     * a map view resize then an update of the layer will occur regardless.
     *
     */
    featureModified(changeType, feature) {
        if (this.options.schema === 'delta') return; //Forward view layers - assumes features of this layer are never updated

        if (changeType == 'delete') {
            return this.deleteRepsFor(feature);
        }
        //insert or update - create or update the feature representations accordingly
        this.updateRepsFor(feature, { redraw: true });
    }

    /**
     * Update feature representation for provided feature. Recalculate styles as these might depend
     * on feature attributes
     */
    updateRepsFor(feature, options = {}) {
        const { redraw = false, olFeature } = options;
        let featureReps = this.featureRepresentations[feature.getUrn()] ?? [];
        const geomFields = feature.getGeometryFieldNamesInWorld(this.options.worldName || 'geo');
        for (let fieldName of geomFields) {
            let rep = featureReps.find(rep => rep.geometryFieldName == fieldName);
            const shouldDisplay = this.shouldDisplayFeature(feature, fieldName);
            if (rep && redraw && shouldDisplay) {
                //update existing representation
                rep.styles = this.getStyleFor(feature, rep.geometryFieldName);
                rep.update(feature, olFeature);
            } else if (rep && redraw && !shouldDisplay) {
                rep.removeFromMap();
                featureReps = featureReps.filter(item => item != rep);
            } else if (!rep && this.map && this.isVisible && shouldDisplay) {
                //no existing representation. create if appropriate
                rep = this.createRepForFeature(feature, fieldName, olFeature);
                if (rep) {
                    rep.addToMap(this.map);
                    featureReps.push(rep);
                }
            }
            // if (rep) rep.updateId = updateId;
        }
        this.featureRepresentations[feature.getUrn()] = featureReps;
    }

    deleteRepsFor(feature) {
        const urn = feature.getUrn(),
            featureReps = this.featureRepresentations[urn];
        if (featureReps) this.deleteReps(urn, featureReps);
    }

    deleteReps(urn, featureReps) {
        featureReps.forEach(featureRep => {
            featureRep.removeFromMap();
        });
        delete this.featureRepresentations[urn];
    }

    /**
     * Processes a list of features obtained from the database,
     * creating feature representations on the map control if necessary
     * @param  {boolean} redraw Whether the existing feature representations should be refreshed as well
     * @param  {Array<DDFeature>} features Features obtained from the database
     */
    async handleLayerFeaturesResults(redraw, features, currentUpdateId) {
        await this.initialized;
        for (const feature of features) {
            if (!feature) continue;
            // eslint-disable-next-line no-unused-vars
            const { feature_type, geom_field, layer, ...properties } = feature.getProperties();
            trace(10, feature_type, geom_field, feature.ol_uid);
            let geometry = {
                type: feature.getGeometry().getType(),
                coordinates: feature.getGeometry().getCoordinates()
            };
            delete properties.geometry;
            const secondary_geometries = {};
            const featureDD = this.datasource.featuresDD[feature_type];
            if (!featureDD) {
                console.error(`Missing DD for '${feature_type}'`);
                continue;
            }
            const primaryGeomFieldName = featureDD.primary_geom_name;
            if (primaryGeomFieldName != geom_field) {
                secondary_geometries[geom_field] = geometry;
                geometry = undefined;
            }
            const geoJsonFeature = {
                properties,
                geometry,
                myw: { feature_type },
                secondary_geometries
            };
            const mywFeature = this.datasource._asFeature(geoJsonFeature, feature_type);
            mywFeature.layer = this; // associate the feature with its layer (this)
            this.updateRepsFor(mywFeature, {
                redraw,
                updateId: currentUpdateId,
                olFeature: feature
            });
        }
    }

    _getPrimaryRepresentation(featureReps) {
        return featureReps.find(
            featureRep =>
                featureRep.feature.getGeometryFieldNameInWorld(featureRep.worldName) ===
                featureRep.geometryFieldName
        );
    }

    /**
     * Creates and returns a representation for a feature
     * @param  {DDFeature} feature [description]
     * @return {FeatureRepresentation}
     */
    createRepForFeature(feature, geomFieldName, olFeature) {
        const styles = this.getStyleFor(feature, geomFieldName);
        if (!styles?.normal) return;
        const geom = feature.getGeometry(geomFieldName);
        if (!geom) return;

        const isPoint = ['Point', 'MultiPoint'].includes(geom.type);
        const options = {
            worldName: this.options.worldName,
            geomFieldName,
            styles,
            eventHandlers: this.eventHandlers,
            olFeature,
            vectorSource: isPoint ? this.markersSource : this.linePolSource
        };

        return new FeatureRepresentation(feature, options);
    }

    /**
     * Determine if the feature should be displayed, based on the visibilty fields from featureItem
     * @param  {DDFeature} feature
     * @param  {String} fieldName
     */
    shouldDisplayFeature(feature, fieldName) {
        const layerFeatureItem = this.getFeatureItemFor(feature, fieldName);
        if (!layerFeatureItem) return true; //no restrictions
        return this._shouldDisplayFeature(feature, layerFeatureItem);
    }

    _shouldDisplayFeature(feature, featureItem) {
        //  Check if there is a filter applied to this feature, and if there is, check that it actually passes before adding a rep
        const filterName = featureItem.filter;
        if (filterName && feature._loadedAspects.display_values) {
            const filterKey = `${featureItem.name}.${filterName}`;
            if (!parsedFilters[filterKey]) {
                const filters = this.datasource.featuresDD[featureItem.name].filters;
                const filter = filters[filterName];
                const newParser = new FilterParser(filter).parse();
                parsedFilters[filterKey] = newParser;
            }
            const parser = parsedFilters[filterKey];
            const sessionVars = this.datasource.database.getSessionVars();
            const res = parser.matches(feature, sessionVars);
            if (!res) return false;
        }

        const hasMinVis = featureItem.min_vis || featureItem.min_vis === 0;
        const hasMaxVis = featureItem.max_vis || featureItem.max_vis === 0;

        if (!hasMinVis && !hasMaxVis) return true;

        const withinMinRange = this.map.getZoom() >= featureItem.min_vis;
        const withinMaxRange = this.map.getZoom() <= featureItem.max_vis;

        if (hasMinVis && hasMaxVis) return withinMinRange && withinMaxRange;
        if (hasMinVis) return withinMinRange;
        if (hasMaxVis) return withinMaxRange;

        return false;
    }

    getFeatureItemFor(featureType, geomFieldName) {
        return this.options.featureTypes.find(
            lfItem => lfItem.name == featureType && geomFieldName == lfItem.field_name
        );
    }

    /**
     * Obtains the style apropriate for a given feature depending on the geometry type
     * @param  {DDFeature} feature
     * @param {string} geomFieldName
     * @return {styleDefinition}  Styles for normal and highlight states
     */
    getStyleFor(feature, geomFieldName) {
        const lfItem = this.getFeatureItemFor(feature.type, geomFieldName);

        if (!lfItem) return undefined;

        // Decode the style string from database into a structure
        return this.styleManager.getStyleFor(feature, lfItem, geomFieldName, this);
    }
}

/**
 * Options for a Vector layer
 * @typedef vectorLayerOptions
 * @property  {string}          name                Name of the layer (for debugging)
 * @property  {boolean}         [isStatic=false]    Whether the layer is to be considered as static, <br/>
 *                                                  so performance optimizations can be used
 * @property  {Array<string>}   featureTypes        Feature types associated with the layer
 * @property  {string}          [schema]            if 'delta' it will only obtain features modified in deltas (will exclude features from current delta)
 */

export default MywVectorTilesourceLayer;
