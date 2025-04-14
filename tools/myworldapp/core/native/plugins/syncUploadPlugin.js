// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import {
    localisation,
    trace as mywTrace,
    confirmationDialog,
    Plugin,
    EventsMixin,
    Util
} from 'myWorld-client';
import { displayErrorAlert, showSyncError } from '../base';

const trace = (level, ...msgs) => mywTrace('sync', level, 'UploadPlugin:', ...msgs);

/**
 * @class Plugin which provides local changes upload functionality to the application<br/>
 * Optionally sets up a periodically run of the upload <br/>
 * Adds an image and label to the status bar which will indicate status.
 * @extends {Plugin}
 */
export class SyncUploadPlugin extends Plugin {
    static {
        this.include(EventsMixin);

        this.mergeOptions({
            autoUploadInterval: null, // interval (in seconds) between checking for local changes and uploading them. A value of null or 0 means no automatic checking for updates.
            showLabel: false, //if true shows a label alongside the notification icon
            promptForLogin: true //if true, asks the user for credentials if not already logged in to master server
        });
    }

    static forOnlineApp = false;

    /**
     * @param  {Application} owner                       The application
     * @param  {object} [options]
     * @param  {boolean} [options.autoUploadInterval=null]  interval (in seconds) between checking for local changes and uploading them. A value of null or 0 means no automatic checking for updates.
     * @param  {boolean} [options.showLabel=false] if true shows a label alongside the notification icon
     * @param  {boolean} [options.promptForLogin=true] if true, asks the user for credentials if not already logged in to master server
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        const nativeServer = this.app.system.server;
        this._nativeServer = nativeServer;

        this.unsyncedChanges = false;

        ['startAutoUpload', 'runUpload', 'buttonClicked'].forEach(
            method => (this[method] = this[method].bind(this))
        );

        Promise.all([
            localisation.loadNamespace('app', 'nativeResources/locales'),
            this.app.ready
        ]).then(() => {
            if (!this.app.system.isReplicaDatabase()) return;

            this._setState('inactive');

            nativeServer.on('trackedFeatureChanged', this._setUnsyncedChanges.bind(this, true));
            nativeServer.on('upload-status-changed', this._uploadStatusChanged.bind(this));
            this.app.on('internetStatus-changed', this._onInternetStatusChanged, this);

            this._checkForUnsyncedChanges();

            this.startAutoUpload();
        });
    }

    //starts a timer for running auto uploads - keeps trying to upload even if recent error
    startAutoUpload() {
        if (!this.options.autoUploadInterval) return;

        if (!this._applicationClosing) {
            this._timer = Util.timer({
                repeat: true,
                interval: this.options.autoUploadInterval * 1000,
                handler: this.runUpload,
                logErrors: false
            });
        }
    }

    //stops the timer for running auto uploads
    stopAutoUpload() {
        this._timer?.stop();
    }

    //checks for local changes if there any, runs the export and uploads
    runUpload() {
        if (this._alreadyUploading()) return;

        const masterDatasource = this.app.getDatasource('myworld').masterDs;

        this._setState('processing');

        this._uploadPromise = this._checkForUnsyncedChanges()
            .then(() => {
                if (!this.unsyncedChanges) {
                    trace(5, 'No local changes to upload');
                    return;
                }

                const p = this.options.promptForLogin
                    ? masterDatasource.ensureLoggedIn()
                    : Promise.resolve();
                return p.then(() => this._uploadTo(masterDatasource));
            })
            .then(() => {
                this._setState('inactive');
            })
            .catch(error => {
                console.log(error.stack);
                this._setState('error', error);
                throw error;
            })
            .finally(() => {
                this._uploadPromise = null;
            });
        return this._uploadPromise;
    }

    /*
     * Hook called by application when the users chooses to close it.
     */
    async applicationClosing() {
        // Disable any automatic triggering of upload
        this._timer?.stop();
        this._applicationClosing = true;

        const canClose = await this._onApplicationClosing();
        return canClose !== false;
    }

    /*
     * Uploads local changes to the given master datasource
     * @param  {myWorldDatasource} masterDatasource
     * @return {Promise}
     */
    async _uploadTo(masterDatasource) {
        trace(2, 'Uploading local changes to master');
        await this._nativeServer.uploadLocalChanges(masterDatasource);
        this._setUnsyncedChanges(false);
    }

    _uploadStatusChanged(e) {
        this._setState(e.status);
    }

    _setState(status, error) {
        if (status == this.runningStatus && error != this.lastError) return;
        trace(9, 'Status changed:', status, error);
        this.runningStatus = status;
        this.lastError = error;
        this._stateChanged();
    }

    _setLastError(error) {
        this.lastError = error;
        this._stateChanged();
    }

    _stateChanged() {
        this._notifyUser();
    }

    //calledn when the icon/label is clicked
    //either displays the current error information or runs an upload of local changes
    buttonClicked() {
        if (this.lastError) {
            this._displayAndClearError();
        } else {
            this.stopAutoUpload();
            this.runUpload()
                .catch(error => {
                    if (error === 'cancelled') {
                        // User cancelled upload
                        // Do nothing
                    } else {
                        this._setLastError(error);
                        return this._displayAndClearError();
                    }
                })
                .finally(this.startAutoUpload);
        }
    }

    displayErrorAlert(title, message, closeButtonText) {
        if (this.app.isHandheld) {
            return this.app.layout.displayErrorAlert(title, message, closeButtonText);
        } else {
            return displayErrorAlert(title, message, closeButtonText);
        }
    }

    displayConfirmationDialog(options) {
        if (this.app.isHandheld) {
            return this.app.layout.displayConfirmationDialog(options);
        } else {
            const dialog = confirmationDialog(options);
            return dialog.confirmPromise;
        }
    }

    async _displayAndClearError() {
        await showSyncError(this.lastError);
        this._setState('inactive');
    }

    _alreadyUploading() {
        return this._nativeServer.isUploadingLocalChanges();
    }

    async _checkForUnsyncedChanges() {
        const hasChanges = await this._nativeServer.hasChangesToExport();
        this._setUnsyncedChanges(hasChanges);
    }

    _setUnsyncedChanges(hasUnsyncedChanges) {
        if (hasUnsyncedChanges != this.unsyncedChanges) {
            this.unsyncedChanges = hasUnsyncedChanges;
            this._stateChanged();
        }
    }

    //informs the user by updating the icon and label to reflect the current state
    _notifyUser() {
        let statusClass = 'inactive';
        let statusLabel = 'no_changes_status_label';
        let iconName = 'autoUpload.svg';
        let message;
        let active;

        if (this.lastError) {
            active = true;
            statusClass = 'error';
            statusLabel = 'error_status_label';
            message = this.msg('error_status_label');
        } else if (this.runningStatus == 'processing' || this.runningStatus == 'uploading') {
            active = true;
            statusClass = 'processing';
            iconName = 'autoUploadProcessing.gif';
            statusLabel =
                this.runningStatus == 'processing'
                    ? 'processing_status_label'
                    : 'uploading_status_label';
        } else {
            // this.runningStatus should be 'inactive'
            if (this.unsyncedChanges) {
                statusClass = 'changes';
                statusLabel = 'changes_status_label';
                active = true; //don't want to show a message but want icon to be visible (necessary for phone layout)
            }
        }
        const stateIcon = $('<img>', {
            class: `sync-plugin-icon ${statusClass}`,
            src: `nativeResources/images/${iconName}`
        });
        this.app.notifyUser({
            plugin: this,
            icon: stateIcon,
            stateLabel: this.options.showLabel ? this.msg(statusLabel) : '',
            message,
            active,
            title: this.msg('notification_title'),
            onClick: this.buttonClicked
        });
    }

    //called when internet status changes
    //suspends or resumes the auto upload timer
    _onInternetStatusChanged(ev) {
        if (!this._timer) return;

        if (!this.app.hasInternetAccess) {
            this._timer.suspend();
        } else {
            this._timer.resume();
        }
    }

    /*
     *
     * @return {Promise} resolves when the application can close
     */
    _onApplicationClosing() {
        let uploadPromise;
        if (this.lastError) {
            return showSyncError(this.lastError);
        } else if (this._uploadPromise) {
            // Upload requested by the plugin
            return this._warnAboutRunningSync(this._uploadPromise);
        } else if (this._nativeServer.isUploadingLocalChanges()) {
            // Upload requested by external code
            uploadPromise = this.runUpload(); // Get the running promise
            // We can't add any error handling here because it could clash
            // with any handling set up by whatever code invoked the upload.
            // We can't wait for the other code's error handling because we don't have
            // the promise which includes the error handling.
            // The best we can do is wait for the upload to finish and then close the
            // application (so any error handling set up by the other code probably won't run...)
            return this._warnAboutRunningSync(uploadPromise);
        } else {
            if (this.unsyncedChanges) {
                if (this.app.hasInternetAccess && this.options.autoUploadInterval) {
                    // We try to sync now but allow user to cancel
                    uploadPromise = this._runUploadOnApplicationClosing();
                    return this._warnAboutRunningSync(uploadPromise);
                } else {
                    return this._warnAboutUnsyncedChanges();
                }
            }
        }
        return Promise.resolve();
    }

    _warnAboutRunningSync(uploadPromise) {
        uploadPromise.catch(() => {}); // Ignore any errors - we assume they're handled elsewhere

        const alertPromise = this.displayErrorAlert(
            this.msg('upload_running_title'),
            [this.msg('upload_running_desc1'), this.msg('upload_running_desc2')],
            this.msg('cancel')
        );

        return Promise.race([alertPromise, uploadPromise]);
    }

    _warnAboutUnsyncedChanges() {
        return this.displayConfirmationDialog({
            title: this.msg('local_changes_title'),
            msg: this.msg('local_changes_message'),
            okBtnText: this.msg('continue')
        });
    }

    _runUploadOnApplicationClosing() {
        return this.runUpload().catch(error => {
            if (error !== 'cancelled') {
                this._setState('error', error);
                return showSyncError(error);
            }
        });
    }
}
