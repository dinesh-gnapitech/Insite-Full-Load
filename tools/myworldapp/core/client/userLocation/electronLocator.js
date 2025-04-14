import { trace } from 'myWorld/base/trace';
import Locator from './locator';

export default class ElectronLocator extends Locator {
    static async getInstances(options) {
        if (!window.externalGPS) return [];
        //  Loop through the devices and create an ElectronLocator for each
        const devices = await window.externalGPS.getDevices();
        const serialDevices = devices.serial.map(
            dev => new ElectronLocator(dev, 'serial', options)
        );
        return [...serialDevices];
    }

    /**
     * True if Anywhere for Windows GPS access is available
     * @type {boolean}
     */
    static get isSupported() {
        return !!window.externalGPS;
    }

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
     * Represents the location information provided by a GPS device (via USB or bluetooth)
     * Available on IQGeo Anywhere for Windows
     * @extends {Locator}
     * @param {string} device
     * @param {string} deviceType Currently only 'serial' is used
     * @param {locatorOptions} options
     */
    constructor(device, deviceType, options) {
        super(options);
        this.device = device;
        this.deviceType = deviceType;
        this.options = { ...this.constructor.options, ...options };
        this.msg = this.options.msg;
        this._connectionOptions =
            deviceType == 'serial'
                ? { baudRate: 4800, dataBits: 8, stopBits: 1, parity: 'none' }
                : {};
        this._isPolling = false;
        this._lastAccuracy = {};
        this._lastAccuracyTime = null;
        this._resetDeviceLogs();
    }

    get key() {
        //  Device paths are dynamic, vendor ID and product ID are not, so use them for the key
        return `electron_${this.device.path}`;
    }

    get name() {
        return this.msg('external_device', { desc: this.device.path });
    }

    getOptions() {
        if (this.deviceType == 'serial') {
            return [
                {
                    key: 'baudRate',
                    value: this._connectionOptions.baudRate,
                    label: this.msg('baudRate'),
                    type: 'number'
                },
                {
                    key: 'dataBits',
                    value: this._connectionOptions.dataBits,
                    label: this.msg('dataBits'),
                    type: 'number',
                    min: 5,
                    max: 8
                },
                {
                    key: 'stopBits',
                    value: this._connectionOptions.stopBits,
                    label: this.msg('stopBits'),
                    type: 'number',
                    min: 1,
                    max: 2
                },
                {
                    key: 'parity',
                    value: this._connectionOptions.parity,
                    label: this.msg('parity'),
                    type: 'select',
                    values: [
                        ['none', this.msg('parity_none')],
                        ['even', this.msg('parity_even')],
                        ['mark', this.msg('parity_mark')],
                        ['odd', this.msg('parity_odd')],
                        ['space', this.msg('parity_space')]
                    ]
                }
            ];
        }
    }

    setOptions(options) {
        const isPolling = this._isPolling;
        if (isPolling) this.stopTracking();
        this._resetDeviceLogs();
        this._connectionOptions = { ...this._connectionOptions, ...options };
        if (isPolling) this.startTracking();
    }

    isAvailable() {
        return this._couldConnectToDevice;
    }

    async getPosition() {
        trace('GPS', 10, `getPosition called for device ${this.key}`);
        if (this._isPolling) {
            return this._lastReceivedPosition;
        } else {
            trace('GPS', 8, `Device ${this.key} not currently polling, starting tracking...`);
            let ret = null;
            await this.startTracking({
                handleNewPosition: data => {
                    ret = data;
                    this.stopTracking();
                }
            });
            return ret;
        }
    }

    async startTracking(options) {
        trace('GPS', 10, `startTracking called for device ${this.key}`);
        this.options = { ...this.options, ...options };
        if (!this._isPolling) {
            trace('GPS', 8, `calling beginGPSPolling for device ${this.key}`);
            await window.externalGPS.beginGPSPolling(this.device.path, {
                callback: this._onGPSDataReceived,
                onError: this._onGPSError,
                deviceOptions: this._connectionOptions
            });
            this._isPolling = true;
        }
    }

    stopTracking() {
        trace('GPS', 10, `stopTracking called for device ${this.key}`);
        if (this._isPolling) {
            trace('GPS', 8, `calling stopGPSPolling for device ${this.key}`);
            window.externalGPS.stopGPSPolling(this.device.path);
            this._isPolling = false;
        }
    }

    _onGPSDataReceived = data => {
        this._couldConnectToDevice = true;
        trace('GPS', 6, `GPS device ${this.key} received data: ${data}`);
        const position = this._convert(data);

        const { heading } = position;
        if (heading) this._updateHeading(heading);

        const { horizontalAccuracy, verticalAccuracy } = position;
        if (horizontalAccuracy && verticalAccuracy)
            this._updateAccuracy(horizontalAccuracy, verticalAccuracy, data.time);

        this._updatePosition(position, data.time);
    };

    _onGPSError = (error, errorProps) => {
        //  Apparently Electron doesn't like applying props to the error, so send them separately and merge them here
        Object.assign(error, errorProps);
        trace('GPS', 6, `GPS device ${this.key} received an error: ${error.type}`);
        this._isPolling = false;
        if (['disconnect', 'misconfigured'].includes(error.type)) {
            this._resetDeviceLogs();
            this._couldConnectToDevice = true;
        } else {
            window.externalGPS.stopGPSPolling(this.device.path);
            this._couldConnectToDevice = false;
        }
        this.handleTrackingError(error);
    };

    _updatePosition(newData, timestamp) {
        this._lastReceivedPosition = {
            ...this._lastReceivedPosition,
            ...newData
        };
        const position = {
            coords: this._lastReceivedPosition,
            timestamp: timestamp ?? Date.now()
        };
        this.positionLog.add(position);

        this.handleNewPosition(position);
    }

    _updateHeading(newData) {
        this._lastReceivedHeading = {
            ...this._lastReceivedHeading,
            ...newData
        };
        this.handleDeviceHeading(this._lastReceivedHeading);
    }

    _updateAccuracy(horizontalAccuracy, verticalAccuracy, timestamp) {
        //  Always log the horizontal accuracy
        this.positionLog.add({ accuracy: horizontalAccuracy, timestamp });

        //  Throttle the calls to update accuracy to 1sec
        if (this._lastAccuracyTime && this._lastAccuracyTime - timestamp < 1000) {
            return;
        }

        if (
            this._lastAccuracy.horizontalAccuracy != horizontalAccuracy ||
            this._lastAccuracy.verticalAccuracy != verticalAccuracy
        ) {
            this._lastAccuracy = { horizontalAccuracy, verticalAccuracy };
            this.handleAccuracy(horizontalAccuracy, verticalAccuracy);
        }
    }

    _convert(data) {
        trace('GPS', 10, `Device ${this.key} received GPS message type ${data.type}`);
        //  ENH: There's a difference between heading (direction device is facing) and track (direction of travel),
        //but at the moment we're conflating them. We should handle this better

        switch (data.type) {
            //  Fix information
            case 'GGA':
                /*
                Unused fields
                quality: Fix quality (either invalid, fix or diff)
                satellites: Number of satellites being tracked
                geoidal: Height of geoid in meters (mean sea level)
                age: time in seconds since last DGPS update
                stationID: DGPS station ID number
                valid: Indicates if the checksum is okay
                */
                return {
                    latitude: data.lat,
                    longitude: data.lon,
                    altitude: data.alt,
                    hdop: data.hdop
                };

            //  NMEAs own version of essential GPS data
            case 'RMC':
                /*
                Unused fields
                status: Status active or void
                variation: Magnetic Variation
                faa: The FAA mode, introduced with NMEA 2.3
                valid: Indicates if the checksum is okay
                */
                return {
                    latitude: data.lat,
                    longitude: data.lon,
                    heading: data.track,
                    speed: data.speed
                };

            //  Active satellites
            case 'GSA':
                //  ENH: we might be able to use pdop and vdop
                return { dop: data.hdop };

            //  Geographic Position - Latitude/Longitude
            case 'GLL':
                return {
                    latitude: data.lat,
                    longitude: data.lon
                };

            //  List of Satellites in view
            case 'GSV':
                //  ENH: We might be able to use this to get signal quality
                break;

            //  vector track and speed over ground
            case 'VTG':
                return {
                    heading: data.track,
                    speed: data.speed
                };

            //  UTC day, month, and year, and local time zone offset
            case 'ZDA':
                break;

            //  Heading
            case 'HDT':
                //  ENH: We might be able to use trueNorth
                return {
                    heading: data.heading
                };

            //  Position error statistics
            case 'GST':
                //  We will work out the accuracy using Standard Deviation.
                //  By default, the values will be accurate ~68% of the time, but
                //  By doubling the values, they will be accurate ~95% of the time
                return {
                    horizontalAccuracy: Math.max(data.ellipseMajor, data.ellipseMinor) * 2,
                    verticalAccuracy: data.heightError * 2
                };

            default:
                console.warn(`Unimplemented GPS Signal type: ${data.type}`);
                break;
        }

        //  If we've got here, we should return an empty object to keep the rest of the code happy
        return {};
    }

    _resetDeviceLogs() {
        trace('GPS', 5, `Resetting device logs for ${this.key}`);
        this._couldConnectToDevice = null;
        this._lastReceivedPosition = {};
        this._lastReceivedHeading = {};
        this._hdopLog = [];
    }
}
