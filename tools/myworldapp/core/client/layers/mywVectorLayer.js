// Copyright: IQGeo Limited 2010-2023
import { isEqual } from 'underscore';
import myw from 'myWorld/base/core';
import StyleManager from 'myWorld/layers/styleManager';
import { VectorImage as OlVectorLayer } from 'ol/layer';
import CanvasVectorImageLayerRenderer from 'ol/renderer/canvas/VectorImageLayer.js';
import CanvasVectorLayerRenderer from 'ol/renderer/canvas/VectorLayer.js';
import MywVectorSource from './mywVectorSource';
import Collection from 'ol/Collection';
import MywVectorLayerLoader from './mywVectorLayerLoader';
import FeatureRepresentation from 'myWorld/features/featureRepresentation';
import GeoJSONVectorLayer from '../layers/geoJSONVectorLayer';
import { FilterParser } from 'myWorld/base/filterParser';
import { trace as mywTrace } from 'myWorld/base/trace';

const { Util } = myw;
const trace = mywTrace('layer');

const parsedFilters = {};

/**
 * Layer that renders features in the myWorld database using vectors.  <br/>
 * Features for this table  will be drawn on the map via OpenLayer's vector layers <br/>
 * Creates a new GeoJSON vector layer to which Point features are added. That layer has zIndex
 * of 1 to ensure Point features are always rendered on top.
 */
export class MywVectorLayer extends OlVectorLayer {
    /**
     * @param  {MyWorldDatasource}       datasource
     * @param  {vectorLayerOptions} options
     * @constructs
     */
    constructor(datasource, options) {
        //setup OL vector source
        const features = new Collection();
        const loader = (extent, resolution, projection) => {
            this._featureLoaderThrottled();
        };
        const source = new MywVectorSource({ features, loader });
        const { opacity, zIndex, zIndexPointOffset = 0 } = options;
        super({ source, opacity, zIndex }); //, declutter: options.declutter || true });

        //store options considering defaults
        this.options = {
            isStatic: false,
            maxGCSize: 500, // Maximum number of features to remove in one GC call.
            stableRotationDelay: 3000,
            rotationThreshold: Math.PI / 5, //36 degrees
            ...options
        };

        this.features = features;
        this.vectorSource = source;

        //Instantiate markersSource and Marker layer
        const pointZIndex = (zIndex || 0) + zIndexPointOffset; // Point markers rendered with an offset (if configured) so they are above polygons and lines
        this.markersLayer = new GeoJSONVectorLayer({ zIndex: pointZIndex }); //No map yet - add later (and add layer to map later)
        this.markersSource = this.markersLayer.getSource();
        //ENH: Create a third layer to seperate polygons/LineString to ensure they are all rendered in the correct order too.

        const featureTypes = this.getFeatureTypes();
        this._loader = new MywVectorLayerLoader({
            source,
            datasource,
            featureTypes,
            name: options.name,
            worldName: options.worldName,
            handleResultsCallback: this.handleLayerFeaturesResults.bind(this),
            updateFetchLimit: options.updateFetchLimit,
            schema: options.schema
        });

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

    //loads self's features for the current map but throttling updates derived from small map rotation changes
    _featureLoaderThrottled() {
        //if no change in rotation, something else changed, proceed with normal load
        if (!this.isVisible) return;

        if (this._redrawOnNextUpdate) {
            this._redrawOnNextUpdate = false;
            return this.update(true);
        }

        const zoomLevel = this.map.getZoom();
        const rotation = this.map.getRotation();
        const centerChanged = !isEqual(this.map.getCenter(), this._lastUpdateCenter);
        const zoomChanged = zoomLevel !== this._lastUpdateZoomLevel;
        if (centerChanged || zoomChanged) {
            trace(5, `Updating due to ${JSON.stringify({ centerChanged, zoomChanged })}`);
            this._performLoad(rotation);
            return;
        }

        // Change in rotation - only update using the following rules:
        //  - if the rotation difference to the previous' update rotation is greater than a certain threshold
        //  - if the rotation change is small but stabilizes
        const rotationDiff = Util.angleDistance(this._lastUpdateRotation, rotation, 2 * Math.PI);
        const rotationOutOfThreshold = rotationDiff > this.options.rotationThreshold;
        if (rotationOutOfThreshold) {
            trace(7, `rotation change: ${rotationDiff}, ${rotation}, ${this._lastUpdateRotation}`);
            this._performLoad(rotation);
        } else if (rotationDiff) {
            //small rotation change
            trace(10, `small rotation change`, JSON.stringify({ rotation, rotationDiff }));
            clearTimeout(this._stableRotationTimeoutID);
            this._stableRotationTimeoutID = setTimeout(() => {
                trace(6, `rotation stabilised`);
                this._stableRotationTimeoutID = null;
                this._performLoad(rotation);
            }, this.options.stableRotationDelay);
        }
    }

    //loads self's features for the current map storing the updates map rotation
    _performLoad(rotation) {
        if (this._stableRotationTimeoutID) clearTimeout(this._stableRotationTimeoutID);
        this._lastUpdateRotation = rotation;
        this._lastUpdateCenter = this.map.getCenter();
        this._lastUpdateZoomLevel = this.map.getZoom();
        this.updateNoRedraw();
    }

    //overriden to propagate to markers/points layers
    setZIndex(zIndex = 0) {
        super.setZIndex(zIndex);
        this.markersLayer.setZIndex(zIndex + (this.options.zIndexPointOffset || 0));
    }

    /**
     * Returns the feature type for this layer.
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
        this._loader.setMap(map);
        this.markersLayer.setMap(map);

        this.styleManager = new StyleManager(this.map.getView());

        for (const featureReps of Object.values(this.featureRepresentations)) {
            featureReps.forEach(featureRep => {
                featureRep.addToMap(this.map);
            });
        }
    }

    /**
     * Implementation of ILayer.onRemove
     * @param  {ol/Map} map
     */
    onRemove(map) {
        this._loader.setMap(null);
        this.markersLayer.setMap(null);

        for (const featureReps of Object.values(this.featureRepresentations)) {
            featureReps.forEach(featureRep => {
                featureRep.removeFromMap();
            });
        }
        this._isOnMap = false;
        this._redrawOnNextUpdate = true; //ensure the layer redraws if visible again, in case session, (e.g. delta) changed
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
     * Updates the layer from the database and refreshes the representations.
     * Called by layerManager.handleFeatureCollChanges()
     */
    redraw() {
        this.update(true);
    }

    updateNoRedraw() {
        trace(7, `updateNoRedraw()`);
        //check if there are representations that should be removed or added based on
        //new zoom level.
        //ENH: only check if zoom level changed
        Object.values(this.featureRepresentations).forEach(featureReps => {
            featureReps.forEach(featureRep => {
                if (this.shouldDisplayFeature(featureRep.feature, featureRep.geometryFieldName)) {
                    if (!featureRep.map) featureRep.addToMap(this.map);
                } else {
                    featureRep.removeFromMap();
                }
            });
        });

        if (this.options.isStatic) {
            //layer is static so we won't be fetching from bounds we already have,
            //but if zoom level changed, there may be more feature types to fetch
            const featureTypesInZoomRange = this._featuresTypesInNewZoomRange();
            if (featureTypesInZoomRange.length) {
                const namesNewFeatureTypes = featureTypesInZoomRange.map(ft => ft.name);
                const zoom = this.map.getZoom();
                trace(7, `(static) features from last bounds(${zoom}) for ${namesNewFeatureTypes}`);
                this._loader.getFeaturesFromLastBounds(namesNewFeatureTypes, zoom);
            }
        }

        this.update(false);
    }

    /**
     * Refresh the layer
     * Obtains from the database the features relevant for the current map view.
     * The callback to process the results is handleLayerFeaturesResults
     * @param  {boolean} [redraw=false] Whether the existing feature representations should be refreshed as well
     */
    async update(redraw = false) {
        if (!this.isVisible) return;
        const bounds = this.map.getBounds(this.map.getSize());
        //adding or removing a feature to the map triggers a loader call so we would get in a loop
        //check for redoing the same update
        const lastBounds = this._lastBounds;
        trace(10, `Same bounds?: ${lastBounds && bounds.equalsTo(lastBounds)}`);
        if (!redraw && lastBounds && bounds.equalsTo(lastBounds)) return;
        this._lastBounds = bounds;

        redraw = redraw || !this.options.isStatic;

        this.dispatchEvent('rendering-started');
        const updateId = await this._loader.update(redraw, bounds, this.map.getZoom());

        //for performance, remove from the map representations that are outside the 'pannable'
        //area around the map
        if (this._loader.currentUpdateId == updateId) {
            this.gcFeatureRep(bounds, updateId);

            if (redraw) {
                // we do know which items have been deleted.
                // As this is a redraw there will have been only one bounds
                this.removeDeletedFeatures(bounds, updateId);
            }
        }

        this.dispatchEvent('rendering-ended');
    }

    /**
     * Update feature representation for provided feature. Recalculate styles as these might depend
     * on feature attributes
     */
    updateRepsFor(feature, options = {}) {
        const { redraw = false, updateId = this._loader.currentUpdateId } = options;
        let featureReps = this.featureRepresentations[feature.getUrn()] ?? [];
        const geomFields = feature.getGeometryFieldNamesInWorld(this.options.worldName || 'geo');
        for (let fieldName of geomFields) {
            let rep = featureReps.find(rep => rep.geometryFieldName == fieldName);
            const shouldDisplay = this.shouldDisplayFeature(feature, fieldName);
            if (rep && redraw && shouldDisplay) {
                //update existing representation
                rep.styles = this.getStyleFor(feature, rep.geometryFieldName);
                rep.update(feature);
            } else if (rep && redraw && !shouldDisplay) {
                rep.removeFromMap();
                featureReps = featureReps.filter(item => item != rep);
            } else if (!rep && this.map && this.isVisible && shouldDisplay) {
                //no existing representation. create if appropriate
                rep = this.createRepForFeature(feature, fieldName);
                if (rep) {
                    rep.addToMap(this.map);
                    featureReps.push(rep);
                }
            }
            if (rep) rep.updateId = updateId;
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
    handleLayerFeaturesResults(redraw, features, currentUpdateId) {
        features.forEach(feature => {
            feature.layer = this; // associate the feature with its layer (this)
            this.updateRepsFor(feature, { redraw, updateId: currentUpdateId });
        });
    }

    /**
     * Remove feature representations that are not within map bounds plus a padding from the featureRepresentions list.
     * @param bounds Bounds of current map
     */
    gcFeatureRep(bounds, currentUpdateId) {
        const layerFeatureReps = this.featureRepresentations;
        trace(
            4,
            `Start gcFeatureRep layer='${this.options.name}' currentUpdateId=${currentUpdateId} ` +
                `#records=${Object.entries(layerFeatureReps).length}`
        );
        bounds = bounds.pad(0.2);
        const urns = Object.keys(layerFeatureReps);
        this._asyncGcFeatureRep(urns, bounds, currentUpdateId);
    }

    /*
     * Remove feature representations that are not within given bounds
     * Does it asynchronously in chunks to prevent holding up the UI
     * @param bounds Bounds of current map
     */
    async _asyncGcFeatureRep(urns, bounds, currentUpdateId, start = 0) {
        //wait a little bit as to not hold up UI
        await Util.delay(300);

        const layerFeatureReps = this.featureRepresentations;
        if (this._loader.currentUpdateId !== currentUpdateId) {
            return trace(
                8,
                `Cancelled rep GC on '${this.options.name}' due to new update id (${this._loader.currentUpdateId} vs ${currentUpdateId})`
            );
        }
        const upto = Math.min(start + this.options.maxGCSize, urns.length);
        let index;
        trace(
            8,
            `GC'ing '${this.options.name}' from ${start} to ${upto} (updateId: ${currentUpdateId})`
        );
        let collected = 0;
        for (index = start; index <= upto; index++) {
            const urn = urns[index];
            const individualFeatureReps = layerFeatureReps[urn];
            if (!individualFeatureReps) continue;

            let allRemoved = true;
            for (let featureRep of individualFeatureReps) {
                const remove = featureRep.map && !bounds.intersects(featureRep.getBounds());
                if (remove) featureRep.removeFromMap();
                else allRemoved = false;
            }
            if (allRemoved) {
                collected++;
                delete layerFeatureReps[urn];
            }
        }
        if (index < urns.length && index > this.options.maxGCSize) {
            //still more to GC (will do the delay as part of the call)
            return this._asyncGcFeatureRep(urns, bounds, currentUpdateId, index - 1);
        }
        //GC has been completed
        trace(
            4,
            `End gcFeatureRep layer='${this.options.name}' #records=${
                Object.entries(layerFeatureReps).length
            } collected=${collected}`
        );
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
     * @return {FeatureRepresentation[]}
     */
    createRepsForFeature(feature) {
        const featureReps = [];
        const fieldNames = feature.getGeometryFieldNamesInWorld(this.options.worldName || 'geo');
        fieldNames.forEach(fieldName => {
            const rep = this.createRepForFeature(feature, fieldName);
            if (rep) featureReps.push(rep);
        });
        return featureReps;
    }

    /**
     * Creates and returns a representation for a feature
     * @param  {DDFeature} feature [description]
     * @return {FeatureRepresentation}
     */
    createRepForFeature(feature, geomFieldName) {
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
            vectorSource: isPoint ? this.markersSource : this.vectorSource
        };

        return new FeatureRepresentation(feature, options);
    }

    /**
     * Removes from the map representations of deleted features <br/>
     * Should only called for 'redraw' requests (forced redraw or dynamic layer)
     * @param  {LatLngBounds} Bounds of the request to the database
     */
    removeDeletedFeatures(bounds, updateId) {
        // find features that weren't included in the last request's result but
        // have a representation intersecting the given bounds
        Object.entries(this.featureRepresentations).forEach(([urn, featureReps]) => {
            // interested only in the featureRep that has a primary geom field
            const featureRep = this._getPrimaryRepresentation(featureReps);
            const isOldRep = featureRep && (!featureRep.updateId || featureRep.updateId < updateId);
            if (isOldRep && bounds.intersects(featureRep.getBounds())) {
                //the feature wasn't in the last set of results even though the bounds intersect,
                //this means one of:
                // - the feature has been deleted - representation should be removed
                // - the geometry does not intersect with the given bounds (although its bounds do)
                //     - in this situation this feature can still exist but not have been sent with
                //      latest results because the geom doesn't strictly intersect the map bounds
                //      ideally, we wouldn't remove the representation (so a map pan would still be able show it).
                //      This would require an actual intersection to be calculated (instead of just the bounds)
                trace(3, `Removing representation of deleted feature (${urn})`);
                this.deleteReps(urn, featureReps);
            }
        });
    }

    /**
     * Determine if the feature should be displayed, based on the visibilty fields from featureItem
     * @param  {DDFeature} feature
     * @param  {String} fieldName
     */
    shouldDisplayFeature(feature, fieldName) {
        const featureItem = this.getFeatureItemFor(feature, fieldName);
        if (!featureItem) return true; //no restrictions

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

    /**
     * Get feature types which should be visibile at current zoom.
     * @return {Array}
     * @private
     */
    _featuresTypesInNewZoomRange() {
        const currentZoom = this.map.getZoom();
        let featureTypesToRefresh = [];
        const lastZoom = this._loader.lastZoom;

        if (lastZoom && lastZoom != currentZoom) {
            //if the last zoom is out of range is the current zoom in range
            featureTypesToRefresh = this.options.featureTypes.filter(featureType => {
                if (featureType.min_vis || featureType.max_vis) {
                    if (featureType.min_vis && featureType.max_vis) {
                        const wasOutOfRange =
                            lastZoom < featureType.min_vis || lastZoom > featureType.max_vis;
                        const isInRange =
                            currentZoom >= featureType.min_vis &&
                            currentZoom <= featureType.max_vis;
                        return wasOutOfRange && isInRange;
                    }

                    if (featureType.min_vis)
                        return lastZoom < featureType.min_vis && currentZoom >= featureType.min_vis;
                    if (featureType.max_vis)
                        return lastZoom > featureType.max_vis && currentZoom <= featureType.max_vis;
                }
                return true;
            });
        }
        return featureTypesToRefresh;
    }
}

/**
 * Options for a Vector layer
 * @typedef vectorLayerOptions
 * @property  {string}          name                Name of the layer (for debugging)
 * @property  {Array<string>}   featureTypes        Feature types associated with the layer
 * @property  {boolean}         [isStatic=false]    Whether the layer is to be considered as static, <br/>
 *                                                  so performance optimizations can be used
 * @property  {boolean}         [useImageCanvas=true] If true, Polygons and lines are rendered to an image canvas. Provides better performance during panning and zooming but text on polygons will not be rotated
 * @property  {string}          [schema]            if 'delta' it will only obtain features modified in deltas (will exclude features from current delta)
 */

export default MywVectorLayer;
