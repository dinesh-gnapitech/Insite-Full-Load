// Copyright: IQGeo Limited 2010-2023
import { saveAs } from 'file-saver';
import myw from 'myWorld/base/core';
import { MywClass } from './class';
import config from 'myWorld/base/config';
import { localisation } from 'myWorld/base/localisation';
import { UsageMonitor } from 'myWorld/base/usageMonitor';
import { MyWorldFeature } from 'myWorld/features/myWorldFeature';
import { convertMultiLangString } from 'myWorld/base/util';
import { LookupStyle, TextStyle } from 'myWorld/styles/styles';

export class System extends MywClass {
    /**
     * @class  Provides access to the information about the system (version, settings, bookmarks, permissions, etc...)
     * @constructs
     */
    constructor(server) {
        super();
        this.server = server;

        // Configuration settings @type {object}
        this.settings = null;

        this.usageMonitor = new UsageMonitor(this);

        // promise that is resolved when self is ready to be used @type {Promise}
        this.initialized = server.initialized.then(() => this._doInitialization());
    }

    /**
     * Performs steps that are necessary to respond to future requests.
     * Obtains settings so that getSettings can be called synchronously
     * @returns {Promise} Promise which is resolved when this object has completed
     * initialization or rejected if initialization fails.
     * If the initialization does fail, the promise is rejected with
     * a string giving the reason for failure.
     * @private
     */
    async _doInitialization() {
        if (!myw.currentUser) {
            const username = await this.server.getCurrentUsername();
            myw.currentUser = { username };
        }

        const settings = await this.getSettings().catch(error => {
            console.log(error.stack);
            error.message = 'Failed to initialize db: ' + error.message;
            throw error;
        });
        this.settings = settings;
        const systemLanguages = settings['core.language'].split(',') || [];
        this.defaultLang = systemLanguages[0] || '';
        this._convertMultiLangString = convertMultiLangString(
            localisation.language,
            this.defaultLang,
            systemLanguages
        );
        Object.assign(config, settings);

        return this;
    }

    /**
     * Localises a multi-language string
     * Uses system language and falls back to system's default language
     * @param {string|object} text
     * @param {string|object} text  (optional) text to use if language is missing
     */
    localise(text, missing_language_text) {
        if (!localisation) throw new Error('Localisation not available.');
        return this._convertMultiLangString(text, missing_language_text);
    }

    /**
     * Registers the error handler for promises
     * @param  {Function} errorHandler function()
     */
    registerErrorHandler(errorHandler) {
        this.server._errorHandler = errorHandler; //ENH: improve this
    }

    /**
     * Returns the schema version of the database
     * @return {Promise<number>}
     */
    getSchemaVersion() {
        return this.server.getSchemaVersion();
    }

    /**
     * Returns modules version and patches
     * @returns {Promise<object>} keyed on module name
     */
    getModuleInfo() {
        return this.server.getModuleInfo();
    }

    /**
     * Check whether the database is a replica or not
     * @return {boolean}     True if the database is a replica
     */
    isReplicaDatabase() {
        return this.server.isReplicaDatabase();
    }

    /**
     * Returns whether a layer is included in the current extract or not
     * @param  {layerDefinition}  layerDef
     * @return {Boolean}
     */
    isLayerExtracted(layerDef) {
        return this.server.isLayerExtracted(layerDef);
    }

    /* ****************************** Application methods **************************** */

    /**
     * Get startup details for a given application
     * @param  {string} applicationName [description]
     * @return {Promise<object>}    Promise for layer, datasource and layer group definitions
     */
    getStartupInfo(applicationName) {
        //setup a cache for requests
        if (!this._startupRequest) this._startupRequest = {};

        if (!this._startupRequest[applicationName]) {
            //send the request and cache it
            this._startupRequest[applicationName] = this.server
                .getStartupInfo(applicationName)
                .then(this._processStartupInfo.bind(this));
        }
        return this._startupRequest[applicationName];
    }

    /**
     * Get admin notifications
     * @param {number}sinceId  Notifications ID that marks the start of the notifications to show
     */
    getAdminNotifications(sinceId) {
        return this.server.getAdminNotifications(sinceId);
    }

    /* ****************************** Layers methods **************************** */
    /**
     * Get the layer definition for a given layer name
     * @param  {string} layerName     Name of the layer
     * @return {Promise<layerDefinition>}    Promise for the specified layer definition
     */
    getLayerWithName(layerName) {
        return this.server.getLayerWithName(layerName);
    }

    /**
     * Get all the layer groups
     * @return {Promise<Array<layerGroupItem>>}  Promise for the layer groups
     */
    getLayerGroups() {
        return this.server.getLayerGroups();
    }

    /**
     * Saves a given private layer definition to the database
     * @param  {privateLayerDef} privateLayerDef
     * @return {Promise}
     */
    savePrivateLayer(privateLayerDef) {
        return this.server.savePrivateLayer(privateLayerDef);
    }

    /**
     * Saves a given private layer definition to the database
     * @param  {string} id
     * @return {Promise}
     */
    deletePrivateLayer(id) {
        return this.server.deletePrivateLayer(id);
    }

    /**
     * Sends a request to an external datasource via the myWorld server<br/>
     * Uses the url specified in the datasource definition
     * @param  {string}     dsName          Datasource name
     * @param  {Object}     requestParams   Key/value pairs that will be passed on as url parameters
     * @param  {string}     [options.urlFieldName='url']    Name of property in datasource's spec that holds the base url for the request
     * @param  {string}     [options.relativeUrl='']        Relative url to append to the base url
     * @return {Promise<Object>}  Promise for the results (parsed from json)
     */
    tunnelDatasourceRequest(dsName, requestParams, options) {
        //handle default values
        options = Object.assign(
            {
                urlFieldName: 'url',
                relativeUrl: ''
            },
            options
        );

        return this.server.tunnelDatasourceRequest(dsName, requestParams, options);
    }

    buildTunnelDatasourceRequestUrl(dsName, requestParams, options) {
        return this.server.buildTunnelDatasourceRequestUrl(dsName, requestParams, options);
    }

    /**
     * Returns the networks a given feature can be part of
     * @param  {MyWorldFeature} feature
     * @return {Promise}         Network definition keyed on network name
     */
    getNetworksFor(feature) {
        return this.server.getNetworksFor(feature);
    }

    /* ****************************** Bookmarks methods **************************** */
    /**
     * Get the details of a bookmark
     * @param  {number}id     The id of the bookmark
     * @return {Promise<bookmark>}        Promise for the bookmark details
     */
    getBookmark(id) {
        return this.server.getBookmark(id);
    }

    /**
     * Gets the bookmark with the given title
     * @param  {string} title  Title of the bookmark
     * @return {Promise<bookmark>}        Promise for the bookmark details
     */
    getBookmarkByTitle(title) {
        return this.server.getBookmarkByTitle(title);
    }

    /**
     * Gets the bookmarks the user has access to
     * @return {Promise<bookmark[]>}        Promise for the list of bookmark details
     */
    getBookmarksForUser() {
        return this.server.getBookmarksForUser();
    }

    /**
     * Creates a bookmark or if the current user has one with the same name, replaces it
     * @param  {Object}     bookmarkData Bookmark data
     * @return {Promise}    Promise which will resolve when the operation completes
     */
    saveBookmark(bookmarkData) {
        delete bookmarkData.geometry; //bookmark doesn't include a geometry anymore
        return this.server.saveBookmark(bookmarkData);
    }

    /**
     * Delete a bookmark by it's id
     * @param  {number}  bookmarkId
     * @return {Promise}   Promise which will resolve when the operation completes
     */
    deleteBookmark(bookmarkId) {
        return this.server.deleteBookmark(bookmarkId);
    }

    /**
     * Update a bookmark
     * @param  {number}   bookmarkId
     * @param  {Object}     bookmarkData Bookmark data
     * @return {Promise}    Promise which will resolve when the operation completes
     */
    updateBookmark(bookmarkId, bookmarkData) {
        return this.server.updateBookmark(bookmarkId, bookmarkData);
    }

    /* ****************************** Groups **************************** */

    /**
     * get the groups accessible to the current user
     * @param  {Boolean} [isManager]    whether current user is a manager of the group or not
     * @return {Promise<groupIds[]>}    Promise for the list of group ids
     */
    getGroupsIds(isManager) {
        isManager = !!isManager;
        return this.server.getGroupsIds(isManager);
    }

    /**
     * get the groups definition for the id
     * @param  {string}    id    group id
     * @return {Promise<Object>}    Promise for the object containing group definition
     */
    getGroup(id) {
        return this.server.getGroup(id);
    }

    /**
     * Creates a group
     * @param  {Object}     groupData Bookmark data
     * @return {Promise}    Promise which will resolve when the operation completes
     */
    saveGroup(groupData) {
        return this.server.saveGroup(groupData);
    }

    /**
     * Delete a group by it's id
     * @param  {number}  groupId
     * @return {Promise}   Promise which will resolve when the operation completes
     */
    deleteGroup(groupId) {
        return this.server.deleteGroup(groupId);
    }

    /**
     * Update a group
     * @param  {number}   groupId
     * @param  {Object}     groupData Group data
     * @return {Promise}    Promise which will resolve when the operation completes
     */
    updateGroup(groupId, groupData) {
        return this.server.updateGroup(groupId, groupData);
    }

    /* ****************************** Usage monitor **************************** */
    /**
     * Record licence usage
     * @param  {string} application
     * @param  {string} operation
     */
    consumeLicence(application, operation) {
        if (myw.isNativeApp && operation.startsWith('core.'))
            operation = 'anywhere' + operation.substring(4);
        this.usageMonitor.log('licence', application, operation);
    }

    /**
     * Record functionality usage
     * @param  {string} application
     * @param  {string} operation
     */
    recordFunctionalityAccess(application, operation) {
        if (myw.isNativeApp && operation.startsWith('core.'))
            operation = 'anywhere' + operation.substring(4);
        this.usageMonitor.log('functionality', application, operation);
    }

    /**
     * Record data usage
     * @param  {string} application
     * @param  {string} operation
     */
    recordDataAccess(application, operation) {
        this.usageMonitor.log('data', application, operation);
    }

    getUsageMonitorSettings() {
        return this.server.getUsageMonitorSettings();
    }

    createUsageMonitorSession(data) {
        return this.server.createUsageMonitorSession(data);
    }

    updateUsageMonitorSession(id, data) {
        return this.server.updateUsageMonitorSession(id, data);
    }

    /* ****************************** System settings **************************** */

    /**
     * Get the application settings stored in the database
     * @return {Promise<Object>} A promise for the settings (an object keyed on setting name)
     */
    getSettings() {
        if (!this._settingsRequest) {
            this._settingsRequest = this.server.getSettings().then(settingsArray => {
                const settings = {};

                settingsArray.forEach(record => {
                    try {
                        const value = this._convertApplicationSettingValue(
                            record.value,
                            record.type
                        );
                        settings[record.name] = value;
                    } catch (e) {
                        throw new Error(
                            "Failure to convert application setting '" +
                                record.name +
                                "'': " +
                                e.message
                        );
                    }
                });
                return settings;
            });
        }
        return this._settingsRequest;
    }

    /* ****************************** Permissions methods **************************** */

    /**
     * Check if the current user has permission for a given right
     * @param  {string} right           Name of the right to check for
     * @param  {string} appName         Name of the application
     * @return {Promise<boolean>}       Promise for whether the current user has permission or not
     */
    async userHasPermission(right, appName) {
        try {
            const permissions = await this.getUserPermissions();
            const appPermissions = permissions[appName ?? myw.app.name];
            return !!appPermissions?.[right];
        } catch (error) {
            console.warn('userHasPermission failed with:', error);
            return false;
        }
    }

    /**
     * Obtain a list of the current user's permissions
     * @return {Promise<permissions>} Promise for the lists of rights per application
     */
    getUserPermissions() {
        if (!this._userPermissions) {
            this._userPermissions = this.server.getUserPermissions();
        }
        return this._userPermissions;
    }

    /**
     * Obtain a url for a layer file
     * @param  {layerDef} layerDef
     * @return {Promise<string>} Promise for the url string
     */
    getUrlForLayerDataFile(layerDef) {
        return this.server.getUrlForLayerDataFile(layerDef);
    }

    /**
     * Obtain a url for kmz
     * @param  {layerDef} layerDef
     * @param  {string} filename
     * @return {Promise<string>} Promise for the url string
     */
    getUrlForKmz(layerDef, filename = null) {
        return this.server.getUrlForKmz(layerDef, filename);
    }

    /* ****************************** Applications methods **************************** */

    /**
     * Return the application details of the applications the current user has access to
     * The userPermissions gets the application Ids the user has access to
     * The getAllApplications() method is used to get application details of
     * all applications
     * @return {Promise} Promise for a list of application's details
     */
    async getUserApplications() {
        const [userPermissions, allApplications] = await Promise.all([
            this.getUserPermissions(),
            this.getAllApplications()
        ]);

        return allApplications.filter(anApp => {
            //filters out applications for which there is no rights/permissions
            const validEnvironment =
                (anApp.for_online_app && !myw.isNativeApp) ||
                (anApp.for_native_app && myw.isNativeApp);
            const appPerms = userPermissions[anApp.name];
            const hasAccess = appPerms?.['accessApplication'];
            return validEnvironment && hasAccess;
        });
    }

    /**
     * Obtains a list with all application records
     * @return {Promise} Promise for a list of application's details
     */
    getAllApplications() {
        if (!this._allApplications) {
            //cache the promise
            this._allApplications = this.server.getAllApplications();
        }
        return this._allApplications;
    }

    /**
     * Saves the session state for a given application name
     * @param  {string} name                Name of the application to associate with the given state
     * @param  {boolean} [persist=false]    Whether state should persist for use in other machines/browsers
     * @param  {boolean} [asDefault=false]  Whether the state should be saved as a system default(for all users)
     *                                      It's only relevant when persist is true
     * @param  {object} state
     */
    saveApplicationState(name, state, persist = false, asDefault = false) {
        //clear get cache, as it has become invalid/out-of-date
        if (this._savedApplicationsState) delete this._savedApplicationsState[name];

        return this.server.saveApplicationState(name, state, persist, asDefault);
    }

    /**
     * Obtains the last saved state of an application's session
     * @param  {string} name                        Name of the application
     * @param  {boolean} ignoreBrowserSavedState    Whether to obtain from local storage or only from database
     * @return {object}
     */
    getSavedApplicationState(name, ignoreBrowserSavedState) {
        return this.server.getSavedApplicationState(name, ignoreBrowserSavedState);
    }

    /**
     * Saves the session state that is common/shared for all applications
     * @param  {object} state
     */
    saveSharedState(state) {
        //save as if it was an application using an invalid application name
        Object.assign(state, { usageMonitor: this.usageMonitor.getState() });
        return this.server.saveApplicationState('!!!shared!!!', state, false);
    }

    /**
     * Obtain the last shared/common (across applications) state
     * @param  {boolean} ignoreBrowserSavedState    Whether to obtain from local storage or only from database
     * @return {object}
     */
    getSavedSharedState(ignoreBrowserSavedState) {
        return this.server.getSavedApplicationState('!!!shared!!!', ignoreBrowserSavedState);
    }

    /**
     * Generates a file to be downloaded by the browser
     * @param  {string}     format    'json' or 'csv'
     * @param  {json}       data
     * @return {Promise<string>}  Url for the file
     */
    export(format, data) {
        return this.server.export(format, data);
    }

    /**
     * Upload local changes for given datasource
     * @param {IDatasource} datasource   The datasource
     * @ return {Promise}  Resolves when the upload is complete
     * Only for use in the Native App with the 'myworld' datasource. If called for other cases
     * an error will be thrown.
     */
    uploadLocalChanges(datasource) {
        if (myw.isNativeApp) {
            if (datasource.name === 'myworld') {
                return datasource.initialized.then(() =>
                    this.server.uploadLocalChanges(datasource.masterDs.server)
                );
            } else {
                throw new Error("uploadLocalChanges() will only run on the 'myworld' datasource");
            }
        } else {
            throw new Error('uploadLocalChanges() will only run in the Native App');
        }
    }

    /**
     * Start a download on the client
     * @param {Blob} blob file object
     * @param {string} filename to be used in the download
     * @param {string} mimeType to encode the download with
     */
    executeBlobDownload(blob, filename, mimeType) {
        if (myw.isNativeApp) {
            this.server.executeBlobDownload(blob, filename, mimeType);
        } else if (navigator.userAgent.match('CriOS')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                window.open(reader.result);
            };
            reader.readAsDataURL(blob);
        } else {
            saveAs(blob, filename);
        }
    }

    /* ******************************** Auxiliary methods ****************************** */

    async _processStartupInfo(result) {
        await this.initialized;

        const dsDefs = {}; //keep a reference by name, for ease and speed in further processing
        result.datasources.forEach(dsDef => {
            dsDefs[dsDef.name] = dsDef;
            Object.entries(dsDef.featureTypes).forEach(([featureTypeName, featureDef]) => {
                featureDef.external_name = this.localise(featureDef.external_name, featureTypeName);
                featureDef.fieldsByWorldType = {}; //initialised here as it may not be set in _processLayerInfo() if features are not configured in layers
                const styleFieldNames = this._getStyleFieldNamesFor(featureTypeName);
                if (Array.isArray(styleFieldNames) && styleFieldNames.length)
                    featureDef.renderFields = styleFieldNames;
            });
        });

        for (let layerDef of result.layers) {
            this._processLayerInfo(layerDef, dsDefs);
        }

        result.layerGroups.forEach(group => {
            group.display_name = this.localise(group.display_name, group.name);
            group.description = this.localise(group.description, '');
        });

        //create a datasource entry and layer entry for each user layer definition
        result.privateLayers.forEach(privateLayerDef => {
            result.datasources.push({
                name: privateLayerDef.id,
                external_name: `${privateLayerDef.name} (${privateLayerDef.owner})`,
                owner: privateLayerDef.owner,
                ...privateLayerDef.datasource_spec
            });
            privateLayerDef.datasource = privateLayerDef.id;
            result.layers.push(privateLayerDef);
        });

        //move properties stored in spec as json to the definition itself
        const allDefs = result.datasources.concat(result.layers);
        allDefs.forEach(def => {
            Object.assign(def, def.spec);
            delete def.spec;
        });
        return result;
    }

    /**
     * Returns a list of fieldnames required for styling a given featureType
     * @param  {string}   featureTypeName       Name of the featureType
     *
     * @return {string[]}                       List of fieldnames required.
     */
    _getStyleFieldNamesFor(featureTypeName) {
        const FeatureModel = myw.featureModels[featureTypeName];
        if (!FeatureModel) return [];
        if (!FeatureModel.prototype.customStyleFieldNames) {
            // Warn if getCustomStyles has been overridden without defining customStyleFieldNames
            if (
                FeatureModel.prototype.getCustomStyles !== MyWorldFeature.prototype.getCustomStyles
            ) {
                console.warn(`Missing customStyleFieldNames for ${featureTypeName}`);
            }
            return [];
        }
        return FeatureModel.prototype.customStyleFieldNames;
    }

    /**
     * Processes layer def from startup info
     * overrides id of system layers with the layer name, localises values and populates fieldsByWorldType in datasource details
     * Populate fieldsByWorldType in 
        Overriding id with name provides a key which doesn't clash with private layer's id and avoids
        having to upgrade saved layer list state
     * @param {object} layers
     * @param {object} dsDefs ds info by name. gets modified! (fieldsByWorldType is created)
     * @private
     */
    _processLayerInfo(layerDef, dsDefs) {
        layerDef.id = layerDef.name;
        layerDef.display_name = this.localise(layerDef.display_name, layerDef.name);
        layerDef.description = this.localise(layerDef.description, '');

        //store for each feature, the fields used for each world type (category)
        const worldType = ['overlay', 'basemap'].includes(layerDef.category)
            ? 'geo'
            : layerDef.category;
        layerDef.feature_types.forEach(lfi => {
            const featureType = lfi.name.split('/');
            const [dsName, featureTypeName] =
                featureType.length > 1 ? featureType : ['myworld', featureType[0]];
            const dsDef = dsDefs[dsName];
            const featureDD = dsDef.featureTypes[featureTypeName];
            if (!featureDD) return;
            this._processStyles(lfi, featureDD);
            if (!featureDD.fieldsByWorldType) featureDD.fieldsByWorldType = {};
            if (!featureDD.fieldsByWorldType[worldType])
                featureDD.fieldsByWorldType[worldType] = [];
            if (!featureDD.fieldsByWorldType[worldType].includes(lfi.field_name))
                featureDD.fieldsByWorldType[worldType].push(lfi.field_name);
        });
    }

    /**
     * Look for fields in the layer feature items styles, and add them to the
     * corresponding featureDD's renderFields.
     *
     * @param {Object} lfi         Layer feature Item
     * @param {Object} featureDD   Corrisponding featureDD. gets modified! (renderFields is modified)
     */
    _processStyles(lfi, featureDD) {
        if (!lfi || !featureDD) return;
        const styleFields = [];
        const styles = [lfi.point_style, lfi.line_style, lfi.fill_style];
        styles.forEach(style => {
            //add fields used in lookup
            styleFields.push(...this._getLookupStyleFieldNamesFor(style));
        });

        // Text lookup style support defining the field used for label for each lookup value,
        // need to get all of them for renderFields
        const parsedTextStyle =
            LookupStyle.parse(lfi.text_style, TextStyle) ?? TextStyle.parse(lfi.text_style);
        styleFields.push(...parsedTextStyle.textProps());

        // register filters used in layer feature item. Filter expressions are not available at this point, so we can't
        // calculate the corresponding field names yet. This is done later in MywDatasource.getRequiredFieldsToRender
        if (lfi.filter) {
            if (!featureDD.styleFilterNames) featureDD.styleFilterNames = new Set();
            featureDD.styleFilterNames.add(lfi.filter);
        }

        if (!styleFields.length) return;
        if (!featureDD.renderFields) featureDD.renderFields = [];
        styleFields.forEach(fieldName => {
            fieldName = fieldName.trim();
            if (!featureDD.renderFields.includes(fieldName)) featureDD.renderFields.push(fieldName);
        });
    }

    /**
     * for a given style string, extact any lookup fields.
     * @param {string} style  a given style string
     */
    _getLookupStyleFieldNamesFor(style) {
        if (!style) return [];
        try {
            const styleObject = JSON.parse(style);
            if (styleObject?.lookupProp) return [styleObject.lookupProp];
        } catch (e) {
            /*Not action required if we fail to parse JSON*/
        }
        return [];
    }

    _convertApplicationSettingValue(value, type) {
        switch (type) {
            case 'JSON':
                value = JSON.parse(value);
                break;

            case 'INTEGER':
                value = parseInt(value, 10);
                break;

            default:
                // No conversion
                break;
        }
        return value;
    }
}

/**
 * A universal identifier
 * @typedef urn
 * @property {string} tableName The table name (i.e. feature type)
 * @property {string} id        Record identifier
 */

/**
 * The details of a bookmark
 * @typedef bookmark
 * @property {number} lat           Latitude of the centre of the bookmark
 * @property {number} lng           Longitude of the centre of the bookmark
 * @property {number}zoom         Zoom level to use
 * @property {string} map_display   Layers to use. Format is &lt;basemap name>|&lt;comma separated layer codes>
 */

/**
 * Layer definition. Additional properties may be present depending on the datasource type
 * @typedef layerDefinition
 * @property {string}             id            Unique Id of the layer
 * @property {string}             type          One of: myworld_tile, myworld_vector, leaflet, custom, google, kml, wms, myworld_tile_directory, mbtiles
 * @property {string}             category      'overlay' or 'basemap'
 * @property {string}             name          Name of the layer
 * @property {string}             code          Unique one character code for the layer
 * @property {string}             description   Description of the layer
 * @property {string}             thumbnail     Relative url for a thumbnail image
 * @property {string}             min_scale     Minimum scale at which the layer should be drawn on the client map
 * @property {string}             max_scale     Maximum scale at which the layer should be  drawn on the client map
 * @property {string}             attribution   The string used by the attribution control, describes the layer data.
 * @property {string}             datasource    Name of datasource for the layer
 * @property {layerFeatureItem[]} feature_types Layer feature objects describing the features appearing on this layer.
 */

/**
 * Item of a layer list. Layer list is a list/configuration of layers for a user/application pair
 * @typedef {(layerListLayer|layerListGroup|layerListGroupItem)} layerListItem
 */

/**
 * @typedef layerListLayer
 * @property {string}           layer_name             Name of the layer
 * @property {string}           [type="layer"]   Defines the type in the user's layerList
 * @property {number}         sequence               Order of the group amongst other groups and layers
 * @property {boolean}          turned_on              Whether the group is turned on (to be shown on the map) or not
 * @property {layerDefinition}  layerDef
 */

/**
 * @typedef layerListGroup
 * @property {string}                     layer_name             Name of the layer group
 * @property {string}                     [type="layer_group"]   Defines the type in the user's layerList
 * @property {number}                   sequence               Order of the group amongst other groups and layers
 * @property {boolean}                    turned_on              Whether the group is turned on (to be shown on the map) or not
 * @property {boolean}                    exclusive              Whether the group's layers can only be exclusively selected or not
 * @property {string}                     thumbnail              Thumbnail image source path
 * @property {Array<layerListGroupItem>}  subLayers              Layers that are assigned to this group
 */

/**
 * @typedef layerListGroupItem
 * @property {string}           layer_name                  Name of the layer
 * @property {string}           [type="layer_group_item"]   Defines the type in the user's layerList
 * @property {number}         sequence                    Order of the group amongst other groups and layers
 * @property {number}         subsequence                 Order of the layer amongst other layers in the group
 * @property {boolean}          turned_on                   Whether the group is turned on (to be shown on the map) or not
 * @property {layerDefinition}  layerDef
 */

/**
 * Rights per application. Keyed on application name
 * @typedef {Object<applicationRights>} permissions
 */

/**
 * Rights for an application. Keyed on right name. An absent value name that right has not been granted.
 * @typedef {Object<boolean>} applicationRights
 */

/**
 * Describes the style of a feature on a layer
 * @typedef layerFeatureItem
 * @property {number}  layer_id     Id of layer this item applies to
 * @property {number}  feature_id   Id of feature this item applies to
 * @property {string}    point_style  Point style of this eature on this layer
 * @property {string}    line_style   Point style of this eature on this layer
 * @property {string}    fill_style   Point style of this eature on this layer
 */

/**
 * Parameters for a render request that obtains feature information suitable for vector rendering
 * @typedef renderParams
 * @property  {string}         layerName
 * @property  {Array<LatLngBounds>|LatLngBounds} bounds      Single or List of bounding boxes to filter the results on
 * @property  {number}       [limit]     Max number of records to return. Default comes from configuration.
 * @property  {string}         [world_name=geo]  World to render
 * @property  {string}         [offset]   String to be treated as opaque by client that indicates to server where to resume query on second and subsequent requests
 * @property  {string}         [schema=data]    If 'delta' only features in a delta are returned
 */

export default System;
