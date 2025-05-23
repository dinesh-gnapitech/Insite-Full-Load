import TileImageSource from 'ol/source/TileImage';
import TileState from 'ol/TileState';
import ImageTile from 'ol/Tile';
import { getKeyZXY } from 'ol/tilecoord';
import { createCanvasContext2D } from 'ol/dom';
import EventType from 'ol/events/EventType';
import { toLonLat } from 'ol/proj';
import { getUserProjection } from 'ol/proj';
/* globals google */

/*
 * @type {Array<HTMLCanvasElement>}
 */
const canvasPool = [];

//  Google maps has issues when it comes to cloning the map, so setup the img cache here to be shared between all of them
const _imgCache = {};

/**
 * Source for Google base layers
 * Creates a google maps map and then uses mutation observers to move tiles elements
 * so it behaves as a standard OpenLayers tile layer
 */
export class GoogleSource extends TileImageSource {
    /**
     * @param {string} type one of SATELLITE, ROADMAP, HYBRID, TERRAIN
     * @param {GeoMapControl} map Either the OpenLayers map, or undefined if its a minimap
     * @param {*} options
     */
    constructor(type, map, options = {}) {
        const { isTouchDevice, googleMapOptions, ...sourceOptions } = options;
        const tileImageSourceOptions = {
            state: 'loading',
            tileClass: GoogleTile,
            ...sourceOptions
        };
        super(tileImageSourceOptions);
        this.setProperties(
            {
                maxNativeZoom: 21,
                type,
                styles: [],
                updateWhenIdle:
                    typeof orientation !== 'undefined' ||
                    navigator.userAgent.toLowerCase().includes('mobile') //  Detects if we are using a mobile device
            },
            true
        );
        this._map = map;
        this._isMinimap = !map; //ENH: Could do with a better way to determine if this is going to be a minimap or not
        this._isTouchDevice = isTouchDevice;
        this._googleMapOptions = googleMapOptions;

        this._onMutatedImage = this._onMutatedImage.bind(this);
        this._onMutations = this._onMutations.bind(this);
        this._onMapsMutations = this._onMapsMutations.bind(this);
        this._update = this._update.bind(this);
        this._resize = this._resize.bind(this);
        this._onMoveStart = this._onMoveStart.bind(this);
        this._onMoveEnd = this._onMoveEnd.bind(this);
        this._onViewChange = this._onViewChange.bind(this);
        this._flagRefresh = this._flagRefresh.bind(this);
        this.handleTileChange = this.handleTileChange.bind(this);
        this._onRotation = this._onRotation.bind(this);
        this._shiftPegmanForAttribution = this._shiftPegmanForAttribution.bind(this);

        this._ready = GoogleSource._googleMapsIsLoaded();
        this._refreshTimer = null;
        this._currentZoom = null;
        this._mapIsZooming = false;
        this._initMutantContainer();

        const newPromise = this._ready
            ? Promise.resolve(window.google)
            : new Promise(function (resolve, reject) {
                  let checkCounter = 0;
                  let intervalId = setInterval(function () {
                      if (checkCounter >= 10) {
                          clearInterval(intervalId);
                          return reject(new Error('window.google not found after 10 attempts'));
                      }
                      this._ready = GoogleSource._googleMapsIsLoaded();
                      if (this._ready) {
                          clearInterval(intervalId);
                          return resolve(window.google);
                      }
                      checkCounter++;
                  }, 500);
              });

        this._GAPIPromise = newPromise.then(google => {
            this._initMutant();
            this.setState('ready');
            return google;
        });

        // Couple data structures indexed by tile key
        this._tileCallbacks = {}; // Callbacks for promises for tiles that are expected
        this._freshTiles = {}; // Tiles from the mutant which haven't been requested yet

        this._imagesPerTile = this.get('type') === 'HYBRID' ? 2 : 1;
        this._view = null;

        //  String to change the crossOrigin value of images to, or null not to do so
        this._crossOrigin = null;
    }

    get crossOrigin() {
        return this._crossOrigin;
    }

    set crossOrigin(value) {
        this._crossOrigin = value;
        this.tileCache.clear();
        this._refreshCachedImages();
    }

    onAdd(map) {
        this._map = map;
        //  A recent optimization for google maps prevents the images from loading unless the map is inserted into the DOM
        //  So temporarily insert it here to force a load
        document.body.appendChild(this._gMapContainer);
        map.getTargetElement().appendChild(this._gMapContainer);
        this._gMapContainer.style.position = 'absolute';
        this._setGMapContainerSize(this._map.getSize());

        map.on('change:size', this._resize);
        map.on('change:view', this._onViewChange);
        map.on('movestart', this._onMoveStart);
        map.on('moveend', this._onMoveEnd);
        if (this.get('updateWhenIdle')) {
            map.on('moveend', this._update);
        }

        const view = this._map.getView();
        this._onViewChange(view);

        //20px instead of 1em to avoid a slight overlap with google's attribution
        this._enableBottomControlsOffset(true);

        //if developer only pops up - make it clickable
        const dismissButton = this._gMapContainer.getElementsByClassName('dismissButton')[0];
        if (dismissButton) dismissButton.style.pointerEvents = 'auto';

        if (this._subLayers) {
            //restore previously added google layers
            for (const subLayer of Object.values(this._subLayers)) {
                subLayer.setMap(this._gMap);
            }
        }

        this._attachObserver(this._gMapContainer);
        this._refreshCachedImages();
    }

    _refreshCachedImages() {
        //  Iterates through the image cache for this basemap type and treats them as if they had just loaded
        //  This is mainly used when we change the image's crossorigin value
        const type = this.get('type');
        const cache = _imgCache[type] || {};
        _imgCache[type] = {};
        for (let z in cache) {
            for (let x in cache[z]) {
                for (let y in cache[z][x]) {
                    for (let sublayer in cache[z][x][y]) {
                        this._onMutatedImage(cache[z][x][y][sublayer]);
                    }
                }
            }
        }
    }

    _onViewChange(view) {
        const updateWhenIdle = this.get('updateWhenIdle');
        //  Deregister callbacks on old view
        if (this._view) {
            if (!updateWhenIdle) {
                this._view.un('change:center', this._update);
                this._view.un('change:resolution', this._update);
            }
            this._view.un('change:rotation', this._onRotation);
        }

        this._view = this._map.getView();
        if (!updateWhenIdle) {
            this._view.on('change:center', this._update);
            this._view.on('change:resolution', this._update);
        }
        this._view.on('change:rotation', this._onRotation);

        //handle layer being added to a map for which there are no Google tiles at the given zoom
        this._checkZoomLevels();

        this._update();
    }

    onRemove(map) {
        this._observer.disconnect();
        map.getTargetElement().removeChild(this._gMapContainer);

        map.un('change:size', this._resize);
        map.un('movestart', this._onMoveStart);
        map.un('moveend', this._onMoveEnd);
        map.un('moveend', this._update);

        const view = this._map.getView();
        view.un('change:center', this._update);
        view.un('change:resolution', this._update);
        view.un('change:rotation', this._onRotation);

        this._enableBottomControlsOffset(false);
        this._toggleStreetViewControlDataAttribute(false);
        this._map = null;
    }

    getMutantContainer() {
        return this._gMapContainer;
    }

    getMutant() {
        return this._gMap;
    }

    //api to request pegman to be shown
    showPegman() {
        this._pegmanIsDesired = true;
        this._showPegman();
    }

    /**
     * Returns true if pegman is active (shown)
     * @returns {boolean}
     */
    isPegmanActive() {
        return !!this._pegmanActive;
    }

    //shows pegman if it has been requested, there's no map rotation and it isn't already shown (or on the way to be)
    _showPegman() {
        //don't show pegman if map has a rotation
        if (this._map.getView().getRotation()) return;
        this._toggleStreetViewControlDataAttribute(true);
        if (!this._pegmanIsDesired || this._pegmanActive) return;

        this._pegmanActive = true;
        this._gMap.setOptions({ streetViewControl: true });
    }

    //api to hide pegman
    hidePegman() {
        this._pegmanIsDesired = false;
        this._hidePegman();
    }

    //hides pegman if active
    _hidePegman() {
        this._toggleStreetViewControlDataAttribute(false);
        if (!this._pegmanActive) return;
        this._pegmanActive = false;
        this._gMap.setOptions({ streetViewControl: false });
    }

    // toggle data attribute to body tag when toggle map street view control,
    // allow other elements apply specific style
    _toggleStreetViewControlDataAttribute(enable = false) {
        if (enable) {
            this._map.getContainer().setAttribute('data-street-view-control', '');
            return;
        }

        this._map.getContainer().removeAttribute('data-street-view-control');
    }

    //handle change in rotation
    _onRotation() {
        if (this._map.getView().getRotation() === 0) this._showPegman();
        else this._hidePegman();
    }

    setStreetView(panorama) {
        this._gMap.setStreetView(panorama);
    }

    static _googleMapsIsLoaded() {
        return !!window.google?.maps?.Map;
    }

    _getTileKey(z, x, y) {
        return this.get('type') + '/' + getKeyZXY(z, x, y);
    }

    _initMutantContainer() {
        if (!this._gMapContainer) {
            this._gMapContainer = document.createElement('div');
            this._gMapContainer.style.zIndex = '100';
            this._gMapContainer.style.pointerEvents = 'none';
            this._gMapContainer.style.touchAction = 'none';
            this._gMapContainer.style.top = '0px';
            this._gMapContainer.classList.add('noselect');
        }
    }

    _initMutant() {
        if (!this._ready || !this._gMapContainer) return;

        if (this._gMap) {
            // reuse old _mutant, just make sure it has the correct size
            this._resize();
            return;
        }

        this._gMapCenter = new google.maps.LatLng(0, 0);

        //  ENH: At the moment we create one instance of google maps per basemap type. Refactor the code so that there's only one shared map for all of them
        const map = new google.maps.Map(this._gMapContainer, {
            center: this._gMapCenter,
            zoom: 1,
            tilt: 0,
            mapTypeId: google.maps.MapTypeId[this.get('type')],
            disableDefaultUI: true,
            keyboardShortcuts: false,
            draggable: false,
            disableDoubleClickZoom: true,
            scrollwheel: false,
            streetViewControl: false,
            styles: this.get('styles'),
            backgroundColor: 'transparent',
            ...this._googleMapOptions
        });

        this._gMap = map;

        //handle layer being added to a map for which there are no Google tiles at the given zoom
        google.maps.event.addListenerOnce(map, 'idle', () => {
            this._checkZoomLevels();
            this.iframe = this._gMapContainer.querySelector('iframe');
            //  In order to keep both the pegman and the map draggable, we need to allow pointer events on a certain element.
            //  This can be identified by going to the map element, then going to a child with z-index: 3, then a child of that with z-index: 4
            //  Once that has been found, reinstate pointer events on it and that should allow things to work properly
            const target = document.evaluate(
                '//*[@aria-label="Map"]',
                this._gMapContainer,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue?.children[1]?.children[0];
            if (target) target.style.pointerEvents = 'initial';
            this._gMapIsReady = true;
        });

        google.maps.event.addListener(map, 'tilesloaded', () => {
            this.iframe.style.display = 'none';
        });

        this._initIdleListener = google.maps.event.addListener(map, 'idle', () => {
            const nodes = this._gMapContainer.querySelectorAll('a');
            if (!nodes.length) return; //isn't actually idle - change to GMaps lib around 13/08/2018
            for (let i = 0; i < nodes.length; i++) {
                nodes[i].style.pointerEvents = 'auto';
            }
            google.maps.event.removeListener(this._initIdleListener);
        });
    }

    _setGMapContainerSize(size) {
        this._gMapContainer.style.width = size[0] + 'px';
        this._gMapContainer.style.height = size[1] + 'px';
        //  Force a size resync here
        if (this._mapsElement) {
            this._mapsElement.style.width = size[0] + 'px';
            this._mapsElement.style.height = size[1] + 'px';
        }
        google.maps.event.trigger(this._gMap, 'resize');
    }

    _attachObserver(node) {
        if (!this._observer) this._observer = new MutationObserver(this._onMutations);
        this._observer.observe(node, { childList: true, subtree: true });

        //  There are instances where google maps will forcefully change the position of the overlay here, so force it back
        if (!this._mapsObserver) this._mapsObserver = new MutationObserver(this._onMapsMutations);
        this._mapsElement = node.querySelector('div');
        this._mapsObserver.observe(this._mapsElement, { attributes: true });

        // if we are reusing an old _mutantContainer, we must manually detect
        // all existing tiles in it
        Array.prototype.forEach.call(node.querySelectorAll('img'), this._onMutatedImage);
    }

    _shiftPegmanForAttribution(mutations) {
        for (let i = 0; i < mutations.length; ++i) {
            const node = mutations[i].target;
            if (this.getAttributions()) {
                this._pegmanObserver.disconnect();
                const bottom = parseInt(node.style.bottom);
                node.style.bottom = `${bottom + 20}px`;
                this._pegmanObserver.observe(node, {
                    attributes: true,
                    attributeFilter: ['style']
                });
                return;
            }
        }
    }

    _onMutations(mutations) {
        for (let i = 0; i < mutations.length; ++i) {
            const mutation = mutations[i];
            for (let j = 0; j < mutation.addedNodes.length; ++j) {
                const node = mutation.addedNodes[j];

                if (node instanceof HTMLImageElement) {
                    this._onMutatedImage(node);
                } else if (node instanceof HTMLElement) {
                    if (node.classList.contains('gm-bundled-control-on-bottom')) {
                        if (!this._pegmanObserver) {
                            this._pegmanObserver = new MutationObserver(
                                this._shiftPegmanForAttribution
                            );
                            this._pegmanObserver.observe(node, {
                                attributes: true,
                                attributeFilter: ['style']
                            });
                        }
                    } else if (node.classList.contains('gm-svpc')) {
                        this._enablePegman(node);
                    } else if (node.classList.contains('gm-err-title')) {
                        this._gMapContainer.style.zIndex = '-1'; // if the key is wrong, the error message should be underneath other layers
                    } else {
                        Array.prototype.forEach.call(
                            node.querySelectorAll('img'),
                            this._onMutatedImage
                        );

                        // Check for, and remove, the "Sorry, we have no imagery here"
                        // empty <div>s. The [style*="text-align: center"] selector
                        // avoids matching the attribution notice.
                        // This empty div doesn't have a reference to the tile
                        // coordinates, so it's not possible to mark the tile as
                        // failed.
                        Array.prototype.forEach.call(
                            node.querySelectorAll(
                                'div[draggable=false][style*="text-align: center"]'
                            ),
                            function (node) {
                                node.parentNode.removeChild(node);
                            }
                        );
                    }
                }
            }
        }
    }

    _onMapsMutations(mutations) {
        for (let i = 0; i < mutations.length; ++i) {
            const mutation = mutations[i];
            const mutationTarget = mutation.target;
            if (mutationTarget.style.left == '0px') {
                mutationTarget.style.left = '';
                mutationTarget.style.right = '0px';
            }
            if (mutationTarget.style.height != this._gMapContainer.style.height) {
                mutationTarget.style.height = this._gMapContainer.style.height;
            }
            if (mutationTarget.style.width != this._gMapContainer.style.width) {
                mutationTarget.style.width = this._gMapContainer.style.width;
            }
        }
    }

    _onMutatedImage(imgNode) {
        let coords = null;
        let sublayer = 0;
        let src = imgNode.src;
        src = imgNode.__src__ || imgNode.src; //img elements can show transparent.png as the src
        let match = src.match(GoogleSource._roadRegexp);

        if (match) {
            coords = [match[1], match[2], match[3]];
            if (this.get('type') == 'HYBRID') {
                sublayer = 1;
            }
        } else {
            match = src.match(GoogleSource._satRegexp);
            if (match) {
                coords = [match[3], match[1], match[2]];
            }
        }

        if (src.match(GoogleSource._streetviewRegExp)) {
            //streetview tiles (shown while draggin pegman). keep them in the google map (map doesn't move at this stage)
            return;
        } else if (coords) {
            //  If crossOrigin is set, we need to create a new image and copy the source, since the original will have already started loading
            //  Otherwise we can just cache the original image
            if (this._crossOrigin !== null) {
                const corsImage = new Image();
                corsImage.crossOrigin = this._crossOrigin;
                corsImage.src = src;
                this._cacheImageAndUpdateTiles(coords, sublayer, corsImage);
            } else {
                this._cacheImageAndUpdateTiles(coords, sublayer, imgNode);
            }
            imgNode.style.position = 'absolute';
            imgNode.style.visibility = 'hidden';
        } else if (src.match(GoogleSource._staticRegExp)) {
            imgNode.style.visibility = 'hidden';
        } else if (
            src.match(GoogleSource._pegmanRegExp) ||
            src.match(GoogleSource._pegmanWidthHeightRegExp) ||
            (src.match(GoogleSource._base64SvgRegExp) &&
                imgNode.parentNode?.style.zIndex == '1000000')
        ) {
            //in-map pegman imgs
            this._enablePegman(imgNode.parentNode);
        }
    }

    _ensureImageCacheStructure(z, x, y) {
        const type = this.get('type');
        _imgCache[type] = _imgCache[type] || {};
        _imgCache[type][z] = _imgCache[type][z] || {};
        _imgCache[type][z][x] = _imgCache[type][z][x] || {};
        _imgCache[type][z][x][y] = _imgCache[type][z][x][y] || {};
    }

    _cacheImageAndUpdateTiles(coords, sublayer, imgNode) {
        //  Setup image in cache
        const [z, x, y] = coords;
        this._ensureImageCacheStructure(z, x, y);
        _imgCache[this.get('type')][z][x][y][sublayer] = imgNode;

        //  Update all tiles where appropriate
        const updateThese = [];
        const maxX = Math.pow(2, z);
        this.tileCache.forEach(tile => {
            const tileCoords = tile.tileCoord;
            if (tileCoords[0] != z || tileCoords[2] != y) return;
            let modX = tileCoords[1];
            while (modX >= maxX) modX -= maxX;
            while (modX < 0) modX += maxX;
            if (modX == x) {
                updateThese.push(tile);
            }
        });
        for (const tile of updateThese) {
            tile.setImage(imgNode, sublayer, this._flagRefresh);
        }
    }

    _checkZoomLevels() {
        if (!this._map) return;
        //setting the zoom level on the Google map may result in a different zoom level than the one requested
        //(it won't go beyond the level for which they have data).
        const zoomLevel = this._map.getView().getZoom();
        const gMapZoomLevel = this._gMap.getZoom();
        if (!zoomLevel || !gMapZoomLevel) return;

        const maxNativeZoom = this.get('maxNativeZoom');
        if (
            gMapZoomLevel !== zoomLevel || //zoom levels are out of sync, Google doesn't have data
            gMapZoomLevel > maxNativeZoom
        ) {
            //at current location, Google does have data (contrary to maxNativeZoom)
            //Update maxNativeZoom
            this._setMaxNativeZoom(gMapZoomLevel, maxNativeZoom);
        }
    }

    _update() {
        // zoom level check needs to happen before super's implementation (tile addition/creation)
        // otherwise tiles may be missed if maxNativeZoom is not yet correctly determined
        if (this._gMap) {
            const view = this._map.getView();
            const [lng, lat] = toLonLat(view.getCenter(), getUserProjection());
            const _center = new google.maps.LatLng(lat, lng);

            this._gMap.setCenter(_center);
            const zoom = this._map.getView().getZoom();
            const gMapZoom = this._gMap.getZoom();

            //  Don't update the zoom level while the map is zooming in or out
            if (!this._mapIsZooming && zoom != gMapZoom) {
                //  Google Maps doesn't like non-integer zoom levels
                const newZoom = Math.round(zoom);
                this._gMap.setZoom(newZoom);
                this._currentZoom = newZoom;

                if (this._gMapIsReady) this._checkZoomLevels();
                //else zoom level check will be done later by 'idle' handler
            }
        }
    }

    _onMoveStart() {
        const newZoom = this._map ? this._map.getView().getZoom() : null;
        if (this._currentZoom != newZoom) {
            this._mapIsZooming = true;
        }
    }

    _onMoveEnd() {
        const newZoom = this._map.getView().getZoom();
        if (this._currentZoom != newZoom) {
            this._mapIsZooming = false;
            this._update();
        }
    }

    _resize() {
        const size = this._map.getSize();
        if (
            !size ||
            (this._gMapContainer.style.width === size[0] + 'px' &&
                this._gMapContainer.style.height === size[1] + 'px')
        )
            return;
        this._setGMapContainerSize(size);
        if (!this._gMap) return;
        google.maps.event.trigger(this._gMap, 'resize');
    }

    _flagRefresh() {
        if (this._refreshTimer === null) {
            this._refreshTimer = setTimeout(() => {
                clearTimeout(this._refreshTimer);
                this._refreshTimer = null;
                this.changed();
            }, 10);
        }
    }

    _setMaxNativeZoom(zoomLevel, maxNativeZoom) {
        if (zoomLevel != maxNativeZoom) {
            this.set('maxNativeZoom', zoomLevel);
        }
    }

    _enablePegman(pegman) {
        if (!pegman) return;

        pegman.style.pointerEvents = 'auto';
        pegman.addEventListener(
            this._isTouchDevice ? 'touchstart' : 'mousedown',
            () => {
                this.dispatchEvent('pegman-mousedown');
            },
            false
        );
    }

    _enableBottomControlsOffset(enable) {
        const controls = this._map.getControls();
        const firstControl = controls.item(0);
        if (!firstControl) return;
        const parentElement = firstControl.element.parentElement;
        parentElement.style.height = enable ? 'calc(100% - 20px)' : '100%';
    }

    createTile_(z, x, y, pixelRatio, projection, tileKey) {
        const tileCoord = [z, x, y];
        const tile = new this.tileClass(tileKey, tileCoord, this.get('type'), this.tileOptions);
        tile.addEventListener(EventType.CHANGE, this.handleTileChange);

        const maxX = Math.pow(2, z);
        while (x >= maxX) x -= maxX;
        while (x < 0) x += maxX;
        this._ensureImageCacheStructure(z, x, y);
        const type = this.get('type');
        for (const [sublayer, cached] of Object.entries(_imgCache[type][z][x][y])) {
            tile.setImage(cached, sublayer, this._flagRefresh);
        }
        return tile;
    }
}

Object.assign(GoogleSource, {
    // Only images which 'src' attrib match this will be considered for moving around.
    // Looks like some kind of string-based protobuf, maybe??
    // Only the roads (and terrain, and vector-based stuff) match this pattern
    _roadRegexp: /!1i(\d+)!2i(\d+)!3i(\d+)!/,

    // On the other hand, raster imagery matches this other pattern
    _satRegexp: /x=(\d+)&y=(\d+)&z=(\d+)/,

    // On small viewports, when zooming in/out, a static image is requested
    // This will not be moved around, just removed from the DOM.
    _staticRegExp: /StaticMapService\.GetMapImage/,

    _streetviewRegExp: /\!1scb_client/,

    _pegmanRegExp: /cb_scout/,
    _pegmanWidthHeightRegExp: /width%3D%2223%22%20height%3D%2238%22/,
    _base64SvgRegExp: /data:image\/svg\+xml/
});

export class GoogleTile extends ImageTile {
    /*
     * Tile that combines tile images passed and renders them to a canvas which is returned to the renderer
     * Tile images as passed in from the mutant observer
     * @param {*} tileCoord
     * @param {*} type
     * @param {*} opt_options
     */
    constructor(tileKey, tileCoord, type, opt_options) {
        super(tileCoord, TileState.IDLE, opt_options);
        this.key_ = tileKey;
        this._errorTimeout = null;
        this._type = type;
        this.image_ = null;
        this.images = new Array(this._imagesPerTile()).fill(null);
    }

    load() {
        //  We're supposed to use this to load the tiles, but...
        //  Since we're waiting for the google mutant, set up an error timeout here instead
        if (this._errorTimeout) {
            clearTimeout(this._errorTimeout);
        }

        this._errorTimeout = setTimeout(() => {
            this.state = TileState.ERROR;
            this.changed();
        }, 10000);

        this.state = TileState.LOADING;
        this.changed();
    }

    getKey() {
        return this._type + '/' + this.key_ + '/' + this.tileCoord;
    }

    setImage(image, sublayer, callback) {
        const imgClone = image.cloneNode(true);
        imgClone.visibility = 'visible';
        this.images[sublayer] = imgClone;
        if (imgClone.complete && imgClone.naturalWidth !== 0) {
            this._onImageLoaded(callback);
        } else {
            imgClone.onload = this._onImageLoaded.bind(this, callback);
        }
    }

    getImage() {
        return this.image_;
    }

    _imagesPerTile() {
        return this.type == 'HYBRID' ? 2 : 1;
    }

    _onImageLoaded(callback) {
        for (const img of this.images) {
            if (!img.complete || img.naturalWidth === 0) {
                return;
            }
        }
        this._onLoadingSuccess(callback);
    }

    _onLoadingSuccess(callback) {
        if (this._errorTimeout) {
            clearTimeout(this._errorTimeout);
            this._errorTimeout = null;
        }
        this._generateImage();
        this.state = TileState.LOADED;
        this.changed();
        callback?.();
    }

    _generateImage() {
        //  Note that 256x256 is the default tile size for a tileGrid.
        //  If we need to change this later, analyze the layer's tileGrid
        const ctx = createCanvasContext2D(256, 256, canvasPool);
        if (!ctx) return; //canvas memory expired?
        for (const img of this.images) {
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, 256, 256);
        }
        this.image_ = ctx.canvas;
    }

    /*
     * Removed from the cache due to expiry
     */
    release() {
        if (this.image_) canvasPool.push(this.image_);
        super.release();
    }
}

export default GoogleSource;
