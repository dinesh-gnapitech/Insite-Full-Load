import { isEqual } from 'underscore';
import VectorTileSource from 'ol/source/VectorTile';
import { trace as mywTrace } from 'myWorld/base/trace';
import { get as getProjection, fromUserResolution, fromUserExtent } from 'ol/proj.js';

const trace = mywTrace('layer');

const wgs84projection = getProjection('EPSG:4326');

/**
 * Vector Tile Source which combines requests of several layers
 * Uses app server's POST render_features entrypoint which supports multiple layers
 * Layers and other shared parameters (such as delta and session variables) are set using setRequestParams()
 */
export class MywVectorTileCombinedSource extends VectorTileSource {
    /**
     * @param {object} See {ol/source/Vector}
     * @extends {ol/source/Vector}
     */
    constructor(options = {}) {
        const { layerNames = [] } = options;
        const tileLoadFunction = (tile, url) => {
            const [z, x, y] = tile.tileCoord;
            const args = {
                ...this._params,
                zoom: z,
                tile: [x, y]
            };
            tile.setLoader(
                /**
                 * @param {Extent} extent Extent.
                 * @param {number} resolution Resolution.
                 * @param {Projection} projection Projection.
                 */
                function (extent, resolution, projection) {
                    if (!args.layer_names.length) return;
                    trace(8, `MywVectorTileCombinedSource: requesting tile ${tile.tileCoord}`);
                    loadFeaturesFetch(
                        url,
                        JSON.stringify(args),
                        tile.getFormat(),
                        extent,
                        resolution,
                        wgs84projection,
                        tile.onLoad.bind(tile),
                        tile.onError.bind(tile)
                    );
                }
            );
        };
        const { handleResultsCallback, ...superOptions } = options;
        super({ ...superOptions, tileLoadFunction });
        this.handleResultsCallback = handleResultsCallback;
        this._params = { layer_names: layerNames };
        this._updateCount = 0;
    }

    setRequestParams(params) {
        if (isEqual(params, this._params)) return;
        this._params = params;
        this.clear();
        this.changed();
    }

    /**
     * Overridden as the loaded extents concept doesn't work with our services
     * (it may be necessary to issue a new request to get more feature types - visible at different zoom levels)
     * @param {ol/Extent} extent Extent.
     * @param {number} userResolution Resolution.
     * @param {ProjectionLike} userProjection Projection.
     */
    loadFeatures(userExtent, userResolution, userProjection) {
        trace(10, `MywVectorTileCombinedSource: loadFeatures ${userExtent}`);
        const proj3857 = getProjection('EPSG:3857');
        // transform to web mercator projection before creating the tile requests
        const resolution = fromUserResolution(userResolution, proj3857);
        const extent = fromUserExtent(userExtent, proj3857);

        const updateId = ++this._updateCount;

        const tileGrid = this.getTileGridForProjection(proj3857);
        const z = tileGrid.getZForResolution(resolution, this.zDirection);
        // const tileResolution = tileGrid.getResolution(z);
        const tileRange = tileGrid.getTileRangeForExtentAndZ(extent, z);

        for (let x = tileRange.minX; x <= tileRange.maxX; ++x) {
            for (let y = tileRange.minY; y <= tileRange.maxY; ++y) {
                //ENH: include the following code
                //   if (
                //     rotation &&
                //     !tileGrid.tileCoordIntersectsViewport([z, x, y], viewport)
                //   ) {
                //     continue;
                //   }
                const pixelRatio = 1;
                let tile = this.getTile(z, x, y, pixelRatio, proj3857);

                this.getSourceTiles(pixelRatio, userProjection, tile).forEach(sourceTile => {
                    sourceTile.setFeatures = features => {
                        sourceTile.constructor.prototype.setFeatures.apply(sourceTile, features);

                        //don't process responses from old requests, otherwise we could, for example, be adding features from a delta that is not active anymore
                        if (updateId !== this._updateCount) return;

                        features.forEach(feature =>
                            feature.getGeometry().transform(proj3857, userProjection)
                        );

                        this.handleResultsCallback(features);
                    };
                });
            }
        }
    }
}

async function loadFeaturesFetch(
    url,
    body,
    format,
    extent,
    resolution,
    featureProjection,
    success,
    failure
) {
    try {
        let res = await fetch(
            typeof url === 'function' ? url(extent, resolution, featureProjection) : url,
            {
                method: 'POST',
                body
            }
        );
        // status will be 0 for file:// urls
        if (!res.status || (res.status >= 200 && res.status < 300)) {
            const type = format.getType();
            /** @type {Document|Node|Object|string|undefined} */
            let source;
            if (type == 'json' || type == 'text') {
                source = await res.text();
            } else if (type == 'xml') {
                source = new DOMParser().parseFromString(await res.text(), 'application/xml');
            } else if (type == 'arraybuffer') {
                source = await res.arrayBuffer();
            }
            if (source) {
                success(
                    /** @type {Array<OlFeature>} */
                    (
                        format.readFeatures(source, {
                            extent,
                            featureProjection
                        })
                    ),
                    format.readProjection(source)
                );
            } else {
                failure();
            }
        } else {
            failure();
        }
    } catch (error) {
        failure();
    }
}

export default MywVectorTileCombinedSource;
