import $ from 'jquery';
import { Plugin } from 'myWorld-base';
import GPSStatusDialog from '../userLocation/gpsStatusDialog';
import { trace as mywTrace } from 'myWorld/base/trace';

const trace = mywTrace('gps');

/**
 * Notification message which can either contain a title and description or can be just a string
 * If the message is an object with a title, an alert icon is displayed after the title.
 * @typedef gpsStatusOptions
 * @property {boolean} [showLabel=false]    Show label alongside icon in status bar
 * @property {number} [gpsOfflineIntervalMs=0]
 * @property {number} [gpsPoorIntervalMs=0]
 * @property {number} [gpsStatusIntervalMs=5000]
 * @property {number} [accuracyThresholdMeters=20]
 * @property {number} [dopThreshold=5]
 * @property {string} [preferredLocatorKey] Last locator picked from the dialog
 */

export class GpsStatusPlugin extends Plugin {
    static {
        this.mergeOptions({
            showLabel: false, //if true shows a label alongside the notification icon
            gpsOfflineIntervalMs: 0, // offline interval threshold
            gpsPoorIntervalMs: 0, // poor interval threshold,
            gpsStatusIntervalMs: 5000,
            accuracyThresholdMeters: 20,
            dopThreshold: 5,
            preferredLocatorKey: undefined
        });
    }

    /**
     * @class Provides GPS status icon and dialog  <br/>
     * @param  {Application} owner                       The application
     * @param  {gpsStatusOptions} options These options will be merged with those defined in the 'core.plugin.gpsStatus' database setting
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        this.userLocation = this.app.userLocation;

        const dbOptions = this.app.system.settings['core.plugin.gpsStatus'] ?? {};
        this.options = { ...this.options, ...dbOptions };
        const { preferredLocatorKey, locatorOptions } = this.options;
        this.userLocation.setOptions({ preferredLocatorKey, locatorOptions });

        this.iconId = 'gps_status_icon';
        this.lastPosition = null;
        this.lastPositionGpsTime = null;
        this.lastPositionDeviceTime = null;
        this.currentGpsStatus = 'checking'; // 'inactive', 'checking' 'good', 'poor', 'error'

        this.positionArray = [];

        this.gpsLocatorDialog = null;
        this.nullPosQueue = 0;

        this._setupEventHandlers();
    }

    getState() {
        return {
            preferredLocatorKey: this._preferredLocatorKey,
            locatorOptions: this.userLocation.getLocatorOptions()
        };
    }

    setLocator(locator, options = {}) {
        this._preferredLocatorKey = locator?.key;
        this.userLocation.setLocator(locator, { ...options, setAsPreferred: true });
    }

    setGpsStatusInterval(intervalMs) {
        if (!this._gpsStatusIntervalId) {
            clearInterval(this._gpsStatusIntervalId);
        }
        this._gpsStatusIntervalId = setInterval(this._checkGpsStatus.bind(this), intervalMs);
    }

    _setupEventHandlers() {
        this.userLocation.on('tracking-started', () => {
            this.setGpsStatusInterval(this.options.gpsStatusIntervalMs);
        });
        this.userLocation.on('tracking-stopped', () => {
            if (this._gpsStatusIntervalId) clearInterval(this._gpsStatusIntervalId);
        });

        // Store gps position and position time when gps changes
        this.userLocation.on('location-changed', ({ position }) => {
            // NOTE: continue using gps position timestamp for timediff calc
            //       even though we've encountered a tablet (VON) that
            //       consistently gets old timestamps (~ 90 seconds old)
            //       the fix specific to that device is to ignore the gps
            //       timestamp and use the current time as the timestamp
            //       but that might introduce other errors down the road
            //       that we don't know about plus, in cases like with
            //       GPS Gate, we may continue to get same point over and
            //       over when puck is unplugged and we would not properly
            //       handle that case with the code change if this code
            //       change was made more broadly
            //       best option is to continue using gps timestamp
            this._addPositionToArray(position);

            const newPosTime = position.timestamp;

            if (this.lastPositionGpsTime === null || newPosTime > this.lastPositionGpsTime) {
                this.lastPositionGpsTime = newPosTime;
                this.lastPosition = position;
            }

            // record current device time when GPS point received
            this.lastPositionDeviceTime = Date.now();

            this._checkGpsStatus();
        });

        this.userLocation.on('tracking-error', ({ error }) => {
            //inform user of problem
            if (error.code === 1) this.app.message(this.app.msg('geolocation_not_authorised'));
            else console.error(`Generic user location tracking error: `, error);

            this._changeStatus('error');
        });

        // Handler when gps status changes
        this.userLocation.on('tracking-changed', evt => {
            this._changeStatus(this.userLocation.isTracking ? 'checking' : 'inactive');
        });
    }

    _addPositionToArray(pos) {
        if (this.positionArray.length > 4) {
            this.positionArray.pop();
        }

        this.positionArray.unshift(pos);
    }

    /*
     * Checks whether the gps is accessible
     */
    _checkGpsStatus() {
        let latestGpsStatus;
        const pos = this.lastPosition;
        const now = Date.now();
        const { gpsOfflineIntervalMs, gpsPoorIntervalMs, accuracyThresholdMeters, dopThreshold } =
            this.options;

        // use device time
        const timeSinceLastPoint = now - (this.lastPositionDeviceTime ?? now);

        trace(10, 'Checking GPS Status - Time since last point: ' + timeSinceLastPoint);

        const isNewPosition =
            !this._lastPositionCheckedTime ||
            this.lastPositionDeviceTime > this._lastPositionCheckedTime;

        if (gpsOfflineIntervalMs && timeSinceLastPoint > gpsOfflineIntervalMs) {
            latestGpsStatus = 'error';
            trace(9, 'Time since last point old.');
        } else if (gpsPoorIntervalMs && timeSinceLastPoint > gpsPoorIntervalMs) {
            latestGpsStatus = 'poor';
            trace(9, 'Time since last point getting old.');
        } else if (pos && isNewPosition) {
            // evaluate quality of position
            const { hdop, accuracy } = pos.coords;
            if (
                (accuracy && accuracy <= accuracyThresholdMeters) ||
                (hdop && hdop <= dopThreshold)
            ) {
                latestGpsStatus = 'good';
                trace(9, 'Got point of good quality.');
            } else {
                latestGpsStatus = 'poor';
                trace(9, 'Got point of weak quality.');
            }
        }

        // change gps status
        if (this.currentGpsStatus !== latestGpsStatus) {
            // don't change status if locator is null or status is not defined
            if (this.userLocation.activeLocator && latestGpsStatus) {
                this._changeStatus(latestGpsStatus);
            }
        }

        this._lastPositionCheckedTime = this.lastPositionDeviceTime;
    }

    _changeStatus(statusName) {
        trace(5, 'Changing GPS status to: ' + statusName);
        this.currentGpsStatus = statusName;
        this._fireUserNotification();
    }

    async showGpsLocatorDialog() {
        if (!this.gpsLocatorDialog) {
            this.gpsLocatorDialog = new GPSStatusDialog(this);
        }

        this.gpsLocatorDialog.open();
    }

    /*
     * Updates the 'traffic light' icon and label and sends it
     */
    _fireUserNotification() {
        const type = this.currentGpsStatus !== 'poor' ? 'ok' : 'alert';
        const iconClass = 'gps_' + this.currentGpsStatus;
        const label = 'gps_' + this.currentGpsStatus;
        const stateIcon = $('<span>', { class: iconClass, id: this.iconId });
        const stateLabel = this.msg(label);

        this._notifyUser(type, stateIcon, stateLabel);
    }

    _notifyUser(type, icon, stateLabel) {
        const notificationObj = {
            notificationType: type,
            plugin: this,
            icon,
            stateLabel: this.options.showLabel ? stateLabel : '',
            onClick: this.showGpsLocatorDialog.bind(this),
            title: this.msg('gps_status'),
            active: this.userLocation.isTracking
        };
        this.app.notifyUser(notificationObj);
    }
}

export default GpsStatusPlugin;
