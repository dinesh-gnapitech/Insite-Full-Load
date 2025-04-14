// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-base';
import GeoJSONVectorLayer from 'myWorld/layers/geoJSONVectorLayer';
import { toRadians } from 'ol/math';
import BrowserLocator from './browserLocator';
import BackgroundGeoLocator from './backgroundGeoLocator';
import ElectronLocator from './electronLocator';
import DebugLocator from './debugLocator';
import { trace as mywTrace, EventsMixin, LatLng } from 'myWorld/base';
import { IconStyle } from 'myWorld/styles/iconStyle';
import userRotationImg from 'images/markers/user-rotation.png';
import userLocationImg from 'images/markers/user-location.png';

const trace = mywTrace('gps');

/**
 * Notification message which can either contain a title and description or can be just a string
 * If the message is an object with a title, an alert icon is displayed after the title.
 * @typedef userLocationOptions
 * @property {boolean} [showMarker=true]    Set to false if another component is responsible for showing the location on the map
 * @property {boolean} [updateMap=true]     Set to false if another component is responsible for panning/zooming the map
 * @property {boolean} [onlyPanNearEdges=true] (only used when updateMap=true) Set to false to always keep the map centered on the user's location
 * @property {boolean} [preemptAvailability=false] If true will check for access to positioning on application startup, including requesting permission from users. Makes initial localion access faster
 * @property {string}  [preferredLocatorKey]
 */

export default class UserLocation {
    static {
        Object.assign(this.prototype, EventsMixin);
    }

    //should be ordered by higher precision first
    static locatorClasses = [BackgroundGeoLocator, ElectronLocator, BrowserLocator, DebugLocator];

    static options = {
        showMarker: true,
        updateMap: true,
        onlyPanNearEdges: true,
        preemptAvailability: false,
        preferredLocatorKey: undefined
    };

    /**
     * @class Handles obtaining the user/device's positioning and heading and showing it on the app's geographical map.
     *      Also handles controlling the map's rotation mode.
     *      Requires init method to be called to set options and initiate checking for locator devices
     * @param  {Application} app The application
     * @param  {userLocationOptions} [options]
     * @constructs
     * @fires tracking-started
     * @fires location-changed
     * @fires heading-changed
     * @fires tracking-stopped
     * @fires tracking-changed
     */
    constructor(app, options) {
        this.options = { ...this.constructor.options, ...options };
        this.app = app;

        /**
         * @type {boolean} */
        this.isTracking = false;

        this._mapRotationRequested = false;
        this._marker = null; // marker showing location on the map, can be a circle or a cone showing also heading
        this.locators = [];
        this._locatorOptions = {};
        this._locator = null;

        /** Resolves when initialisation has completed (via a call to init() method)
         * @type {promise} */
        this.initialised = new Promise(resolve => {
            this._initialisedResolve = resolve;
        });
    }

    /**
     * Initialises with given options and checks for available locators
     * @type {MapControl}
     */
    async init(options) {
        this.options = { ...this.constructor.options, ...options };
        await this.refreshAvailableLocators();
        this._initialisedResolve();
    }

    /**
     * The application's geographical map
     * @type {MapControl}
     */
    get map() {
        return this.app.map;
    }

    /**
     * True when the map is in mode to rotate according to heading of the current positioning device
     * @type {boolean}
     */
    get isRotatingMap() {
        return this.isTracking && this._mapRotationRequested;
    }

    /**
     * @type {Locator}
     */
    get activeLocator() {
        return this._locator;
    }

    /**
     * The latest available location
     * @type {LatLng}
     */
    get lastLatLng() {
        return this._lastLatLng;
    }

    /**
     * Returns true if locators can be added or removed, for example a USB GPS being plugged in
     * @returns {boolean}
     */
    hasDynamicLocators() {
        return this.constructor.locatorClasses
            .filter(Locator => Locator.isSupported)
            .some(loc => typeof loc.getInstances == 'function');
    }

    /**
     * Set options on available locators
     * @param {string} [opts.preferredLocatorKey] Key of preferred locator
     * @param {object<locatorOptions>} [opts.locatorsOptions] Keyed on locator key
     */
    setOptions({ preferredLocatorKey, locatorsOptions = {} }) {
        this.options.preferredLocatorKey = preferredLocatorKey;

        this._locatorOptions = locatorsOptions;
        //  Update the currently existing locators here
        this.locators.forEach(loc => {
            const key = loc.key;
            const opts = this._locatorOptions[key];
            if (opts) loc.setOptions?.(opts);
        });
    }

    /**
     * Obtains the options currently defined for each of the available locators
     * @returns {object<locatorOptions>} locatorsOptions  Keyed on locator key
     */
    getLocatorOptions() {
        this._locatorOptions = this.locators.reduce((prev, loc) => {
            if (loc.getOptions) {
                const key = loc.key;
                const options = loc.getOptions();
                const newOptions = options.reduce((newOpts, opt) => {
                    newOpts[opt.key] = opt.value;
                    return newOpts;
                }, {});
                prev[key] = newOptions;
            }
            return prev;
        }, this._locatorOptions);
        return this._locatorOptions;
    }

    /**
     * Refreshes the list of available locators
     * updating the "locators" property
     * @param {boolean} [fromDialog=false]
     */
    async refreshAvailableLocators(fromDialog = false) {
        const msg = myw.msg.bind(myw.msg, 'GpsStatusPlugin');
        const isSupportedResults = await Promise.all(
            this.constructor.locatorClasses.map(async Locator => {
                try {
                    if (await Locator.isSupported) return Locator;
                } catch (e) {
                    console.error(`Locator ${Locator.name} failed on 'isSupported':`, e);
                }
            })
        );
        const supportedLocatorsClasses = isSupportedResults.filter(Boolean);
        const locatorPromises = supportedLocatorsClasses.flatMap(Locator => {
            if (typeof Locator.getInstances == 'function') {
                return Locator.getInstances({
                    msg
                });
            } else {
                return new Locator({
                    msg
                });
            }
        });
        const refreshedLocators = (await Promise.all(locatorPromises)).flat();
        const newLocators = refreshedLocators.filter(
            refLoc => !this.locators.find(loc => loc.key == refLoc.key)
        );
        const lostLocators = this.locators.filter(
            loc => !refreshedLocators.find(refLoc => loc.key == refLoc.key)
        );
        if (fromDialog) {
            newLocators.forEach(locator => locator.startTracking());
        }
        if (this.options.preemptAvailability) newLocators.forEach(locator => locator.isReady());
        newLocators.forEach(loc => {
            loc.setOptions?.(this._locatorOptions[loc.key] ?? {});
            this.locators.push(loc);
        });
        lostLocators.forEach(loc => {
            loc.stopTracking();
            this.locators = this.locators.filter(oldLoc => oldLoc.key != loc.key);
        });
    }

    /**
     * Toggles between tracking current location and not tracking
     * @returns {Promise}
     */
    async toggleTracking() {
        if (this.isTracking) {
            return this.stopTracking();
        } else {
            return this.startTracking();
        }
    }

    /**
     * Chooses the locator to be used when obtaining the current location
     * @param {Locator} locator
     * @param {object} options Options for setting the locator
     * @param {boolean} [options.setAsPreferred=false] Whether to set the locator as the preferred one
     * @param {boolean} [options.forceStartTracking=false] Whether to always start tracking
     */
    async setLocator(locator, options = {}) {
        const { setAsPreferred = false, forceStartTracking = false } = options;
        const wasTracking = this._locator && this.isTracking;
        if (wasTracking) this._locator.stopTracking();

        trace(2, `Setting locator to ${locator.constructor.name}. wasTracking: ${wasTracking}`);
        if (setAsPreferred) this.options.preferredLocatorKey = locator.key; //so it is kept if tracking is reactivated later on

        this._setLocator(locator);

        if (wasTracking || forceStartTracking) {
            await locator.startTracking();
            this.startTracking();
        }
    }

    /**
     * Adds listener to watch position
     * Also adds listener on device orientation
     * If rotation will enter rotate map mode if not enter rotate marker mode
     * @param {object} options
     * @property {boolean} [showMarker=true]
     * @property {boolean} [updateMap=true]
     * @property {Locator} [locator] locator to use
     * @return {boolean} true if successful
     */
    async startTracking(options = {}) {
        trace(1, 'starting to track');
        const { locator, ...otherOptions } = options;
        this.options = { ...this.options, ...otherOptions };

        this.isTracking = true; // needs to be set here as _setLocator uses this value;

        if (locator) this.setLocator(locator);
        else await this._pickLocator();

        if (!this._locator) {
            this.isTracking = false;
            this.fire('tracking-changed');
            return false;
        }

        trace(2, `Firing tracking-changed`);
        this._locator.startTracking();

        if (this.isRotatingMap) this.rotateStart();
        this.fire('tracking-changed');
        this.fire('tracking-started');
        trace(6, 'started to track');
        return true;
    }

    /**
     * Stops tracking location.
     * Removes listener to watching of position
     * @return {boolean} true if successful
     */
    stopTracking() {
        trace(3, 'stoping tracking');
        this.isTracking = false;
        this._locator.stopTracking();
        this._locator.off('position-changed', this.handleNewPosition);
        this._locator.off('heading-changed', this.handleDeviceHeading);
        this._locator.off('tracking-error', this.handleTrackingError);

        if (this._overlay) {
            this._overlay.clear();
            this.map.removeLayer(this._overlay);
            this._overlay = null;
        }
        this._marker = null;

        this.map.getView().setRotation(0);
        this.map.requestRotationButton(this, false);

        this.fire('tracking-changed');
        this.fire('tracking-stopped');
        trace(6, 'stopped tracking');
        return true;
    }

    /**
     * Callback for when a new position is received
     * @param {GeolocationPosition} position
     * @protected
     */
    handleNewPosition = ({ position }) => {
        const { coords } = position;
        const { latitude, longitude } = coords;
        const latLng = new LatLng(latitude, longitude);
        const lngLat = [longitude, latitude];
        this._lastLatLng = latLng;

        trace(7, `handling new position ${JSON.stringify(position)}`);

        const { showMarker, updateMap, onlyPanNearEdges } = this.options;
        if (showMarker) {
            this._ensureMarker();
            this._marker.setLngLats(lngLat);
        }

        const locationNearCentreOfMap = this.map.getBounds().pad(-0.15).contains(latLng);
        const shouldPanNearCentre = !onlyPanNearEdges;
        const shouldPan = updateMap && (shouldPanNearCentre || !locationNearCentreOfMap);
        if (shouldPan) this.map.panTo(lngLat);

        this.fire('location-changed', { position, latLng });
    };

    /**
     * Handle device orientation event by rotation the Marker or the Map depending on current state
     * @param {DeviceOrientationEvent} event.heading
     * @protected
     */
    handleDeviceHeading = ({ heading: event }) => {
        if (event.alpha == null) return;
        //for orientation refer to https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Orientation_and_motion_data_explained
        //and https://developer.apple.com/documentation/webkitjs/deviceorientationevent/1804777-webkitcompassheading

        //The alpha angle is 0° when top of the device is pointed directly toward the Earth's north pole,
        //and increases as the device is rotated toward the left (west).
        //we also handle iOS which has a separate property for the angle relative to North
        const clockwiseAngleFromNorthDegrees = event.webkitCompassHeading ?? -event.alpha;

        const angle = toRadians(clockwiseAngleFromNorthDegrees);
        this._lastOrientationAngle = angle; //to be used when switching
        this.hasOrientation = true;

        trace(9, `handling new heading: ${angle}`);

        const { showMarker, updateMap } = this.options;
        if (updateMap) {
            this.map.requestRotationButton(this);

            if (this.isRotatingMap) this._rotateMapToHeading(angle);
        }
        if (showMarker && !this.isRotatingMap) this._rotateMarkerToHeading(angle);

        this.fire('heading-changed', { angle, originalEvent: event });
    };

    /**
     * Handle error obtaining position
     * @param {Error} error
     * @protected
     */
    handleTrackingError = error => {
        trace(2, `UserLocation: tracking error: (${error.code}): ${error.message}`);
        this.fire('tracking-error', { error });
    };

    /**
     * Sets mode to rotating map
     */
    rotateStart() {
        this._mapRotationRequested = true;
        this.map.requestRotationButton(this);

        this.map.getView().setRotation(-this._lastOrientationAngle);
        this._rotateMarkerToHeading(0); //marker should point to top of map
    }

    /**
     * Stops map rotation mode -> North = up
     */
    rotateStop() {
        this._mapRotationRequested = false;

        this.map.requestRotationButton(this, false);
        this.map.getView().setRotation(0);
        this._rotateMarkerToHeading(this._lastOrientationAngle);
    }

    /**
     * Sets the user rotation marker orientation so the marker faces the orientation of the device
     * @param {number} angle Device orientation clockwise from North
     * @private
     */
    _rotateMarkerToHeading(angle) {
        if (!this.options.showMarker) return;

        this._ensureMarker();
        this._marker.getStyle().getImage().setRotation(angle); //icon rotation is clockwise
        this._marker.changed(); //To update the feature display
    }

    /**
     * Changes the roation of the map to reflect the orientation of the device
     * @param {number} angle Device orientation clockwise from North
     * @private
     */
    _rotateMapToHeading(angle) {
        this.map.getView().setRotation(-angle);
    }

    /**
     * Chooses a Locator to use based on the order defined in static locatorClasses
     * @private
     */
    async _pickLocator() {
        trace(8, `_pickLocator`);

        const prefLocator = this.locators.find(
            locator => locator.key == this.options.preferredLocatorKey && locator.isAvailable()
        );
        if (prefLocator) return this._setLocator(prefLocator);

        let defaultLocator;
        for (let locator of this.locators) {
            try {
                const available = locator.isAvailable();
                if (available === true) {
                    defaultLocator = locator;
                    break;
                }
            } catch (error) {
                console.error(
                    `Failed to check availability of ${locator.constructor.name}: ${error}`
                );
                return false;
            }
        }

        if (defaultLocator) this._setLocator(defaultLocator);
    }

    _setLocator(locator) {
        if (this._locator) {
            this._listen('off', this._locator);
        }
        this._locator = locator;
        if (this.isTracking) this._listen('on', this._locator);
    }

    _listen(onOrOff, locator) {
        locator[onOrOff]('position-changed', this.handleNewPosition);
        locator[onOrOff]('heading-changed', this.handleDeviceHeading);
        locator[onOrOff]('tracking-error', this.handleTrackingError);
    }

    /**
     * Creates openLayers point feature at this._latLng. Creates source and overlay
     * @private
     */
    _ensureMarker() {
        const markerType = this.hasOrientation ? 'cone' : 'circle';
        if (this._marker && this._markerType === markerType) return;

        this._markerType = markerType;
        const url = markerType == 'cone' ? userRotationImg : userLocationImg;
        const anchor = markerType == 'cone' ? [50, 73] : [50, 50];
        const markerStyle = new IconStyle({
            iconUrl: url,
            iconAnchor: anchor,
            anchorUnit: '%'
        });
        if (!this._overlay) {
            this._overlay = new GeoJSONVectorLayer({ map: this.map });
        }

        if (this._marker) this._overlay.remove(this._marker);

        const lastLatLng = this._lastLatLng ?? [0, 0]; // default is necessary because we can get a heading before a position
        this._marker = this._overlay.addPoint(lastLatLng, markerStyle);
    }
}

Object.assign(myw, { DebugLocator, BackgroundGeoLocator, ElectronLocator, BrowserLocator });

/**
 * Fired when features have been inserted/deleted.
 * @event location-changed
 * @property position:    {GeolocationPosition}
 * @property latLng:   {LatLng}
 */

/**
 * Fired when features have been inserted/deleted.
 * @event heading-changed
 * @property angle:    {number} clockwise angle from North in radians
 * @property originalEvent: {DeviceOrientationEvent}
 */
