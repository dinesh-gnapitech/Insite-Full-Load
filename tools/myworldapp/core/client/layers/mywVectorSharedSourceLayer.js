// Copyright: IQGeo Limited 2010-2023
import StyleManager from 'myWorld/layers/styleManager';
import VectorSource from 'ol/source/Vector';
import { VectorImage as OlVectorLayer } from 'ol/layer';
import CanvasVectorImageLayerRenderer from 'ol/renderer/canvas/VectorImageLayer.js';
import CanvasVectorLayerRenderer from 'ol/renderer/canvas/VectorLayer.js';
import { FilterParser } from 'myWorld/base/filterParser';
import GeoJSON from 'ol/format/GeoJSON';
import { trace as mywTrace } from 'myWorld/base/trace';
import { getUserProjection } from 'ol/proj';

const trace = mywTrace('layer');

const parsedFilters = {};

export class MywVectorSharedSourceLayer extends OlVectorLayer {
    /**
     * @class Vector layer that obtains the features to render from a (sharedSource) MywSharedVectorSource.
     * When self is added to the map, the shared source is informed so the layer is included in subsequent requests.
     * The source will then call add() when it obtained features for this layer to render.
     * The shared source is used in order to reduce number of requests to the server since if the map/application generates tens of
     * concurrent requests, the browser will throttle them, causing the map to render slowly.
     * Compared to OpenLayers' vector tile layer (ol/layer/VectorTile) it uses a normal vector source and renderer as
     * the clipping of tiles would cause problems with text and symbol styling that use sizing in meters, potentially
     * covering more width than any sensible margins on vector tile generation.
     *
     * @param  {MyWorldDatasource}       datasource
     * @param {Object} options The layer definition to handle
     */
    constructor(datasource, options) {
        const { opacity, zIndex, zIndexPointOffset = 0 } = options;
        super({ source: new VectorSource(), opacity, zIndex });
        this.datasource = datasource;
        this.options = options;
        this._features = new Map();

        //Instantiate markersSource and Marker layer
        const pointZIndex = (zIndex || 0) + zIndexPointOffset; // Point markers rendered with an offset (if configured) so they are above polygons and lines
        this.markersLayer = new OlVectorLayer({ source: new VectorSource(), zIndex: pointZIndex }); //No map yet - add later (and add layer to map later)
        this.markersSource = this.markersLayer.getSource();
    }

    /**
     * Implementation of ILayer.onAdd
     * @param {ol/Map} map
     */
    onAdd(map) {
        this.map = map;
        this.sharedSource = this.datasource.getVectorSharedSource(map);
        this.styleManager = new StyleManager(map.getView());
        //Inform the shared source to include this layer in its requests
        this.sharedSource.addLayer(map, this);
        this.markersLayer.setMap(map);

        const featureProjection = getUserProjection();
        this._geojsonFormat = new GeoJSON({ featureProjection }); //used when processing feature modified events
    }

    onRemove(map) {
        if (!this.map) return;
        this.sharedSource.removeLayer(map, this);
        this.markersLayer.setMap(null);
    }

    redraw() {
        trace(7, `MywVectorSharedSourceLayer '${this.options.name}': redraw`);
        this.markersSource.clear();
        this.getSource().clear();
        this._features.clear();
        this.sharedSource.refresh();
        this.changed();
    }

    /**
     * Feature on layer has been modified. Update the actual feature rather than redrawing the whole layer
     * Note however that in some cases if the closing of the editor after the update results in
     * a map view resize then an update of the layer will occur regardless.
     *
     */
    featureModified(changeType, feature) {
        if (this.options.schema === 'delta') return; //Forward view layers - assumes features of this layer are never updated

        const geomFields = feature.getGeometryFieldNamesInWorld(this.map?.worldId ?? 'geo');
        for (let geomFieldName of geomFields) {
            const key = feature.getUrn() + '_' + geomFieldName;
            const isPoint = ['Point', 'MultiPoint'].includes(feature.getGeometryType());
            const source = isPoint ? this.markersSource : this.getSource();

            const existingOlFeature = this._features.get(key);
            if (existingOlFeature) source.removeFeature(existingOlFeature);

            if (changeType == 'delete') return; //nothing else to do

            //insert or update - add representation checking if it should be displayed (filters, zoom, etc)
            const lfItem = this.getFeatureItemFor(feature.getType(), geomFieldName);

            const geometry = feature.getGeometry(geomFieldName);
            const geojsonFeature = {
                type: 'Feature',
                geometry,
                properties: feature.getProperties()
            };
            const olFeature = this._geojsonFormat.readFeature(geojsonFeature);

            this.add(olFeature, lfItem, feature);
        }
    }

    /**
     * called by MywSharedVectorSource when results are received from server
     * @param {ol/Feature} olFeature
     * @param {LayerFeatureItem} lfItem
     * @param {MywFeature} mywFeature
     * @protected
     */
    add(olFeature, lfItem, mywFeature) {
        const geomFieldName = lfItem.field_name;
        const key = mywFeature.getUrn() + '_' + geomFieldName;
        const existingFeature = this._features.get(key);
        const isPoint = ['Point', 'MultiPoint'].includes(olFeature.getGeometry().getType());
        const source = isPoint ? this.markersSource : this.getSource();

        if (existingFeature) {
            //ENH: if in same batch of requests and it's just a repeat geom from an adjacent tile, ignore instead of removing and adding
            source.removeFeature(existingFeature);
        }
        //feature not in layer yet
        const shouldDisplay = this.shouldDisplayFeature(mywFeature, lfItem);
        if (!shouldDisplay) return;
        source.addFeature(olFeature);
        this._features.set(key, olFeature);

        const olStyle = this.getStyleFor(mywFeature, lfItem);
        olFeature.setStyle(olStyle);

        if (mywFeature.featureDD.hasRenderCalculatedFields) {
            //if feature uses calculated fields in rendering we need to make properties available in the OL feature
            olFeature.setProperties(mywFeature.getProperties());
        }
        olFeature._mywFeature = mywFeature; //to be able to execute methods on the feature, when labels are configured to be methods. ENH: store values in properties instead?
    }

    /**
     * Determine if the feature should be displayed, based on the visibilty fields from featureItem
     * @param  {DDFeature} feature
     * @param  {LayerFeatureItem} featureItem
     */
    shouldDisplayFeature(feature, featureItem) {
        if (!featureItem) return true; //no restrictions

        //  Check if there is a filter applied to this feature, and if there is, check that it actually passes before adding a rep
        const filterName = featureItem.filter;
        if (filterName) {
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
        return true;
    }

    /**
     * Obtains the style apropriate for a given feature depending on the geometry type
     * @param {DDFeature} feature
     * @param {LayerFeatureItem} lfItem
     * @return {ol/style}  Styles for normal and highlight states
     */
    getStyleFor(feature, lfItem) {
        // Decode the style string from database into a structure
        const geomFieldName = lfItem.field_name;
        const { normal: style } = this.styleManager.getStyleFor(
            feature,
            lfItem,
            geomFieldName,
            this
        );
        const olStyle =
            typeof style?.olStyle == 'function'
                ? style.olStyle(this.map.getView()) //style is a myw style
                : style; // style should be an OL style

        const { min_vis = false, max_vis = false } = lfItem;
        const zoomRestrictedOlStyle =
            min_vis === false && max_vis === false
                ? olStyle
                : (feature, resolution) => {
                      const zoomLevel = this.map.getView().getZoomForResolution(resolution);
                      if (
                          (min_vis !== false && zoomLevel < min_vis) ||
                          (max_vis !== false && zoomLevel > max_vis)
                      )
                          return undefined; //out of zoom range
                      return typeof olStyle == 'function' ? olStyle(feature, resolution) : olStyle;
                  };
        return zoomRestrictedOlStyle;
    }

    getFeatureItemFor(featureType, geomFieldName) {
        for (const lfItem of this.options.featureTypes) {
            if (lfItem.name == featureType && geomFieldName == lfItem.field_name) return lfItem;
        }
    }

    createRenderer() {
        return this.options.useImageCanvas !== false
            ? new CanvasVectorImageLayerRenderer(this)
            : new CanvasVectorLayerRenderer(this);
    }

    //overriden to propagate to markers/points layers
    setZIndex(zIndex = 0) {
        super.setZIndex(zIndex);
        this.markersLayer.setZIndex(zIndex + (this.options.zIndexPointOffset || 0));
    }
}

export default MywVectorSharedSourceLayer;
