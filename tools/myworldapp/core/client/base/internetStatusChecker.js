// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { MywClass } from 'myWorld/base/class';

export class InternetStatusChecker extends MywClass {
    /**
     * @class Provides the user (and the application) with information about the internet connection status.<br/>
     * Adds a background "process" that checks that status. <br/>
     * Informs the application about any changes in status which will then trigger the internetStatus-changed event.
     * Url of image used to check connection can be overridden via the 'core.internetStatus.imgUrl' setting
     * Interval for check can be overridden via the 'core.internetStatus.interval' setting
     * @param  {Application} app                       The application
     * @constructs
     * @extends {MywClass}
     */
    constructor(app) {
        super();
        this.app = app;
        this._mapChanged = false;
        const settings = app.system.settings;

        //Variable to hold the value of the min and max intervals if its configured in the database settings table
        this.initialInterval = settings['core.internetStatus.interval'] * 1000 || 5000;
        this._imgUrl =
            settings['core.internetStatus.imgUrl'] ||
            'https://www.google.com/images/google_favicon_128.png';
        this.maxInterval = settings['core.maxNetworkCheckInterval'] * 1000 || 60000;

        this.currentInterval = app.options.internetStatusIntervalCheck ? this.initialInterval : 0;
        this.startInternetStatusCheck();

        //some browsers fire online/offline events which can help us detect a change sooner than waiting for the timeouts
        window.addEventListener('online', this.checkInternetStatus.bind(this));
        window.addEventListener('offline', this.setStatus.bind(this, false));

        //The mapChanged flag is set when the map is panned or zoomed.
        this.app.map.on('moveend', () => {
            this._mapChanged = true;
            //this.currentInterval is reset if it has increased beyond the initial value and the network check is triggered.
            if (this.currentInterval > this.initialInterval) {
                this.currentInterval = this.initialInterval;
                clearTimeout(this._timeoutHandle);
                this.startInternetStatusCheck();
            }
        });
    }

    setStatus(newStatus) {
        this.app.setInternetStatus(newStatus);
        this.app.database.setInternetStatus(newStatus);
    }

    /**
     * This method triggers the checkInternetStatus
     * It recurses after the time defined by this.currentInterval
     * If it detects no action, then the time interval after which it conducts the check is
     * doubled.
     * @private
     */
    startInternetStatusCheck() {
        this.checkInternetStatus();
        if (this._mapChanged) {
            this._mapChanged = false; //Resets the _mapChanged flag so it can look for other map changed events
        } else {
            //Since there was no action, the time interval is doubled untill it hits the maxInterval
            this.currentInterval = Math.min(this.maxInterval, this.currentInterval * 2);
        }
        if (this.currentInterval) {
            //triggers recursion to this method after the interval set by the value of this.currentInterval
            this._timeoutHandle = setTimeout(
                this.startInternetStatusCheck.bind(this),
                this.currentInterval
            );
        }
    }

    /**
     * This method stops the checkInternetStatus
     * It clears the setTimeout loop and should be called when this is no longer useful
     */
    stopInternetStatusCheck() {
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
            this._timeoutHandle = null;
        }
        this._imgDiv?.remove();
    }

    /**
     * Checks whether the internet is accessible
     */
    checkInternetStatus() {
        if (!this._imgDiv) {
            //Creating the container for the image loaded to check the internet connection
            this._imgDiv = $('<div id="imageForNetworkDetector" style="display: none"></div>');
            $('body').append(this._imgDiv);
        }
        //Refresh the image for the Network Detector function
        const imgDiv = this._imgDiv;
        imgDiv.children('img').remove();
        imgDiv.append('<img/>');
        imgDiv
            .children('img')
            .prop('src', this._imgUrl + '?' + Math.random())
            .on('load', () => {
                //if the image was loaded, it means we have internet access
                this.setStatus(true);
            })
            .on('error', () => {
                //if the image load produced an error, it means we do not have internet access
                this.setStatus(false);
            });
    }
}

export default InternetStatusChecker;
