/* globals myw, platform */
import Locator from './locator';

export default class BrowserLocator extends Locator {
    key = 'browser';

    static options = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 5000
    };

    /**
     * True if browser's geolocation is available (and cordova's BackgroundGeolocation isn't)
     * If BackgroundGeolocation is available another locator using it should be eavailable instead
     * Prevents geolocation from being available in Electron as this requires a Google API key
     * @type {boolean}
     */
    static get isSupported() {
        //  Make available in web browsers
        if (!myw.isNativeApp) return typeof navigator.geolocation?.watchPosition == 'function';

        //  Always available in iOS / Android
        if (!platform?.isElectron()) return true;

        //  In Electron, we require a Google API Key. This is checked in our preload code
        return window.externalGPS.browserGeolocationIsSetup();
    }

    _watchId = null;

    /**
     * Represents the location information provided by the browser
     * See {@link https://developer.mozilla.org/en-US/docs/Web/API/Navigator/geolocation}
     * @extends {Locator}
     * @param {locatorOptions} options
     */
    constructor(options) {
        super(options);
        this.msg = this.options.msg;
    }

    get name() {
        return this.msg('browser_locator');
    }

    get dop() {
        //. Browser geolocation does not support DOP reporting, so always return false here
        return false;
    }

    getPosition() {
        const { enableHighAccuracy, timeout, maximumAge } = this.options;
        if (this._watchId !== null) return this._lastPosition;

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                location => {
                    this.handleNewPosition(location);
                    resolve(location);
                },
                error =>
                    reject(
                        new Error(
                            error.code === 1
                                ? 'geolocation_not_authorised'
                                : 'geolocation_generic_error'
                        )
                    ),
                { enableHighAccuracy, timeout, maximumAge }
            );
        });
    }

    async startTracking(options = {}) {
        this.options = options;
        // iOS 13+ permissions check
        if (
            typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function'
        ) {
            await DeviceOrientationEvent.requestPermission();
        }

        //if position hasn't changed since getCurrentPosition, watchPosition doesn't trigger a call, so we do a call with last position to ensure a call is made straight away
        if (this._lastPosition) this.handleNewPosition(this._lastPosition);
        const { enableHighAccuracy, timeout, maximumAge } = this.options;

        if (this._watchId !== null) navigator.geolocation.clearWatch(this._watchId);
        this._watchId = navigator.geolocation.watchPosition(
            this.handleNewPosition,
            this.handleTrackingError,
            { enableHighAccuracy, timeout, maximumAge }
        );

        window.addEventListener('deviceorientation', this.handleDeviceHeading, true);
    }

    stopTracking() {
        if (this._watchId !== null) {
            navigator.geolocation.clearWatch(this._watchId);
            this._watchId = null;
        }

        window.removeEventListener('deviceorientation', this.handleDeviceHeading, true);
    }
}
