// Copyright: IQGeo Limited 2010-2023
import { trace, TileLayer as MywTileLayer } from 'myWorld-client';
import Tile from 'ol/Tile';
import TileSource from 'ol/source/Tile';
import TileState from 'ol/TileState';
import { getKeyZXY } from 'ol/tilecoord';

const TRANSPARENT_1x1_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export class LocalTileLayer extends MywTileLayer {
    /**
     * Class that can fetch tiles from the myWorld tileServer Cordova plugin
     * @param {Object} options Options that are used to create the layer. Must include layer and server key values
     */
    constructor(options) {
        const layerOptions = {
            ...options,
            source: new LocalTileSource(options)
        };
        super(layerOptions);
    }
}

export class LocalTileSource extends TileSource {
    /**
     * Class that acts as the source for fetching LocalTile objects
     * @param {String} options.layerPath The path to fetch tiles from
     * @param {Object} options.server The server object to use to fetch tiles from
     */
    constructor(options) {
        const { maxNativeZoom, tileSize = 256, server, layerPath } = options;
        const tileSourceOptions = {
            //assertion in TileSource.getTileCacheForProjection requires a projection to be given. (Assertion is different in TileImage and from comment looks like it is a bug and assertion should only be done in a vector subclass)
            projection: options.projection || 'EPSG:3857'
        };
        if (maxNativeZoom)
            tileSourceOptions.tileGrid = MywTileLayer.getTileGridFor(maxNativeZoom, tileSize);
        super(tileSourceOptions);

        this._layerPath = layerPath;
        this._server = server;
    }

    /**
     * Fetches the tile from either the source cache or the server object
     * @override TileSource
     * @param {Integer} z The z coordinate of the tile to fetch
     * @param {Integer} x The x coordinate of the tile to fetch
     * @param {Integer} y The y coordinate of the tile to fetch
     * @returns {LocalTile}
     */
    getTile(z, x, y) {
        const tileCoordKey = getKeyZXY(z, x, y);
        if (this.tileCache.containsKey(tileCoordKey)) {
            return this.tileCache.get(tileCoordKey);
        } else {
            const tileCoord = [z, x, y];
            const tile = new LocalTile(tileCoord, this._layerPath, this._server);
            this.tileCache.set(tileCoordKey, tile);
            return tile;
        }
    }
}

export class LocalTile extends Tile {
    /**
     * A tile object that fetches tile Base64 image data from the TileServer Cordova plugin
     * @param {Array<Integer>} tileCoord The coordinates of the tile to fetch, format [z, x, y]
     * @param {String} layerPath The path to fetch tiles from
     * @param {Object} server The server object to use to fetch tiles from
     */
    constructor(tileCoord, layerPath, server) {
        super(tileCoord, TileState.IDLE);
        this._image = null;
        this._layerPath = layerPath;
        this._server = server;
    }

    /**
     * Fetches Base64 tile data from the TileServer cordova plugin if tile is in an idle state
     * @returns {Promise} A promise that resolves when tile loading either succeeds or fails
     */
    async load() {
        if (this.getState() === TileState.IDLE) {
            const options = {
                layerPath: this._layerPath,
                z: this.tileCoord[0],
                x: this.tileCoord[1],
                y: this.tileCoord[2]
            };

            trace('tiles', 10, `Loading tile:`, ...this.tileCoord);
            this.setState(TileState.LOADING);
            try {
                let base64Tile = await this._server.fetchTileFromTileServer(options);
                const size = base64Tile?.length;
                trace('tiles', 9, `tile `, ...this.tileCoord, `, size ${size} is being added`);

                if (!base64Tile) base64Tile = TRANSPARENT_1x1_PNG; //although 1x1 it will cover the whole tile area
                this._tileOnCordovaFetch(base64Tile);
            } catch (error) {
                this._tileOnError(error);
            }
        }
    }

    /**
     * Returns the created image object
     * @returns {Image|null}
     */
    getImage() {
        return this._image;
    }

    /**
     * Callback for when tile data is successfully fetched from the TileServer Cordova plugin.
     * Creates an img object, establishes callbacks and sets the src to the passed in value
     * @param {String} base64Tile The Base64 data of the tile
     */
    _tileOnCordovaFetch(base64Tile) {
        this._image = document.createElement('img');
        this._image.addEventListener('load', this._tileOnLoadSuccess.bind(this));
        this._image.addEventListener('error', this._tileOnError.bind(this));
        this._image.src = base64Tile;
    }

    /**
     * Callback for when the image object's src is successfully set
     */
    _tileOnLoadSuccess() {
        this.setState(TileState.LOADED);
    }

    /**
     * Callback for when either loading from the TileServer Cordova plugin or setting the img src fails
     * @param {Object} error Details about the error that is returned
     */
    _tileOnError(error) {
        this.setState(TileState.ERROR);
    }
}
