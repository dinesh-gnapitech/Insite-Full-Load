import PositionLog from './positionLog';
import EventsMixin from 'myWorld/base/eventsMixin';

export class Locator {
    static {
        Object.assign(this.prototype, EventsMixin);
    }

    /**
     * True if this type of locator is available in the current platform
     * @type {boolean}
     */
    static get isSupported() {
        return true;
    }

    /**
     * Abstract class to be used as base for classes representing  a locator device
     * For example, a USB GPS or the browser/os wifi geolocation
     * Subclasses can optionally implement a getOptions() method that when provided should return a list of {key,value,label,type}
     * @param {locatorOptions} options
     */
    constructor(options) {
        if (!this.constructor.isSupported)
            throw new Error(
                `Can't instantiate '${this.constructor.name}' as not available in this plaform`
            );
        this.options = { ...this.constructor.options, ...options };

        /**
         * @type {PositionLog}
         */
        this.positionLog = new PositionLog({ nValuesAvg: 5 });
    }

    /**
     * Localised name of locator/device
     * @type {string}
     */
    get name() {
        throw new Error(`Missing implementation of name in '${this.constructor.name}'`);
    }

    /**
     * Current accuracy of the provided location (in meters)
     * @type {number|undefined}
     */
    get accuracy() {
        return this.positionLog.getAccuracy();
    }

    /**
     * Current dilution of precision (DOP) of the GPS device
     * describes the geometric strength of satellite configuration on GPS accuracy
     * @type {number|undefined}
     */
    get dop() {
        return this.positionLog.getDop();
    }

    /**
     * @return {boolean} True if this locator instance is available
     */
    isAvailable() {
        return true;
    }

    /**
     * @returns {boolean|string} True if locator/device is ready, a message if not
     */
    async isReady() {
        if (this.isAvailable()) return false;

        try {
            await this.getPosition();
            return true;
        } catch (error) {
            return error.message || 'geolocation_generic_error';
        }
    }

    handleNewPosition = position => {
        this._lastPosition = position;
        this.positionLog.add(position);
        this.fire('position-changed', { position });
    };

    handleTrackingError = error => {
        this.fire('tracking-error', { error });
    };

    handleDeviceHeading = heading => {
        this.fire('heading-changed', { heading });
    };

    handleAccuracy = (horizontalAccuracy, verticalAccuracy) => {
        this.fire('accuracy-changed', { horizontalAccuracy, verticalAccuracy });
    };

    /**
     * Get current position of the device
     * @returns {Promise<GeolocationPosition>}
     */
    getPosition() {
        throw new Error(`Missing implementation of 'getPosition' in '${this.constructor.name}'`);
    }

    /**
     * Starts tracking position of the device and registers handlers that will be called automatically each time the position of the device changes
     * @param {trackingOptions} options
     */
    startTracking() {
        throw new Error(`Missing implementation of 'startTracking' in '${this.constructor.name}'`);
    }

    /**
     * Stop tracking location
     */
    stopTracking() {
        throw new Error(`Missing implementation of 'stopTracking' in '${this.constructor.name}'`);
    }
}

/**
 * See {@link https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition}
 * @typedef {object} GeolocationPosition
 */

export default Locator;
