// Copyright: IQGeo Limited 2010-2023
import { trace as mywTrace, VectorTileLayer } from 'myWorld-client';
import pako from 'pako';

const trace = mywTrace('vectorTile');

export class LocalVectorTileLayer extends VectorTileLayer {
    /**
     * Class that can fetch tiles from the myWorld tileServer Cordova plugin
     * @extends {VectorTileLayer}
     * @param {Object} options Options that are used to create the layer. Must include layer and server key values
     */
    constructor(options) {
        const { layerPath, server, format, url, compressed = true, ...layerOptions } = options;

        async function tileLoadFunction(tile, url) {
            tile.setLoader(async (extent, resolution, featureProjection) => {
                const [z, x, y] = tile.tileCoord;
                const fetchOptions = { layerPath, z, x, y };
                trace(9, `loading tile ${layerPath}/${z}/${x}/${y}`);
                //read tile from local tilestore
                let tileData;
                try {
                    tileData = await server.fetchRawTileFromTileServer(fetchOptions);
                } catch (error) {
                    trace(5, `Error fetching tile ${layerPath}/${z}/${x}/${y}: ${error.message}`);
                }
                if (!tileData) {
                    trace(8, `no vector tile for ${layerPath}/${z}/${x}/${y}`);
                    tile.setFeatures([]);
                    return;
                }

                //unzip tiles if necessary
                if (compressed) tileData = pako.inflate(tileData);

                //read features from tile
                const features = format.readFeatures(tileData, { extent, featureProjection });
                trace(7, `loaded tile ${layerPath}/${z}/${x}/${y} features: ${features.length}`);
                //and pass them to openlayers
                tile.setFeatures(features);
            });
        }

        super({ ...layerOptions, format, url, tileLoadFunction });
    }
}
