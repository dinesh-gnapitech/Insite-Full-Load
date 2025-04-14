// Copyright: IQGeo Limited 2010-2023
import {
    localisation,
    trace as mywTrace,
    Util,
    Plugin,
    EventsMixin,
    Dialog,
    confirmationDialog
} from 'myWorld-client';
import $ from 'jquery';
import { formatFileSize, showSyncError } from '../base';
import { SyncProgressDialog } from '../sync';

const trace = (level, ...msgs) => mywTrace('sync', level, 'DownloadPlugin:', ...msgs);

/**
 * @class Provides sync download (and apply) functionality to the application<br/>
 * Adds a background "process" to periodically run the sync. <br/>
 * Adds an image and label to the status bar which will indicate status.
 * @extends {Plugin}
 */
export class SyncDownloadPlugin extends Plugin {
    static {
        this.include(EventsMixin);

        this.mergeOptions({
            autoCheckInterval: 30 * 60, // interval (in seconds) between checking for updates. A value of null or 0 means no automatic checking for updates.
            autoPrompt: false, //automatically pop-up a dialog when updates become available
            autoDownload: false, //automatically download packages in background
            autoApply: false, //automatically apply downloaded data-only packages in background. Requires autoDownload to be true.
            showLabel: false, //show a label alongside the notification icon
            promptForLogin: true //ask the user for credentials if not already logged in to master server
        });

        this.prototype.statusCssClass = {
            error: 'error',
            no_updates: 'inactive',
            updates_available: 'changes',
            checking: 'checking',
            syncing: 'processing',
            downloading: 'processing',
            offline: 'inactive'
        };
    }

    static forOnlineApp = false;

    /**
     * @param  {Application} owner                       The application
     * @param  {object} options
     * @param  {number}[options.autoCheckInterval=30*60] interval (in seconds) between checking for updates. A value of null or 0 means no automatic checking for updates.
     * @param  {boolean} [options.autoPrompt=false] automatically pop-up a dialog when updates become available
     * @param  {boolean} [options.autoDownload=false] automatically download packages in background
     * @param  {boolean} [options.autoApply=false] automatically apply downloaded data-only packages in background. Requires autoDownload to be true.
     * @param  {boolean} [options.showLabel=false] show a label alongside the notification icon
     * @param  {boolean} [options.promptForLogin=true] ask the user for credentials if not already logged in to master server
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        const nativeServer = this.app.system.server;
        this._setState('no_updates');

        ['checkForUpdates', '_sync', '_labelClick'].forEach(
            method => (this[method] = this[method].bind(this))
        );

        Promise.all([
            nativeServer.getSyncEngine(),
            localisation.loadNamespace('myw.app', 'nativeResources/locales'),
            this.app.ready
        ]).then(([engine]) => {
            this._engine = engine;
            this.startCheckingForUpdates(true);
        });

        this.app.on('internetStatus-changed', this._onInternetStatusChanged, this);
    }

    /**
     * Starts checking for updates on the interval specified in options
     * If an interval was not specified it does nothing
     * @param  {boolean} immediate Whether to do an immediate check or only after the elapsed time
     */
    startCheckingForUpdates(immediate) {
        if (!this.options.autoCheckInterval) return;

        this._timer = Util.timer({
            immediate: immediate || false,
            repeat: true,
            interval: this.options.autoCheckInterval * 1000,
            handler: this.checkForUpdates,
            logErrors: false
        });
    }

    /**
     * Stops checking for updates
     */
    stopCheckingForUpdates() {
        this._timer.stop();
    }

    /**
     * Checks if there are any sync updates to download
     * @param  {boolean} [promptUser=false] Whether to open the dialog when there are updates
     * @return {Promise} If there updates, resolves after checking or if after the sync finished if the user chose to do it
     */
    async checkForUpdates(promptUser) {
        //we don't want to replace the task list when we are already checking or syncing
        // sync will check for updates when it finishes

        if (['checking', 'syncing', 'downloading'].includes(this._state)) return; //don't interfere with current operation

        trace(5, 'Checking for updates');
        const { autoDownload, autoApply, autoPrompt } = this.options;
        this._promptingUser = promptUser || autoPrompt;
        this._setState('checking');
        this._failedToCheck = false;

        try {
            const tasks = await this._getSyncTasks();
            if (!tasks.find(task => task.type === 'applyUpdate')) {
                this._setState('no_updates');
                return;
            }
            this._setState('updates_available');
            if (promptUser) {
                //user clicked label -> show dialog
                await this._askToSyncWithinUserTransaction(tasks, false);
            } else if (autoDownload && tasks.find(task => task.type === 'download')) {
                //timer triggered and there are packages to download
                await this._downloadUpdates();
            } else if (autoApply) {
                //timer triggered and there are packages available to apply
                await this._applyInBackground();
            } else if (autoPrompt) {
                //timer triggered and there are syncs available (but no downloads to do first)
                await this._askToSyncWithinUserTransaction(tasks, true);
            }
        } catch (error) {
            console.warn('Error checking for updates:', error);
            trace(8, 'Error checking for updates:', error.stack);
            this._failedToCheck = true;
            if (promptUser) {
                showSyncError(error);
            }
            this._setState('no_updates');
        }
    }

    /**
     * Obtains from the server the available updates and calculates a list of tasks to download and apply them
     * Stores the list of tasks in this._taskList
     * @returns {Promise<taskList>}
     * @private
     */
    async _getSyncTasks() {
        const masterDatasource = this.app.getDatasource('myworld').masterDs;
        if (this.options.promptForLogin) await masterDatasource.ensureLoggedIn();
        const tasks = await this._engine.getAvailableUpdates();
        trace(6, `Tasks: ${tasks.map(t => t.type)}`);
        return tasks;
    }

    /**
     * Opens a dialog for the user to confirm he wants to proceed with a sync
     * Handles calling database.beginUserTransaction() to ensure there' no clash with current user operations like editing a feature
     * Called after a check for updates if there are any related tasks to perform
     * @return {Promise} Resolves when the user closes the dialog or the (sync) operations finish executing
     * @private
     */
    async _askToSyncWithinUserTransaction(tasks, waitOnUserTransaction = false) {
        if (!tasks.length) return;

        const syncMsg = this.msg('sync_process');
        let startedUserTransaction = false;
        try {
            await this.app.database.beginUserTransaction(syncMsg, waitOnUserTransaction);
            startedUserTransaction = true;
            await this._askToSync(tasks);
        } catch (error) {
            console.warn(error);
            if (!waitOnUserTransaction) {
                //show user why sync couldn't be started
                new Dialog({ contents: error.message });
            }
        } finally {
            if (startedUserTransaction) this.app.database.endUserTransaction();
        }
    }

    /**
     * Opens a dialog for the user to confirm he wants to proceed with a sync
     * Called after a check for updates if there are any related tasks to perform
     * @return {Promise} Resolves when the user closes the dialog or the (sync) operations finish executing
     * @private
     */
    async _askToSync(tasks) {
        const applyTasks = tasks.filter(task => task.type === 'applyUpdate');
        const size = formatFileSize(applyTasks.reduce((total, task) => total + task.size, 0));
        const downloads = tasks.some(t => t.type === 'download');
        const msgId = downloads ? 'download_apply_now' : 'apply_now';

        const dialog = confirmationDialog({
            title: this.msg('updates_available_title', { count: applyTasks.length, size }),
            msg: this.msg(msgId),
            confirmCallback: this._sync
        });
        await dialog.confirmPromise;
    }

    //download updates, and update the UI
    async _downloadUpdates() {
        this._timer.suspend();
        try {
            this._setState('downloading');
            await this._engine.downloadUpdates();

            this._setState('updates_available');
            await this.checkForUpdates();
        } finally {
            //errors are handled by checkForUpdates
            //but we want to ensure the timer continues
            this._timer.resume();
        }
    }

    /**
     * Executes the sync process in the background, inside a user transaction
     */
    async _applyInBackground() {
        trace(5, `Syncing in background`);
        let startedUserTransaction = false;
        const syncMsg = this.msg('sync_process');
        try {
            await this.app.database.beginUserTransaction(syncMsg, true);
            startedUserTransaction = true;
            await this._sync({ dataOnly: true, showProgress: false });
        } catch (error) {
            console.warn(error);
        } finally {
            if (startedUserTransaction) this.app.database.endUserTransaction();
        }
    }

    /**
     * Executes the sync process
     * @param {object} options
     * @param {boolean} [options.showProgress=true] If true progress is shown in dialog
     * @param {boolean} [options.dataOnly=false] If true only data packages are applied, remaining packages are ignored
     */
    async _sync(options = {}) {
        const { showProgress = true, dataOnly } = options;
        this._setState('syncing');
        trace(3, `Syncing... ${JSON.stringify(options)}`);

        if (showProgress) this._showProgressDialog(true);

        try {
            const result = await this._engine.downloadAndApplyUpdates({ dataOnly });
            trace(3, `Sync finished: ${JSON.stringify(result)}`);
            const { installedUpdate, pendingNonData } = result;
            this._setState(pendingNonData ? 'updates_available' : 'no_updates');

            if (installedUpdate) this._refresh();

            if (pendingNonData) {
                //background sync is done, but there are still non-data updates to apply
                this.stopCheckingForUpdates();
                if (this.options.autoPrompt) {
                    const tasks = await this._getSyncTasks(); //check for updates again, refreshing the task list
                    await this._askToSync(tasks); //and prompt the user
                }
            } else if (this._syncHadNonDataUpdates()) {
                return this._reloadPage();
            } else {
                //data only - no reload required
                this._hideProgressDialog();
            }
        } catch (error) {
            console.warn('Error while running sync:', error);
            this._setState('error', error);
            if (showProgress) return this._showSyncErrorDialog(error.message ?? error);
        }
    }

    async _refresh() {
        //  Check if the current delta has been deleted
        const currentDelta = this.app.getDelta();
        if (currentDelta) {
            const ds = this.app.database.getDatasource('myworld');
            await ds.initialized;
            const deltaOwner = await ds.getFeatureByUrn(currentDelta).catch(error => null);
            if (!deltaOwner) {
                this.app.setDelta('');
            }
        }
        this.app.map.redraw();
        this.app.fire('nativeApp-sync-complete');
    }

    /**
     * @returns {boolean} true if latest sync includes non-data updates and therefore a page reload is required
     */
    _syncHadNonDataUpdates() {
        const updateFiles = this._engine.update.getUpdateFiles();
        delete updateFiles.features;
        const fileArray = Object.values(updateFiles);
        // check if there are any changes apart from features
        let toReload = !!fileArray.find(element => element.length);
        if (this._engine.isCodePackageInstalled()) toReload = true;
        return toReload;
    }

    async _reloadPage() {
        await this.app.saveState();
        //ENH: show a message saying sync is complete and page will reload
        await Util.delay(3000);
        window.location.reload();
    }

    _setState(statusId, error) {
        trace(8, `State changed to '${statusId}'`);
        this._state = statusId;
        this._lastError = error;
        let notificationMessage;

        // if prompting user to sync, we don't want a notification pop-up
        if (statusId == 'updates_available' && !this._promptingUser) {
            notificationMessage = this.msg('notification_updates_available');
        }

        let iconName = 'syncDown.svg';
        let className = `sync-plugin-icon ${this.statusCssClass[statusId]}`;
        if (this.statusCssClass[statusId] === 'processing') {
            iconName = 'syncDownProcessing.gif';
        }

        this.showNotification(statusId, notificationMessage, iconName, className);
    }

    //handler for when user clicks the icon/label
    async _labelClick() {
        const state = this._state;
        const isIdle = ['no_updates', 'updates_available', 'error'].includes(state);

        if (!this.app.hasInternetAccess) {
            this._setState('offline');
            this.showNotification('offline', this.msg('status_offline'));
        } else if (isIdle) {
            this.stopCheckingForUpdates();
            await this.checkForUpdates(true);
            this.startCheckingForUpdates();
        } else if (state == 'checking') {
            //do nothing, already checking
            //ENH: should set to "openDialog" in checkForUpdates
        } else {
            //downloading - we know it's downloading because label can't be clicked if it's doing
            // anything else
            this._showProgressDialog(false);
        }
    }

    showNotification(statusId, message, iconName, iconClassName) {
        const props = {
            plugin: this,
            stateLabel: this.options.showLabel ? this.msg(`status_${statusId}`) : '',
            message,
            title: this.msg('notification_title'),
            onClick: this._labelClick
        };

        if (iconName) {
            props.icon = $('<img>', {
                class: iconClassName,
                src: `nativeResources/images/${iconName}`
            });
        }

        this.app.notifyUser(props);
    }

    /*
     * Shows the sync progress dialog
     * @param  {boolean} cancelable Whether the user should be able to cancel the sync or not
     */
    _showProgressDialog(cancelable) {
        this._progressDialog?.destroy();
        this._progressDialog = new SyncProgressDialog({
            engine: this._engine,
            dismissable: !cancelable,
            cancelable
        });
    }

    _hideProgressDialog() {
        this._progressDialog?.close();
    }

    _showSyncErrorDialog(message) {
        const dialog = confirmationDialog({
            title: this.msg('sync_error_title'),
            msg: message ?? this.msg('sync_error_title'),
            okBtnText: this.msg('reload_btn_label'),
            confirmCallback() {
                window.location.reload(true);
            }
        });
        return dialog.confirmPromise;
    }

    _onInternetStatusChanged(ev) {
        if (!this._timer) return;

        if (!this.app.hasInternetAccess) {
            this._setState('offline');
            this._timer.suspend();
        } else {
            this._setState('no_updates');
            if (this._failedToCheck) {
                //last time failed to check, so do an immediate check
                this.stopCheckingForUpdates();
                this.startCheckingForUpdates(true);
            } else {
                this._timer.resume();
            }
        }
    }
}
