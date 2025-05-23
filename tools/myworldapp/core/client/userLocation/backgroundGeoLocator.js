import Locator from './locator';

export default class BackgroundGeoLocator extends Locator {
    key = 'BackgroundGeolocation';

    static options = {
        // Geolocation config
        desiredAccuracy: 0,
        distanceFilter: 10,
        stationaryRadius: 25,
        // Activity Recognition config
        activityRecognitionInterval: 10000,
        stopTimeout: 15,
        // Application config
        debug: false, // <-- Debug sounds & notifications.
        stopOnTerminate: false,
        startOnBoot: true,
        preventSuspend: true,
        heartbeatInterval: 15
    };

    /**
     * True if this BackgroundGeolocation cordova plugin is available
     * @type {boolean}
     */
    static get isSupported() {
        return !!window.BackgroundGeolocation;
    }

    _isTracking = false;

    /**
     * Represents the location information provided by the BackgroundGeolocation cordova plugin
     * This will be available on IQGeo Anywhere for iOS and Android
     * @extends {Locator}
     * @param {locatorOptions} options
     */
    constructor(options) {
        super(options);
        this.msg = this.options.msg;

        this.bgGeo = window.BackgroundGeolocation;
        this._trackingInterval = null;
    }

    get name() {
        return this.msg('background_geo_locator');
    }

    getPosition() {
        return new Promise((resolve, reject) => {
            this.bgGeo.getCurrentPosition(
                {
                    desiredAccuracy: 10,
                    timeout: 30000,
                    maximumAge: 0,
                    samples: 3
                },
                result => {
                    resolve(result);
                },
                error => {
                    console.error(`BackgroundGeoLocator.getPosition: `, error.message);
                    reject(error);
                }
            );
        });
    }

    async showDisclosureIfRequired() {
        const Plugins = window.Capacitor.Plugins;
        const { value: hasDisclosed } = await Plugins.Preferences.get({
            key: 'gps_has_disclosed'
        });
        if (!hasDisclosed) {
            const { value: accepted } = await Plugins.Dialog.confirm({
                title: this.msg('location_tracking_title'),
                message: this.msg('location_tracking_message')
            });
            if (accepted) {
                await Plugins.Preferences.set({
                    key: 'gps_has_disclosed',
                    value: 'true'
                });
            } else {
                throw new Error('User rejected location permission');
            }
        }
    }

    async startTracking(options = {}) {
        this.options = { ...this.options, ...options };

        if (!this._isTracking) {
            // iOS 13+ permissions check
            if (window.Capacitor?.platform == 'ios') {
                await DeviceOrientationEvent?.requestPermission?.();
            }
            // Android disclosure check
            else if (window.Capacitor?.platform == 'android') {
                await this.showDisclosureIfRequired();
            }
            const bgGeo = this.bgGeo;
            bgGeo.configure(
                {
                    ...this.options.locatorOptions,
                    backgroundPermissionRationale: {
                        title: this.msg('location_tracking_background_title'),
                        message: this.msg('location_tracking_background_message')
                    }
                },
                state => {
                    // This callback is executed when the plugin is ready to use.
                    console.log(`BackgroundGeolocation ready: ${JSON.stringify(state)}`);
                    bgGeo.start(() => {
                        this._isTracking = true;
                        // Listen to location events & errors.
                        //  The plugin doesn't give updates constantly, so we're going to force it to keep giving us locations on the given interval
                        this._trackingInterval = setInterval(() => {
                            bgGeo.getCurrentPosition({}, this.onLocation);
                        }, 1000);
                        window.addEventListener(
                            'deviceorientation',
                            this.handleDeviceHeading,
                            true
                        );
                    });
                }
            );
        }
    }

    onLocation = location => {
        //  The backgroundGeolocator doesn't log DOP, but it logs accuracy in coords
        const coords = location.coords ?? {};
        this.handleNewPosition({
            coords,
            accuracy: coords.accuracy,
            timestamp: Date.now()
        });
    };

    stopTracking() {
        if (this._isTracking) {
            const bgGeo = this.bgGeo;
            bgGeo.removeListener('location', this.onLocation);
            bgGeo.stop();
            clearInterval(this._trackingInterval);
            this._trackingInterval = null;
            this._isTracking = false;
        }

        window.removeEventListener('deviceorientation', this.handleDeviceHeading, true);
    }
}
