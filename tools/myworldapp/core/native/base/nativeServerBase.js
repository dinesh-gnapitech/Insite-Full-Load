// Implements MyWorld Server interface for the native apps
// Copyright: IQGeo Limited 2010-2023
/* globals platform */
import myw, { MywClass, EventsMixin } from 'myWorld-base';
import { SettingsController, UserController, ApplicationController } from './controllers';
import { nativeErrors } from './utils';

/**
 * Server used by provisioning and home pages
 */
export class NativeServerBase extends MywClass {
    static {
        this.prototype.messageGroup = 'NativeServer';
        this.include(EventsMixin);
    }

    /**
     * Initialize a new Database instance
     * @param  {MyWorldDatabase}   mywDatabase
     */
    constructor(mywDatabase, engines = {}) {
        super();
        this._runningUpload = null;
        this.engines = engines;

        this.initialized = this._doInitialization(mywDatabase).then(() => this);
    }

    async _doInitialization(mywDb) {
        if (!mywDb) {
            const message = this.msg('no_active_database');
            const error = new nativeErrors.OpenDatabaseError(message);
            return Promise.reject(error);
        }

        if (this.engines.appStatePersistenceManager) {
            this.appStatePersistenceManager = this.engines.appStatePersistenceManager(mywDb.name);
        }

        this._db = mywDb;

        await mywDb.initialized;

        this._extractedLayerNames = await this.getLayerNamesForTableSet(mywDb.tablesetName);
        this._dd = mywDb.dd;
        this.view = this._db.view();
    }

    login(credentials) {
        return Promise.resolve();
    }

    /**
     * Returns the username of the currently logged user
     */
    getCurrentUsername() {
        if (myw.currentUser) return myw.currentUser.username;
        return '';
    }

    getSchemaVersion() {
        return this._db.getVersionStamp('myw_schema');
    }

    getModuleInfo() {
        //myw.versionInfo is populated in init.native.js setVersionInfo()
        return myw.versionInfo?.module_info ?? {};
    }

    /**
     * Returns whether a layer is included in the current extract or not
     * @param  {layerDefinition}  layerDef
     * @return {Boolean}
     */
    isLayerExtracted(layerDef) {
        const dsName = layerDef.datasource;
        if (!this._tablesetName) {
            //in a replica with no tableset, myworld layers are extracted but
            //external ones are not
            return dsName == 'myworld';
        } else {
            return this._extractedLayerNames.includes(layerDef.name);
        }
    }

    hasChangesToExport() {
        return this._db.hasChangesToExport();
    }

    async getFeatureTypesForExport() {
        const version = await this._db.getVersionStamp('data');
        return this._db.getChangedFeatureTypesSince(version - 1);
    }

    deleteAllFrom(tableName, schema) {
        return this._db.runWithinWriteLock(() => this._db.table(tableName, schema).deleteAll());
    }

    isMasterDatabase() {
        return false;
    }

    /**
     * Is the local database initialized as replica?
     * @return {Boolean}
     */
    isReplicaDatabase() {
        return this._db.isReplica();
    }

    isLoggedIn() {
        return Promise.resolve(true);
    }

    close() {
        return this._db.close();
    }

    getSettings() {
        const settingsController = new SettingsController(this.view);
        return settingsController.get();
    }

    getUserPermissions() {
        const userController = new UserController(this.view);
        return userController.getUserPermissions(this.getCurrentUsername());
    }

    getAllApplications() {
        const applicationController = new ApplicationController(this.view);
        return applicationController.getAllApplications();
    }

    // ************* NativeServer methods which are not part of the common Server API ************

    startTileServer() {
        return this.engines.tileServer.start();
    }

    stopTileServer() {
        return this.engines.tileServer.stop();
    }

    fetchTileFromTileServer(options) {
        return this.engines.tileServer.fetchTile(options);
    }

    fetchRawTileFromTileServer(options) {
        return this.engines.tileServer.fetchRawTile(options);
    }

    applyOnDemandExtract(updateFilePath, manager, masterUpdateVersion, metadata) {
        const engine = this.engines.onDemandExtractEngine();
        return engine.apply(updateFilePath, manager, masterUpdateVersion, metadata);
    }

    deleteOnDemandExtract(metadata, manager) {
        const engine = this.engines.onDemandExtractEngine();
        return engine.delete(metadata, manager);
    }

    uploadLocalChanges(masterDatasource) {
        const masterServer = masterDatasource.server; //ENH: have an api on datasource
        if (!masterServer)
            throw new Error("uploadLocalChanges() will only run on the 'myworld' datasource");

        if (this._db.isReplica()) {
            if (!this._runningUpload) {
                const runner = this.engines.uploadRunner(this._db, masterServer);
                runner.on('status-changed', this.fire.bind(this, 'upload-status-changed'));
                runner.on('changes-uploaded', this.fire.bind(this, 'upload-changes-sent'));
                this._runningUpload = runner.upload().finally(() => {
                    runner.off();
                    this._runningUpload = null;
                });
            }
            return this._runningUpload;
        }
    }

    isUploadingLocalChanges() {
        return this._runningUpload !== null;
    }

    registerSequenceRange(min, max) {
        return this._db.sequenceManager.registerRange(min, max);
    }

    /**
     * Check whether shard IDs are running out or not
     * @return {Promise<boolean>}  True if shard IDs are running out
     */
    areShardIdsRunningOut() {
        return this._db.sequenceManager.numberUnusedShards().then(number => number <= 0);
    }

    isAndroid() {
        return platform.isAndroid();
    }

    isElectron() {
        return platform.isElectron();
    }

    getMasterViewServer() {
        const server = this.engines.nativeRestServer;
        return server.initialized;
    }

    async getSyncEngine(masterServer) {
        if (!masterServer) masterServer = await this.getMasterViewServer();
        return this._db.getSyncEngine(masterServer);
    }

    /**
     * Get a list of names of layers in the specified table set
     * @param {string} tableSetName    Table set name
     * @param {boolean} isOnDemand
     * @return {Promise<string[]}  Promise for the results
     */
    getLayerNamesForTableSet(tableSetName, isOnDemand) {
        let sqlQuery = this._db
            .table('layer')
            .join('myw$table_set_layer_item t', 'layer.id = t.layer_id')
            .where({ 't.table_set_id': tableSetName });

        if (isOnDemand) sqlQuery = sqlQuery.where({ 't.on_demand': 1 });

        return sqlQuery.all().then(results => results.map(r => r.name));
    }

    /**
     * Get usage monitor settings from (master) server
     * Will throw an error if the server is not available
     * @returns {Promise<usageMonitorSettings>}
     */
    async getUsageMonitorSettings() {
        const masterServer = await this.getMasterViewServer();
        return masterServer.getUsageMonitorSettings(); //await is relevant here for catching error
    }

    /**
     *  Create a new session with the Usage Monitor
     */
    async createUsageMonitorSession(data) {
        const masterServer = await this.getMasterViewServer();
        return masterServer.createUsageMonitorSession(data);
    }

    /**
     *  Send usage info to master server
     */
    async updateUsageMonitorSession(id, data) {
        const masterServer = await this.getMasterViewServer();
        return masterServer.updateUsageMonitorSession(id, data);
    }

    /**
     * Saves the session state for a given application name
     * @param  {string} name  Name of the application to associate with the given state
     * @param  {object} state
     */
    saveApplicationState(name, state) {
        if (!this.appStatePersistenceManager)
            throw new Error(
                'appStatePersistenceManager not passed as engine to NativeServer constructor'
            );
        return this.appStatePersistenceManager.saveState(name, state);
    }

    /**
     * Obtains the saved state of an application's session
     * First checks local file storage, then the 'default' user's state (in db)
     * @param  {string}  applicationName            Name of the application
     * @param  {boolean} ignoreBrowserSavedState    Whether to obtain from local storage or only from database
     * @return {Promise<object>} State object
     */
    async getSavedApplicationState(applicationName, ignoreBrowserSavedState) {
        if (!ignoreBrowserSavedState) {
            const fileState = await this._getLocallySavedState(applicationName);
            if (fileState) return fileState;
        }

        return this._getDatabaseSavedState(applicationName);
    }

    async _getLocallySavedState(applicationName) {
        if (!this.appStatePersistenceManager) return {};
        return this.appStatePersistenceManager.getState(applicationName);
    }

    _getDatabaseSavedState(applicationName) {
        return this._db
            .table('application_state')
            .where({ username: 'default', application_name: applicationName })
            .first()
            .then(record => {
                if (record?.state) {
                    return JSON.parse(record.state);
                } else {
                    return {};
                }
            });
    }
}
