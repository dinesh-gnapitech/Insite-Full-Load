import myw from 'myWorld/base/core';
import { MywClass } from 'myWorld/base/class';
import { trace as mywTrace } from 'myWorld/base/trace';
import GeoJSONVectorLayer from './geoJSONVectorLayer';
import { Style, Fill, Stroke } from 'ol/style';

const trace = mywTrace('layer');

export class MywVectorLayerLoader extends MywClass {
    static {
        this.mergeOptions({
            updateFetchLimit: 500
        });
    }

    /*
     * @class  Class to perform queries to fetch data for layer refresh. This implementation invokes the
     * render request for each feature in the layer.
     * @param  {MyWorldDatasource} options.datasource [description]
     * @constructs
     */
    constructor(options) {
        super();
        this.setOptions(options);
        this.source = options.source;
        this.datasource = options.datasource;

        /* holds ID of currently active update chain. Any update chain with ID of less
         * than this should be terminated.
         * @type {number}*/
        this.currentUpdateId = 0;

        /*
         * Time it took last query to run in milliseconds
         * @type {number}
         */
        this.lastQueryTime = 0;
    }

    /*
     * Initiate the queries to update the layer. Sends a request to the server
     * that returns the feature in the layer within the bounds of the map. Subsequent requests
     * with different offsets might be sent if the number returned is greater than the fetch limit.
     * For dynamic layers, we query the whole map view bounds. For static layers, we query only new areas
     * of the map that come into view (and so send a list of bounds). If the user zooms in then no request is
     * sent as all the required features are on the map.
     * @param  {boolean} redraw Whether the existing feature representations should be refreshed and redrawn as well.
     *                          This will take into account style or position changes for a feature.
     */
    async update(redraw, bounds, zoom) {
        const tableNames = this.options.featureTypes.slice(0);
        const params = {
            bounds,
            offset: 0,
            limit: this.options.updateFetchLimit,
            layerName: this.options.name,
            zoom,
            schema: this.options.schema
        };

        let queryBounds = [bounds];
        if (!redraw && this.lastBounds) {
            queryBounds = bounds.subtract(this.lastBounds);
        }
        if (myw.isTracing('layer', 10)) this._debugDrawOnMap(queryBounds, 'red');

        if (queryBounds.length === 0) {
            //nothing to request from server
            if (myw.isTracing('layer', 10)) this._debugDrawOnMap([this.lastBounds], 'green');
            return;
        }

        if (this.options.worldName) params.world_name = this.options.worldName;

        const name = this.options.name;
        trace(3, `Layer update start '${name}' (updateId ${this.currentUpdateId + 1})`);
        this.source.loading = true;

        try {
            // We need to do this here as timing issues may mean that DD information is not available when we need it
            // to get styles.
            this.currentUpdateId += 1;
            const updateId = this.currentUpdateId;
            params.bounds = queryBounds;
            params.mapBounds = bounds;
            params.requiredFields = await this._getRequiredFields(tableNames);
            // Determine the features that will be displayed given the current map bounds.
            const features = await this.datasource.getLayerFeatures(params);
            const responseId = await this.handleLayerFeaturesResultsChain(
                redraw,
                params,
                updateId,
                features
            );

            if (this.currentUpdateId === responseId) {
                trace(3, `Layer update end '${this.options.name}'`);
                this.source.loading = false;
            }
            return responseId;
        } catch (e) {
            console.log(
                `Error rendering layer ${this.options.name}: ${e.name} ${e.message} ${e.stack}`
            );
        }
    }

    /**
     * Get the fields required when requesting layer feature data
     * @param {string[]} featureNames  Names of feature types included in request.
     */
    _getRequiredFields(featureNames) {
        return this.datasource.getRequiredFieldsToRender(featureNames);
    }

    async getFeaturesFromLastBounds(featureTypes, zoom) {
        if (!this.lastBounds) return;
        const params = {
            bounds: this.lastBounds,
            offset: 0,
            limit: this.options.updateFetchLimit,
            layerName: this.options.name,
            zoom,
            featureTypes: featureTypes || [],
            requiredFields: await this._getRequiredFields(featureTypes)
        };

        if (this.options.worldName) params.world_name = this.options.worldName;

        this.datasource.getLayerFeatures(params).then(data => {
            this.handleLayerFeaturesResultsChain(true, params, this.currentUpdateId, data);
        });
    }

    /**
     * Set map for debug bound rendering purposes
     * @param {Map} map
     */
    setMap(map) {
        if (!map && this._debugLayer) this._map.removeLayer(this._debugLayer);
        if (map && this._debugLayer) map.addLayer(this._debugLayer);
        this._map = map;
    }

    _debugDrawOnMap(queryBounds, color) {
        if (!this._debugging) {
            const stroke = new Stroke({ width: 2 });
            const fill = new Fill({});
            const style = new Style({ stroke, fill, opacity: 0.5 });
            this._debugLayer = new GeoJSONVectorLayer({
                style: feature => {
                    style.getFill().setColor(feature.get('color'));
                    return style;
                },
                opacity: 0.5,
                map: this._map
            });
            this._debugging = true;
        }

        this._debugLayer.clear();
        // For debugging - draw the damage areas

        queryBounds.forEach(bound => {
            this._debugLayer.addGeoJSON({
                type: 'Feature',
                properties: { color },
                geometry: { type: 'Polygon', coordinates: [bound.asGeometry()] }
            });
        });
    }

    /*
     * Processes a list of features obtained from the database. Initiate
     * another query if there are further results to fetch.
     * @param  {boolean}    redraw          Whether the existing feature representations should be refreshed as well
     * @param  {string[]}   tableNames      List of remaining features types to fetch
     * @param  {object}     params          Parameters of the update
     * @param  {number}   updateId        ID of this update chain
     * @param  {Array<DDFeature>} features   Features obtained from the database
     */
    handleLayerFeaturesResultsChain(redraw, params, updateId, data) {
        // If no other update chain has been started, process the results and do another query
        if (this.currentUpdateId == updateId) {
            if (data.offset) {
                const newParams = { ...params, offset: data.offset };
                //initiate next request before passing results to layer (for feature rep updates)
                const nextRequestPromise = this.datasource
                    .getLayerFeatures(newParams)
                    .then(
                        this.handleLayerFeaturesResultsChain.bind(this, redraw, newParams, updateId)
                    );
                //pass features to layer so it can update the feature representations
                this.options.handleResultsCallback(redraw, data.features, updateId);
                return nextRequestPromise;
            } else {
                // We have completed the chain
                this.options.handleResultsCallback(redraw, data.features, updateId);

                if (params.mapBounds) {
                    //requests from getFeaturesFromLastBounds() won't include a mapBounds
                    trace(8, `setting lastBounds to ${JSON.stringify(params.mapBounds)}`);
                    this.lastBounds = params.mapBounds;
                    this.lastZoom = params.zoom;
                }
                this.lastQueryTime = new Date() - this.startTime;

                trace(3, `Layer update end cleanly '${this.options.name}' updateId=${updateId}`);
            }
        } else {
            trace(
                3,
                `Layer update end aborted '${this.options.name}' updateId=${updateId} currentUpdateId=${this.currentUpdateId}`
            );
        }

        return Promise.resolve(updateId);
    }
}

export default MywVectorLayerLoader;
