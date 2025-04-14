import { isTracing, LatLng } from 'myWorld/base';
import Locator from './locator';

export default class DebugLocator extends Locator {
    key = 'debug';
    _watchId = null;

    static options = {
        failureProbability: 0.3,
        gpsStartingLatLong: {
            lat: 52.21485,
            lng: 0.1408
        },
        gpsMovementRange: 0.00005, // This decimal point indicates how far
        gpsMovementSpeed: 5.0, // Set this value higher than the allowable
        // speed limit in order to cause a speed
        // violation,
        gpsAccuracy: 3, //  Accuracy in meters
        gpsQuality: 1, // Change this value to indicate a different
        // GPS quality: X < 1         - excellent
        //              2 <= X < 5    - good
        //              5 <= X < 10   - moderate
        //              10 <= X < 20  - fair
        //              X => 20       - poor
        interval: 100,
        gpsGetInfoErrorThreshold: 4
    };

    _intervalId = null;
    _errorIncrementer = 0;

    /**
     * @return {boolean} True if this locator instance is available, (if 'gps' tracing is set to 10 or above)
     */
    isAvailable() {
        return isTracing('gps', 5) || !navigator.geolocation;
    }

    get name() {
        return 'Debug Locator';
    }

    getOptions() {
        return [
            {
                key: 'gpsMovementSpeed',
                value: this.options.gpsMovementSpeed,
                label: 'Speed',
                type: 'number'
            },
            {
                key: 'gpsQuality',
                value: this.options.gpsQuality,
                label: 'Quality',
                type: 'number'
            },
            {
                key: 'gpsAccuracy',
                value: this.options.gpsAccuracy,
                label: 'Device Accuracy',
                type: 'number'
            },
            {
                key: 'failureProbability',
                value: this.options.failureProbability * 100,
                label: 'Failure Probability',
                type: 'number'
            }
        ];
    }

    setOptions(options) {
        this.options = { ...this.options, ...options };
        if (options['failureProbability'] !== undefined) this.options.failureProbability /= 100;
    }

    /**
     * Gets a simulated current position of the device
     * @returns {Promise<GeolocationPosition>}
     */
    async getPosition() {
        if (Math.random() > 1 - this.options.failureProbability) {
            // We've simulated a failure so call the errorCallback
            throw new Error('Debug Locator simulated error');
        } else {
            // We've simulated a success so call the successCallback
            return this._getNewPosition();
        }
    }

    async startTracking(options = {}) {
        if (this._intervalId === null) {
            this.options = { ...this.options, ...options };
            const { interval } = this.options;

            // explicitly control interval at which GPS points are returned
            this._intervalId = setInterval(this._timerTick, interval);
        }
    }

    stopTracking() {
        if (this._intervalId !== null) {
            clearInterval(this._intervalId);
            this._intervalId = null;
            this.watcher = null;
            this._prevGps = null;
        }
    }

    _timerTick = () => {
        if (Math.random() > 1 - this.options.failureProbability) {
            this._errorIncrementer += 1;

            if (this._errorIncrementer === this.options.gpsGetInfoErrorThreshold) {
                try {
                    this.handleTrackingError(new Error('Debug Locator: simulated error'));
                } catch (err) {
                    console.error(`Debug Locator: Error handling tracking error`, err);
                }
            }
        } else {
            // We've simulated a success so call the successCallback
            try {
                this._errorIncrementer = 0;
                const position = this._getNewPosition();
                this.handleNewPosition(position);
            } catch (err) {
                console.error(`Debug Locator: Error generating new position`, err);
            }
        }
    };

    _getNewPosition() {
        const gps = this._generateGpsData();
        const position = {
            coords: {
                latitude: gps.trackPoint.position.latitude,
                longitude: gps.trackPoint.position.longitude,
                altitude: gps.trackPoint.position.altitude,
                //accuracy: gps.trackPoint.precision.hdop,
                hdop: gps.trackPoint.precision.hdop,
                heading: gps.trackPoint.velocity.heading,
                speed: gps.trackPoint.velocity.groundSpeed
            },
            timestamp: new Date(gps.trackPoint.utc).getTime()
        };

        this.positionLog.add(position);
        return position;
    }

    _generateGpsData() {
        const { gpsStartingLatLong, gpsMovementRange, gpsQuality, gpsMovementSpeed } = this.options;

        // If no previous point was generated, then use the starting
        const gpsLatLng = this._previousGeneratedLatLong
            ? new LatLng(
                  this._previousGeneratedLatLong.lat + Math.random() * gpsMovementRange,
                  this._previousGeneratedLatLong.lng + Math.random() * gpsMovementRange
              )
            : new LatLng(gpsStartingLatLong.lat, gpsStartingLatLong.lng);

        const gpsData = {
            status: {
                permitted: true,
                valid: true
            },
            trackPoint: {
                position: {
                    latitude: gpsLatLng.lat,
                    longitude: gpsLatLng.lng,
                    altitude: 0.0
                },
                utc: new Date().getTime(),
                precision: { hdop: gpsQuality },
                velocity: {
                    groundSpeed: gpsMovementSpeed,
                    heading: 0.0
                }
            }
        };

        // Keep track of this coordinate so we can generate the next
        this._previousGeneratedLatLong = gpsLatLng;

        return gpsData;
    }
}
