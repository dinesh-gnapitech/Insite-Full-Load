// Copyright: IQGeo Limited 2010-2023
import { Error, MywClass, trace, confirmationDialog } from 'myWorld-base';
import { intersection } from 'underscore';
import { displayErrorAlert, formatFileSize, loginIfNecessary, nativeErrors } from '../base';
import { OnDemandExtractProgressDialog } from './onDemandExtractProgressDialog';
export { OnDemandExtractProgressDialog };

// Error used internally to indicate there are unsync'd local changes
const HasChangesError = Error.extend('HasChangesError');

export class OnDemandExtractRunner extends MywClass {
    static {
        this.prototype.messageGroup = 'OnDemandExtractRunner';

        this.mergeOptions({
            snapshotFilename: 'snapshot'
        });
    }

    constructor(owner, tableSetName, options) {
        super();
        this.owner = owner;
        this.app = owner.app;
        this._server = this.app.system.server;
        this._tableSetName = tableSetName;
        this._odeBoundaries = [];
        this._odeLayerNames = [];
        this.setOptions(options);

        this.app.map.layerManager.addCreateLayerHook(this._updateLayerOptions.bind(this));

        this.ready = this._getODEInformation();
        this.initialized = this.ready
            .then(this._updateLayerClipping.bind(this))
            .then(this._getRestServerFromApp.bind(this))
            .then(this._setUpEngine.bind(this));
    }

    async _setUpEngine() {
        this._engine = await this._server.getSyncEngine(this._restServer);
        this._engine.on('task-changed', this._onTaskStatus, this);
        this._engine.on('task-progress', this._showProgress, this);
    }

    _getRestServerFromApp() {
        const proxyDatasource = this.app.getDatasource('myworld');
        return proxyDatasource.masterDs.initialized.then(() => {
            this._restServer = proxyDatasource.masterDs.server;
        });
    }

    _onTaskStatus(ev) {
        const messageId = `task_status_${ev.statusId}`;
        const message = this.msg(messageId, ev.details);
        this._showMessage(message);
    }

    _showMessage(message) {
        if (this._dialog) {
            this._dialog.showMessage([message]);
        }
    }

    _showProgress(ev) {
        trace('ODE', 8, `${ev.taskId} ${ev.progress}`);
    }

    _doExtract(region) {
        return loginIfNecessary(this._restServer)
            .then(() => {
                console.log("Now we're definitely logged in...");
                return this._reallyExtract(region);
            })
            .catch(error => {
                if (error instanceof nativeErrors.AuthenticationError) {
                    // Try again - the user will be shown the login dialog
                    return this._doExtract(region);
                } else if (error == 'cancelled') {
                    // Login cancelled or download cancelled
                    // Ignore
                } else if (error instanceof nativeErrors.ODEDataModelChangedError) {
                    // ENH: Offer to go to sync page
                    return displayErrorAlert(
                        this.msg('data_model_changed_title'),
                        [
                            this.msg('data_model_changed_message'),
                            this.msg('data_model_changed_hint')
                        ],
                        this.msg('data_model_changed_button')
                    );
                } else {
                    this._displayError(error);
                }
            });
    }

    async _reallyExtract(region) {
        await this._engine
            .ensureImportDirectoryExists()
            .then(this._request.bind(this, region))
            .then(this._download.bind(this))
            .then(this._apply.bind(this))
            .then(this._restartTileServer.bind(this))
            .then(this._refreshMap.bind(this));
        return true;
    }

    _request(region) {
        return this._restServer.getOnDemandExtract(this._tableSetName, region);
    }

    _download(metadata) {
        const url = metadata.sourceUrl;
        const savePath = this._engine._importUpdateFilePath(this.options.snapshotFilename);
        const onProgress = this._getProgressHandler();
        console.log(`Starting download request: ${url}`);
        return this._restServer
            .downloadFile(url, savePath, 0, onProgress)
            .catch(error => {
                if (error instanceof nativeErrors.NetworkError) {
                    return this._handleDownloadNetworkError(error, metadata);
                } else {
                    throw error;
                }
            })
            .then(() => metadata);
    }

    _onProgress(progressInfo) {
        const total = progressInfo.total;
        const read = progressInfo.read;

        const percent = Math.floor((read * 100.0) / total);
        const details = this.msg('download_progress_details', {
            read: formatFileSize(read),
            total: formatFileSize(total),
            percent
        });
        this._showMessage(details);
    }

    _getProgressHandler() {
        let lastProgress = 0;
        return progressInfo => {
            const now = Date.now();
            if (progressInfo.read != progressInfo.total && now < lastProgress + 1000) {
                // Reduce number of UI updates to ensure UI can actually keep up
                return;
            }
            lastProgress = now;
            this._onProgress(progressInfo);
        };
    }

    _handleDownloadNetworkError(error, metadata) {
        // ENH: Some copied and modified from
        // RemoteDatabaseView._handleDownloadError()
        //ENH: implement auto retry ?
        // const autoRetryInterval = 10; // time in seconds - ENH: Make configurable?;

        const dialog = confirmationDialog({
            title: this.msg('download_error_title'),
            msg: error.message,
            okBtnText: this.msg('download_error_resume_button'),
            cancelBtnText: this.msg('download_error_cancel_button'),
            confirmCallback: () => this._download(metadata)
        });
        return dialog.confirmPromise.then(resume => {
            if (!resume) throw 'cancelled';
        });
    }

    _apply(metadata) {
        // savefile name construction duplicated from _download()
        const savefile = this._engine._importUpdateFilePath(this.options.snapshotFilename);
        return this._server.applyOnDemandExtract(
            savefile,
            this._engine,
            this.options.snapshotFilename,
            metadata
        );
    }

    _displayError(error) {
        // We expect this.lastError to be an error object, but it could
        // just be a string
        const message = error.message || error;
        console.log(error);

        return displayErrorAlert(
            this.msg('error_title'),
            [this.msg('error_desc'), message],
            this.msg('error_button')
        );
    }

    _deleteZipFile() {
        return this._engine._deleteZipFile(this.options.snapshotFilename);
    }

    _deleteExtract() {
        return this._server.deleteOnDemandExtract(this._metadata, this._engine);
    }

    async _doDeleteExtract() {
        try {
            await this._server
                .stopTileServer()
                .then(this._deleteExtract.bind(this))
                .then(this._deleteZipFile.bind(this));
            return true;
        } finally {
            await this._startTileServer()
                .then(this._refreshMap.bind(this))
                .then(this._clearFeatureSet.bind(this));
        }
    }

    _handleErrorFor(operation, error) {
        if (error instanceof HasChangesError) {
            // ENH: Offer to delete anyway
            return displayErrorAlert(
                this.msg('local_changes_title'),
                [this.msg('local_changes_message'), this.msg(`local_changes_hint_${operation}`)],
                this.msg('local_changes_button')
            );
        } else {
            this._displayError(error);
        }
    }

    _handleLocalChangesError(error) {
        if (error instanceof HasChangesError) {
            const myWorldDatasource = this.app.getDatasource('myworld');
            const uploadPromise = this.app.system.uploadLocalChanges(myWorldDatasource);
            if (uploadPromise) {
                return uploadPromise.catch(uploadError => {
                    console.log(uploadError);
                    // ENH: Perhaps we could show the upload error to the user?
                    throw error;
                });
            }
        }
        throw error;
    }

    hasExtract() {
        return this._server.countFeatures('myw_on_demand_extract').then(count => {
            this._count = count;
            return count > 0;
        });
    }

    /**
     * Run an ODE operation (either 'extract' or 'delete')
     * @param {Function} func   The operation to run
     * @param {string} operationId    The operation id
     * Handles opening and closing the progress dialog and handling of local changes.
     * The operation id is used to prefix some message IDs
     */
    async _runODEOperation(func, operationId) {
        this._dialog = new OnDemandExtractProgressDialog();
        const titleMessage = this.msg(`${operationId}_dialog_title`);
        const runningMessage = this.msg(`${operationId}_dialog_running`);
        this._dialog.show(titleMessage, [runningMessage]);
        return this.initialized
            .then(this._checkForLocalChanges.bind(this))
            .catch(this._handleLocalChangesError.bind(this))
            .then(func)
            .catch(this._handleErrorFor.bind(this, operationId))
            .finally(() => {
                this._dialog.close();
                this._dialog = null;
                return this.app.database.endUserTransaction();
            });
    }

    getExtract(region) {
        const msg = this.msg('on_demand_extract');
        return this.app.database
            .beginUserTransaction(msg)
            .then(() => this._runODEOperation(this._doExtract.bind(this, region), 'extract'));
    }

    deleteExtract() {
        return this._runODEOperation(this._doDeleteExtract.bind(this), 'delete');
    }

    _restartTileServer() {
        return this._server.stopTileServer().then(this._startTileServer.bind(this));
    }

    _refreshMap() {
        console.log('Refreshing map');
        this._updateODEBoundaries().then(() => {
            this.app.map.redraw();
        });
    }

    _clearFeatureSet() {
        this.app.setCurrentFeatureSet([]);
    }

    _startTileServer() {
        console.log('Refreshing map');
        return this._server.startTileServer();
        // TODO Better error handling if starting tile server fails?
    }

    _getODEInformation() {
        return this._getOnDemandLayerNames().then(this._getOnDemandExtractBoundaries.bind(this));
    }

    _updateODEBoundaries() {
        return this._getOnDemandExtractBoundaries().then(this._updateLayerClipping.bind(this));
    }

    _updateLayerClipping() {
        Object.values(this.app.map.layerManager.layers).forEach(layer => {
            if (this._isOnDemandTileLayer(layer.layerDef)) {
                layer.setClipGeometry(this._odeBoundaries);
            }
        });
    }

    _updateLayerOptions(layerDef) {
        if (this._odeBoundaries.length && this._isOnDemandTileLayer(layerDef)) {
            layerDef.options.clipGeometries = this._odeBoundaries;
        }
    }

    _isOnDemandTileLayer(layerDef) {
        return this._odeLayerNames.includes(layerDef.name) && layerDef.rendering === 'tilestore';
    }

    /**
     * Get a list of names of on-demand layers
     * @return {Promise<string[]>}  Promise for the results
     */
    _getOnDemandLayerNames(tableSetName) {
        return this._server.getLayerNamesForTableSet(this._tableSetName, true).then(layerNames => {
            this._odeLayerNames = layerNames;
        });
    }

    _getOnDemandExtractBoundaries() {
        return this._server
            .getFeatures('myw_on_demand_extract', {
                displayValues: false,
                includeLobs: false,
                includeGeoGeometry: true
            })
            .then(featureCollection => {
                this._odeBoundaries = featureCollection.features.map(f => f.geometry);
            });
    }

    _checkForLocalChanges() {
        return this._readMetadata().then(this._checkForUnsyncedChanges.bind(this));
    }

    async _readMetadata() {
        const fc = await this._server.getFeatures('myw_on_demand_extract');
        const metadata = fc.features.map(feature =>
            this._parseMetadata(feature.properties.properties)
        );
        this._metadata = this._mergeMetadata(metadata);
    }

    _parseMetadata(metadata) {
        try {
            return JSON.parse(metadata);
        } catch (e) {
            // TODO Better error handling?
            throw new Error(`Invalid JSON: ${e.message}`);
        }
    }

    _mergeMetadata(metadata) {
        const features = [...new Set(metadata.flatMap(m => m.features))];
        // TODO tile files will probably be handled differently...
        const tileFiles = [...new Set(metadata.flatMap(m => m.tileFiles))];
        return {
            features,
            tileFiles
        };
    }

    // Check for unsynced changes which relate to the On Demand Extract
    // Return a promise which is rejected if there are unsynced changes
    // and resolves if there aren't
    _checkForUnsyncedChanges() {
        return this._server.getFeatureTypesForExport().then(featureList => {
            const featureTypes = this._metadata.features;
            const commonFeatures = intersection(featureList, featureTypes);
            if (commonFeatures.length > 0) {
                throw new HasChangesError();
            }
        });
    }
}
