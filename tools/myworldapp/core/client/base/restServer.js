// Copyright: IQGeo Limited 2010-2023
import { sortBy, unescape } from 'underscore';
import myw from 'myWorld/base/core';
import { MywClass } from 'myWorld/base/class';
import {
    DuplicateKeyError,
    ObjectNotFoundError,
    UnauthorizedError,
    BadRequest,
    RequestTooLargeError
} from './errors';
import { localisation } from 'myWorld/base/localisation';
import { TaskManager } from 'myWorld/base/taskManager';

/**
 * Implements Database providing access to the myWorld Database by sending requests to the myWorld REST Server
 *
 */
export class RestServer extends MywClass {
    static {
        this.mergeOptions({
            url: '',
            headers: {} //can be used to add custom headers
        });

        /**
         * Query operator lookup. myWorld attribute query to MapFish rest format
         * @type {Object}
         */
        this.prototype._operatorLookup = {
            '=': 'eq',
            '<>': 'ne',
            '<': 'lt',
            '<=': 'lte',
            '>': 'gt',
            '>=': 'gte',
            like: 'like',
            ilike: 'ilike'
        };
    }

    constructor(options) {
        super();
        //when adding things in this method, check if NativeRestServer should be updated as it doesn't reuse this constructor

        this.setOptions(options);
        this.delta = '';

        //ensure trailing slash in url
        let url = this.options.url || myw.baseUrl || '';
        if (url && !url.endsWith('/')) url += '/';

        this.baseUrl = url;
        this.csrfToken = this.options.csrfToken;

        //when no url is given we're already logged in to the server
        this._isLoggedIn = !this.options.url;

        const { maxConcurrentRequests: maxConcurrentTasks = 5 } = this.options;
        this.taskManager = new TaskManager({ maxConcurrentTasks });

        this.initialized = this._doInitialization().then(() => this);
    }

    /**
     * @return {string} uri encoded delta
     */
    get uriEncodedDelta() {
        return encodeURIComponent(this.delta ?? '');
    }

    /**
     * Do any further initialization and return a promise which resolves when
     * initialization is complete.
     * Subclasses may override this.
     * @return {Promise}  A promise which resolves when initialization is complete
     */
    _doInitialization() {
        if (this.options.credentials) return this.login(this.options.credentials);
        else return Promise.resolve();
    }

    /**
     * @return {object} Gets the overridden options for the Tile layer depending on the layer def
     */
    getTileLayerOptions(layerDef, defaultOptions) {
        return defaultOptions;
    }

    /**
     * Returns true since rest servers are always using a master database
     * @return {Boolean}
     */
    isMasterDatabase() {
        return true;
    }

    /**
     * Returns false since rest servers are always using a master database
     * @return {Boolean}
     */
    isReplicaDatabase() {
        return false;
    }

    /**
     * Whether we're logged in to the server or not
     * @return {Promise} [description]
     */
    isLoggedIn() {
        return Promise.resolve(this._isLoggedIn);
    }

    /**
     * Obtain details about fields necessary to perform a login request
     * @return {Promise}
     */
    getAuthOptions() {
        return this.getJSON('auth_options');
    }

    /**
     * Logs in to the server
     * @return {Promise}
     */
    login(credentials) {
        return this.ajax({
            type: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'redirect-afterwards': 'FALSE'
            },
            url: `${this.baseUrl}auth`,
            data: credentials
        })
            .then(result => {
                this.csrfToken = result;
                this._isLoggedIn = true;
            })
            .catch(reason => {
                this._isLoggedIn = false;
                console.log(`Authentication failed with: ${reason}`);
                console.log(`url: ${this.baseUrl}/auth`);
                console.log('data: ', credentials);
                throw reason;
            });
    }

    /**
     * Logs out from the server
     * @return {Promise}
     */
    logout() {
        return this.ajax({
            type: 'GET',
            url: `${this.baseUrl}logout`
        });
    }

    /**
     * Returns the username of the currently logged user
     */
    getCurrentUsername() {
        return this.ajax({
            type: 'GET',
            url: `${this.baseUrl}system/username`
        }).then(res => res.name);
    }

    /**
     * Returns the schema version of the database
     * @return {number}
     */
    async getSchemaVersion() {
        const data = await this.getJSON('system/version_stamp');
        return data.version_stamps.find(v => v.component === 'myw_schema').version;
    }

    /**
     * Returns information about the installed modules
     * @return {object} keyed on module name
     */
    getModuleInfo() {
        return this.getJSON('system/module');
    }

    /**
     * Get admin notifications
     * @param {number}sinceId  Notifications ID that marks the start of the notifications to show
     */
    getAdminNotifications(sinceId) {
        const sinceIdParam = sinceId || 0;
        const appTypeParam = myw.isNativeApp ? '&for=native' : '';
        return this.getJSON(`system/notification?since=${sinceIdParam}${appTypeParam}`).then(data =>
            sortBy(data.notifications, 'id')
        );
    }

    /**
     * @param  {string} datasource      Datasource name
     * @param  {string[]} types         Feature types
     * @return {Promise}            Request promise
     */
    getDDInfoForTypes(datasource, types) {
        //convert the types array to a string
        const typesStr = types.join(',');
        return this.getJSON(`dd/${datasource}?types=${typesStr}`);
    }

    /**
     * Performs a selection request to the myWorld database
     * @param  {string}     worldOwnerUrn       If null defaults to geographical world
     * @param  {LatLng}   selectionPoint      Point to use for the selection query
     * @param  {number}   zoomLevel           Zoom level to choose a radius and selectability
     * @param  {string[]}   selectedLayersIds   Array with the codes of the layers relevant for the selection
     * @param  {number}   pixelTolerance    Tolerance in pixels
     * @param  {object}     [options]
     * @param  {string}     [options.schema]            If 'delta' only features in a delta will be returned
     * @param  {string[]}   [options.featureTypes]      Feature types to consider
     */
    selection(
        worldOwnerUrn,
        selectionPoint,
        zoomLevel,
        selectedLayersIds,
        pixelTolerance,
        options = {}
    ) {
        const { schema, featureTypes: types } = options;
        let url =
            `select?lat=${selectionPoint.lat}&lon=${selectionPoint.lng}` +
            `&zoom=${zoomLevel}&layers=${selectedLayersIds}&pixel_tolerance=${pixelTolerance}`;

        if (worldOwnerUrn) url += `&w=${worldOwnerUrn}`;
        if (schema) url += `&schema=${schema}`;
        if (types) url += `&types=${types.join(',')}`;

        return this.getJSON(url, this._sessionVarsData());
    }

    /**
     * Performs a selection request to the myWorld database
     * @param  {LatLngBounds} bounds  Bounds to select inside of
     * @param  {number}   zoomLevel           Zoom level for selectability
     * @param  {string[]}   selectedLayersIds   Array with the codes of the layers relevant for the selection
     * @param  {string}     limit       Max number of features to return
     * @param  {object}     [options]
     * @param  {string}     [options.schema]            If 'delta' only features in a delta will be returned
     * @param  {string[]}   [options.featureTypes]      Feature types to consider
     * @param  {string}     [options.worldId]       If null defaults to geographical world
     */
    selectBox(bounds, zoomLevel, selectedLayersIds, limit, options = {}) {
        const { worldId, schema, featureTypes: types } = options;
        const geomString = bounds.asCoordsStr();
        let url = `select_within?coords=${geomString}&zoom=${zoomLevel}&layers=${selectedLayersIds}&limit=${limit}`;

        if (worldId) url += `&w=${worldId}`;
        if (schema) url += `&schema=${schema}`;
        if (types) url += `&types=${types.join(',')}`;

        return this.getJSON(url, this._sessionVarsData());
    }

    /**
     * Queries the database for a feature identified by its id
     * @param  {string}             dsName              Ignored as this class only deals with myWorld
     * @param  {string}             featureType         Name of the table/feature
     * @param  {number|string}     id                  Id of the feature
     * @param  {boolean}            [includeLobs]       Whether large object fields should be included or not
     * @param  {string}             [delta]             Id of delta to obtain the feature from
     */
    getFeature(dsName, featureType, id, includeLobs, delta) {
        const encodedId = encodeURIComponent(id); //In case it has special chars
        const url = `feature/${featureType}/${encodedId}?display_values=true&include_lobs=${includeLobs}&include_geo_geometry=true`;
        const data = this._sessionVarsData();
        if (delta !== undefined) data.delta = delta;
        return this.getJSON(url, data);
    }

    /**
     * Gets Features for a specified table and optionally inside a bouding box
     * @param  {string}        featureType
     * @param  {queryParameters}   params   [description]
     */
    getFeatures(featureType, params) {
        const url = `feature/${featureType}/get`;
        const data = Object.assign(this._sessionVarsData(), {
            display_values: params.displayValues,
            include_lobs: params.includeLobs,
            include_geo_geometry: params.includeGeoGeometry
        });

        if (params.bounds) data.bbox = this._boundsToStr(params.bounds);

        if (params.geom) data.geometry = JSON.stringify(params.geom);

        if (params.limit) data.limit = params.limit;

        if (params.offset) data.offset = params.offset - 1; // server parameter is 0 based

        if (params.includeTotal) data.include_total = true;

        if (params.orderBy) data.order_by = JSON.stringify(params.orderBy);

        if (params.filter) data.filter = params.filter;
        else if (params.clauses) this._processClausesParam(params.clauses, data);
        else if (params.predicate) data.predicate = JSON.stringify(params.predicate.asJson());

        data.delta = this.delta;

        return this.getJSONPost(url, data);
    }

    /**
     * Gets features with given ids
     * @param {string} featureType
     * @param {string[]} ids
     * @param {featureFetchOptions} options
     */
    //ENH: Include session vars?
    getFeaturesByUrn(featureType, ids, options) {
        const url = `feature/${featureType}`;
        const data = {
            display_values: options.displayValues,
            include_lobs: options.includeLobs,
            include_geo_geometry: options.includeGeoGeometry,
            ids: ids.join(','),
            delta: this.delta
        };
        return this.getJSON(url, data);
    }

    /**
     * Counts Features for a specified table and optionally inside a bouding box
     * @param  {string}             featureType
     * @param  {queryParameters}    params
     */
    countFeatures(featureType, params) {
        const url = `feature/${featureType}/count`;
        const data = this._sessionVarsData();

        if (params.bounds) data.bbox = this._boundsToStr(params.bounds);

        if (params.geom) data.geometry = JSON.stringify(params.geom);

        if (params.filter) data.filter = params.filter;
        else if (params.clauses) this._processClausesParam(params.clauses, data);

        if (params.limit) data.limit = params.limit;

        return this.getJSONPost(url, data);
    }

    /**
     * Gets Features for a specified layer for vector rendering
     * @param  {renderParams}   params   [description]
     */
    getLayerFeatures(params) {
        const layerName = encodeURIComponent(params.layerName); //layer names can have '/' so we need to encode twice (one gets decoded at the server routing and the other by the controller)
        const url = `layer/${encodeURIComponent(layerName)}/features`;
        const data = this._sessionVarsData();

        if (params.bounds instanceof Array)
            data.bbox = params.bounds.map(this._boundsToStr).join(':');
        else data.bbox = this._boundsToStr(params.bounds);

        data.limit = params.limit;

        if (params.offset) data.offset = params.offset;
        if (params.includeTotal) data.include_total = true;
        if (params.world_name) data.world_name = params.world_name;
        if (typeof params.zoom == 'number') data.zoom = Math.round(params.zoom);
        if ((params.featureTypes || []).length) data.feature_types = params.featureTypes.join(',');
        if (params.requiredFields) data.requiredFields = JSON.stringify(params.requiredFields);
        if (params.schema) data.schema = params.schema;

        //a layer doesn't issue an offset request before the first one as returned so we can use the layername as id for task manager
        return this.getJSON(url, data, { id: url, replace: true });
    }

    /**
     * Returns the features in a relationship with another given feature
     * @param  {Feature} feature         Feature for which we want the related records
     * @param  {string} relationshipName Name of relationship (field)
     * @param  {object} aspects
     * @property  {boolean}        aspects.includeLobs
     * @property  {boolean}        aspects.includeGeoGeometry
     */
    getRelationship(feature, relationshipName, aspects) {
        const { includeGeoGeometry, includeLobs } = aspects;
        const url = `feature/${feature.getType()}/${feature.getId()}/relationship/${relationshipName}?display_values=true&include_geo_geometry=${includeGeoGeometry}&include_lobs=${includeLobs}`;

        return this.getJSON(url, this._sessionVarsData());
    }

    /**
     * Obtains features of a given type that are close to a point and within a tolerance
     * @param  {string}   featureType Type of features to obtain
     * @param  {LatLng} position
     * @param  {Integer}   tolerance   Tolerance in meters
     */
    getFeaturesAround(featureType, position, tolerance) {
        const url = `feature/${featureType.toLowerCase()}?lon=${position.lng}&lat=${
            position.lat
        }&tolerance=${tolerance}&display_values=true`;

        return this.getJSON(url, this._sessionVarsData());
    }

    /**
     * Delete a feature by it's id
     * @param  {string}   featureType
     * @param  {string}   featureId
     */
    deleteFeature(featureType, featureId) {
        return this._deleteRecord('feature', featureType, featureId);
    }

    /**
     * Insert a feature into a table
     * @param  {string}   featureType
     * @param  {Array<object>}   insertData
     * @param  {boolean}   [update=false] If true, an id is provided and feature already exits, update it
     */
    async insertFeature(featureType, insertData, update = false) {
        const feature = await this._insertRecord('feature', featureType, insertData, update);
        return feature.id;
    }

    /**
     * Update a feature in a table
     * @param  {string}   featureType  [description]
     * @param  {string}   featureId
     * @param  {object}   updateData
     */
    updateFeature(featureType, featureId, updateData) {
        return this._updateRecord('feature', featureType, featureId, updateData);
    }

    /**
     * Update lots of features with the same property values.
     * @param {Array<MyWorldFeature>} features
     * @param {object} properties
     * @param {object} [triggerChanges]
     * @returns {Promise<UpdatedFeatures>}
     */
    bulkUpdateFeatures(features, properties, triggerChanges) {
        const body = {
            features: features.map(f => f.getUrn()),
            properties,
            individual_changes: triggerChanges
        };
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(body),
            dataType: 'json',
            type: 'PUT',
            url: `${this.baseUrl}feature_bulk?delta=${this.uriEncodedDelta}`
        });
    }

    /**
     *  Run (insert, delete, update) operations on multiple features within one transaction in the database
     *  @param  {Array<transactionItem>} where transactionItem is of the form [op, featureType, MyWorldFeature]  transaction
     */

    runTransaction(transaction) {
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(transaction),
            dataType: 'json',
            type: 'POST',
            url: `${this.baseUrl}feature?delta=${this.uriEncodedDelta}`
        });
    }

    /**
     * Returns the networks a given feature can be part of
     * @param  {MyWorldFeature} feature
     * @return {Promise}                      Network definition keyed on network name
     */
    getNetworksFor(feature) {
        const serviceUrl = ['feature', feature.type, feature.id, 'networks'].join('/');
        const args = { delta: this.delta };
        return this.getJSON(serviceUrl, args);
    }

    /**
     * Find connected network objects
     * @param {string}   network  Name of network to trace through
     * @param {string}   feature  Start feature urn
     * @param {boolean}  options.direction Direction to trace in (upstream|downstream|both)
     * @param {string}   options.resultType  Structure of results: 'features' or 'tree'
     * @param {number}   [options.maxDist]  Max distance to trace to, in meters
     * @param {string[]} [options.resultFeatureTypes]  Feature types to include in result
     * @param {Object<object>} [options.filters]  Filters keyed on feature type
     * @return {Promise<Array<Feature>>}  Connected features
     */
    traceOut(network, featureUrn, options) {
        // direction, maxDist, resultType, filters, returnTypes
        const serviceUrl = `network/${network}/trace_out`;
        const args = {
            from: featureUrn,
            direction: options.direction,
            result_type: options.resultType
        };
        if (options.maxDist) args.max_dist = options.maxDist;
        if (options.maxNodes) args.max_nodes = options.maxNodes;
        if (options.resultFeatureTypes) args.return = options.resultFeatureTypes;
        if (options.filters) args.filters = JSON.stringify(options.filters);
        args.delta = this.delta;

        return this.getJSON(serviceUrl, args);
    }

    /**
     * Find shortest path through a network
     * @param {string}    network  Name of network to trace through
     * @param {Feature}    feature  Start feature
     * @param {string}    toUrn  URN of destination feature
     * @param {string}   options.resultType  Structure of results: 'features' or 'tree'
     * @param {number}   [options.maxDist]  Max distance to trace to, in meters
     * @return {Promise<Array<Feature>>}  Path to destination feature (empty if not reachable)
     */
    shortestPath(network, feature, toUrn, options) {
        const service_url = `network/${network}/shortest_path?delta=${this.uriEncodedDelta}`;
        const args = {
            from: feature.getUrn(),
            to: toUrn,
            result_type: options.resultType
        };
        if (options.maxDist) args.max_dist = options.maxDist;
        if (options.maxNodes) args.max_nodes = options.maxNodes;
        if (options.resultFeatureTypes) args.return = options.resultFeatureTypes;
        args.delta = this.delta;

        return this.getJSON(service_url, args);
    }

    /**
     * Get startup information for a given application.
     * Includes datasource, layer and layer group definitions
     */
    getStartupInfo(applicationName) {
        return this.getJSON(`system/application/${applicationName}/startup`);
    }

    /**
     * Get the layer definition for a given layer name
     * @param  {string} layerName [description]
     * @return {Object}           Object with the layer parameters as properties
     */
    getLayerWithName(layerName) {
        layerName = encodeURIComponent(layerName); //layer names can have '/' so we need to encode twice (one gets decoded at the server and the other by the controller)
        return this.getJSON(`system/layer/by_name/${encodeURIComponent(layerName)}`);
    }

    /**
     * Get all layer groups
     */
    getLayerGroups() {
        return this.getJSON('system/layer_group').then(data => data.layerGroups);
    }

    /**
     * Saves a given user layer definition to the database
     * @param  {privateLayerDef} privateLayerDef
     * @return {Promise}
     */
    savePrivateLayer(privateLayerDef) {
        const isNew = privateLayerDef.id === null;
        if (isNew) delete privateLayerDef.id;
        const keys = [
            'id',
            'name',
            'min_scale',
            'max_scale',
            'category',
            'sharing',
            'transparency',
            'thumbnail',
            'control_item_class',
            'attribution',
            'description',
            'datasource_spec'
        ];
        //  Separate the private layer def into core data and per-datasource spec
        const data = { spec: {}, owner: myw.currentUser.username };
        Object.entries(privateLayerDef).forEach(([key, value]) => {
            if (keys.includes(key)) data[key] = value;
            else data.spec[key] = value;
        });

        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(data),
            dataType: 'json',
            type: isNew ? 'POST' : 'PUT',
            url: `${this.baseUrl}system/private_layer${isNew ? '' : '/' + privateLayerDef.id}`
        });
    }

    /**
     * Deletes a given user layer definition to the database
     * @param  {string} id
     * @return {Promise}
     */
    deletePrivateLayer(id) {
        return this.ajax({
            type: 'DELETE',
            url: `${this.baseUrl}system/private_layer/${id}`
        });
    }

    /**
     * Sends an external request to the myWorld server
     * @param  {number}   dsName          Datasource name
     * @param  {string}     requestParams   Parameters to send to the external selection server
     * @param  {string}     options.urlFieldName    Name of property in datasource's spec that holds the base url for the request
     * @param  {string}     [options.relativeUrl='']        Relative url to append to the base url
     * @param  {string}     [options.format='json']         Format the response is expected in
     * @return {Promise<json>}              Json with the selected features
     */
    tunnelDatasourceRequest(dsName, requestParams, options) {
        const url = this.buildTunnelDatasourceRequestUrl(dsName, requestParams, options);
        const dataFormat = options.format || 'json';

        return this.ajax({
            dataType: dataFormat,
            url
        });
    }

    buildTunnelDatasourceRequestUrl(dsName, requestParams, options) {
        const encodedDsName = encodeURIComponent(dsName);
        const route = options.url ? 'config' : 'system';
        let url = `${route}/datasource/${encodedDsName}/tunnel?`;

        //encode all parameters into a string that will then be used when the external request is made by the server
        const argsStr = new URLSearchParams(requestParams).toString();

        const dataFormat = options.format || 'json';

        if (options.url) {
            //config app (tests)
            url += `url=${encodeURIComponent(options.url)}`;
            if (options.username) {
                url += `&username=${encodeURIComponent(options.username)}`;
                url += `&password=${encodeURIComponent(options.password)}`;
            }
        } else {
            //client requests. base url and username/password are obtained from datasource record
            url += `urlFieldName=${encodeURIComponent(
                options.urlFieldName
            )}&relativeUrl=${encodeURIComponent(options.relativeUrl || '')}`;
        }

        if (options.owner) {
            url += `&owner=${encodeURIComponent(options.owner)}`;
        }

        url = `${url}&format=${encodeURIComponent(dataFormat)}&paramsStr=${encodeURIComponent(
            argsStr
        )}`;

        return this.baseUrl + url;
    }

    /**
     * [getBookmark description]
     * @param  {number}id The id of the bookmark
     */
    getBookmark(id) {
        return this.getJSON(`system/bookmark/${id}`);
    }

    /**
     * Sends the request to get the bookmark with the given title for the current user
     */
    getBookmarkByTitle(title) {
        return this.getJSON(`system/bookmark/by_name/${title}`);
    }

    /**
     * Sends the request to get the bookmarks accessible to the current user
     */
    getBookmarksForUser() {
        return this.getJSON('system/bookmark').then(
            bookmarkCollection => bookmarkCollection.bookmarks
        );
    }

    /**
     * Sends the request to get the groups accessible to the current user
     */
    getGroupsIds(isManager) {
        let url = 'system/group_ids';
        if (isManager) url = 'system/group_ids?manager=True';
        return this.getJSON(url).then(groups => groups.group_ids);
    }

    /**
     * Sends the request to get the group by id
     */
    getGroup(id) {
        return this.getJSON(`system/group/${id}`);
    }

    /**
     * Creates a user group
     * @param  {object} groupData
     */
    saveGroup(groupData) {
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(groupData),
            dataType: 'json',
            type: 'POST',
            url: `${this.baseUrl}system/group`
        });
    }

    /**
     * Deletes the group with the given id
     * @param  {object} groupId
     */
    deleteGroup(groupId) {
        return this._deleteRecord('system', 'group', groupId);
    }

    /**
     * Deletes the group with the given id
     * @param  {object} groupId
     */
    updateGroup(groupId, groupData) {
        return this._updateRecord('system', 'group', groupId, groupData);
    }

    /**
     * Creates a bookmark or if the current user has one with the same name, replaces it
     * @param  {object} bookmarkData [description]
     */
    saveBookmark(bookmarkData) {
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(bookmarkData),
            dataType: 'json',
            type: 'POST',
            url: `${this.baseUrl}system/bookmark`
        });
    }

    /**
     * Deletes the bookmark with the given id
     * @param  {object} bookmarkId
     */
    deleteBookmark(bookmarkId) {
        return this._deleteRecord('system', 'bookmark', bookmarkId);
    }

    /**
     * Deletes the bookmark with the given id
     * @param  {object} bookmarkId
     */
    updateBookmark(bookmarkId, bookmarkData) {
        return this._updateRecord('system', 'bookmark', bookmarkId, bookmarkData);
    }

    /**
     * Get usage monitor default settings
     */
    getUsageMonitorSettings() {
        return this.ajax({
            contentType: 'application/json',
            dataType: 'json',
            type: 'get',
            url: `${this.baseUrl}system/usage/settings`
        });
    }

    /**
     *  Create a new session with the Usage Monitor
     */
    createUsageMonitorSession(data) {
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(data),
            dataType: 'json',
            type: 'POST',
            url: `${this.baseUrl}system/usage`
        });
    }

    updateUsageMonitorSession(id, data) {
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(data),
            dataType: 'json',
            type: 'PUT',
            url: `${this.baseUrl}system/usage/${id}`
        });
    }

    /**
     * Executes a search request on the server
     * @param  {string}             dsName              Ignored as this class only deals with myWorld
     * @param  {string}         searchTerm              Text to search for
     * @return {Promise<Array<autoCompleteResult>>}  Promise for a list of features
     */
    runSearch(dsName, searchTerm, options) {
        let url = `search?term=${encodeURIComponent(searchTerm)}`;

        if (options.limit) url += `&limit=${options.limit}`;

        return this.getJSON(url, this._sessionVarsData(), {
            id: 'search',
            priority: 1,
            replace: true
        }).then(suggestionCollection => suggestionCollection.suggestions);
    }

    /**
     * Searches for features (with search rules) matching the provided search terms
     * @param  {string}   dsName         Datasource name (will be ignored as RestServer only deals with myworld features)
     * @param  {string}   searchTerms    Text to search for
     * @return {Promise<geojson>}  Promise for a feature collection
     */
    getFeaturesMatching(dsName, searchTerm, options) {
        let url = `search_features?term=${encodeURIComponent(searchTerm)}`;

        if (options.limit) url += `&limit=${options.limit}`;

        return this.getJSON(url, this._sessionVarsData());
    }

    getSettings() {
        return this.getJSON('system/setting').then(data => data.settings);
    }

    /**
     * Gets the permissions for the logged in user
     */
    getUserPermissions() {
        return this.getJSON('system/rights').then(results => results.rights);
    }

    /**
     * Gets the application details like name, description etc for all the defined applications
     */
    getAllApplications() {
        return this.getJSON('system/application').then(results => results.applications);
    }

    /**
     * Saves the session state for a given application name
     * @param  {string} applicationName  Name of the application to associate with the given state
     * @param  {boolean} [persist=false]     Whether state should persist for use in other machines/browsers
     * @param  {boolean} [asDefault=false]   Whether the state should be saved as a system default(for all users)
     *                                       It's only relevant when persist is true
     * @param  {object} state
     */
    saveApplicationState(applicationName, state, persist = false, asDefault = false) {
        //save state in local storage
        try {
            localStorage.setItem(this._getStateItemName(applicationName), JSON.stringify(state));
        } catch (e) {
            console.warn("Problem saving application's state to local storage: ", e);

            if (!persist) {
                //we're done. return with the error
                return Promise.reject(e);
            }
        }

        if (persist) {
            const username = asDefault ? 'default' : myw.currentUser.username;
            //also save it in database
            return this.ajax({
                contentType: 'application/json',
                data: JSON.stringify(state),
                dataType: 'json',
                type: 'PUT',
                url: `${this.baseUrl}system/application/${applicationName}/${username}/state`
            });
        } else {
            return Promise.resolve();
        }
    }

    /**
     * Obtains the saved state of an application's session
     * First checks localStorage, then database and then the 'default' user's state (in db)
     * @param  {string}  applicationName            Name of the application
     * @param  {boolean} ignoreBrowserSavedState    Whether to obtain from local storage or only from database
     * @return {Promise<object>} State object
     */
    getSavedApplicationState(applicationName, ignoreBrowserSavedState) {
        let localStorageState;

        if (!ignoreBrowserSavedState) {
            localStorageState = this._getLocalStorageSavedState(applicationName);
        }

        if (localStorageState) {
            return Promise.resolve(localStorageState);
        } else {
            return this.getJSON(
                `system/application/${applicationName}/${myw.currentUser.username}/state`
            );
        }
    }

    /**
     * Obtains a list of CRS defintions present on the server
     * @returns {promise<object>} The list of CRS'
     */
    getCRSList() {
        return this.getJSON(`system/crs`);
    }

    /**
     * Returns a defined CRS object
     * @param {String} crs CRS to fetch, either as a number or in the format EPSG:<number>
     * @returns {promise<object>} CRS defintion as an object
     */
    getCRSDefinition(crs) {
        return this.getJSON(`system/crs/${crs}`);
    }

    /**
     * Returns the elements of 'delta'
     * @param {string} delta
     * @returns {promise<object>} Response with a list of features
     */
    getDeltaFeatures(delta) {
        return this.getJSON(`delta/${delta}/features`);
    }

    /**
     * Conflict info for 'delta'
     * @param {string} delta
     * @returns {promise<object>} Response with list of conflict objects
     */
    getDeltaConflicts(delta) {
        return this.getJSON(`delta/${delta}/conflicts`);
    }

    /**
     * Update and rebase the supplied features
     * @param {string} delta
     * @param {object[]} featureLists
     */
    async resolveDelta(delta, featureLists) {
        await this.getJSONPost(`delta/${delta}/resolve`, {
            features: JSON.stringify(featureLists)
        });
    }

    /**
     * Publish the elements of 'delta'
     * @param {string} delta
     * @returns {promise<object>}  Resonse with the number of changes made
     */
    promoteDelta(delta) {
        return this.getJSONPost(`delta/${delta}/promote`);
    }

    /**
     * Delete the elements of 'delta'
     * @param {string} delta
     * @returns {promise<object>} Response with the number of records deleted
     */
    deleteDelta(delta) {
        return this.getJSONPost(`delta/${delta}/delete`);
    }

    /**
     * Obtains the local storage saved state of an application's session
     * @param  {string} applicationName Name of the application
     * @return {object} State object
     */
    _getLocalStorageSavedState(applicationName) {
        let itemName = this._getStateItemName(applicationName);
        let localStorageState;

        try {
            const stateStr = localStorage.getItem(itemName);
            if (stateStr) localStorageState = JSON.parse(stateStr);
        } catch (e) {
            console.warn("Problem loading application's state from local storage: ", e);
        }

        return localStorageState;
    }

    /**
     * @return {string} Identifier for storing the state of this (user,application) pair
     * @private
     */
    _getStateItemName(applicationName, oldFormat) {
        if (oldFormat) {
            return `state_${myw.currentUser.username}_${applicationName}`;
        } else {
            const pathname = document.location.pathname;
            const page = pathname.substr(1, pathname.lastIndexOf('/'));
            return `${page + applicationName}/state/${myw.currentUser.username}`;
        }
    }

    /**
     * Generates a file to be downloaded by the browser
     * @param  {string}     exportFormat    'json' or 'csv'
     * @param  {json}       data
     * @return {Promise<object>}  {filename: "", body: blob}
     */
    async export(exportFormat, data) {
        let url = `export_${exportFormat}`;

        // If csv is being exported, add the configured encoding to the request
        if (exportFormat === 'csv') {
            url += `?encoding=${myw.config['core.exportEncoding'] || 'utf-8'}`;
        }

        return this.ajax({
            type: 'POST',
            url,
            data: JSON.stringify(data),
            contentType: 'application/json',
            dataType: 'text',
            responseType: 'blob'
        });
    }

    /**
     * Sends a GET request to custom module controller
     * @param {string} url
     * @param {object} params
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     */
    moduleGet(url, params, taskOptions) {
        return this.getJSON(url, params, taskOptions);
    }

    /**
     * Invokes a custom module controller
     * @param {string} url
     * @param {object} params
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     */
    modulePut(url, data, taskOptions) {
        return this.getJSONPut(url, data, taskOptions);
    }

    /**
     * Invokes a custom module controller
     * @param {string} url
     * @param {object} params
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     */
    modulePost(url, data, taskOptions) {
        return this.getJSONPost(url, data, taskOptions);
    }

    //************** internal methods - not part of API that is being implemented ****************
    /**
     * Load JSON-encoded data from the server using a GET HTTP request
     * @param  {string} url            A string containing the URL to which the request is sent.
     * @param  {object} data           Key value pairs that will be added to url as part of the query string
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     * @return {Promise}       Promise will resolve with "data" or fail with "errorThrown"
     */
    getJSON(url, data, taskOptions) {
        const urlParams = this._dataAsString(data);
        const sep = url.includes('?') ? '&' : '?';
        const urlWithParams = urlParams ? url + sep + urlParams : url;

        return this.taskManager.addTask(
            () =>
                this.ajax({
                    dataType: 'json',
                    url: this.baseUrl + urlWithParams
                }),
            taskOptions
        );
    }

    /**
     * Load JSON-encoded data from the server using a POST HTTP request with form content type.
     * This can be used to work around Request-URI limits.
     * @param  {string} url            A string containing the URL to which the request is sent.
     * @param  {string} data           A string encoding the data for the request.
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     * @return {Promise}       Promise will resolve with "data" or fail with "errorThrown"
     */
    getJSONPost(url, data, taskOptions) {
        return this.taskManager.addTask(
            () =>
                this.ajax({
                    dataType: 'json',
                    url: this.baseUrl + url,
                    data,
                    type: 'POST',
                    contentType: 'application/x-www-form-urlencoded'
                }),
            taskOptions
        );
    }

    /**
     * Sends JSON-encoded data to the server using a PUT HTTP request and returns the result
     * @param  {string} url            A string containing the URL to which the request is sent.
     * @param  {object} data           Key value pairs that will be added to url as part of the query string
     * @param  {taskOptions} [taskOptions]    Options for {@link TaskManager}
     * @return {Promise}       Promise will resolve with "data" or fail with "errorThrown"
     */
    getJSONPut(url, data, taskOptions) {
        return this.taskManager.addTask(
            () =>
                this.ajax({
                    dataType: 'json',
                    url: this.baseUrl + url,
                    data,
                    type: 'PUT',
                    contentType: 'application/x-www-form-urlencoded'
                }),
            taskOptions
        );
    }

    readCookie(name) {
        const nameEQ = `${name}=`;
        const ca = document.cookie.split(';');

        for (let c of ca) {
            c = c.trim();
            if (c.startsWith(nameEQ)) return c.substring(nameEQ.length, c.length);
        }

        return null;
    }

    /**
     * Obtain a url for a layer file
     * @param  {layerDef} layerDef
     * @return {Promise<string>} Promise for the url string
     */
    getUrlForLayerDataFile(layerDef) {
        return Promise.resolve(`system/layer_file/${encodeURIComponent(layerDef.name)}`);
    }

    /**
     * Obtain a url for kmz
     * @param  {layerDef} layerDef
     * @param  {string} filename
     * @return {Promise<string>} Promise for the url string
     */
    getUrlForKmz(layerDef, filename = null) {
        return Promise.resolve(
            `system/kmz/${layerDef.name}${filename ? '/' + btoa(filename) : ''}`
        );
    }

    /**
     * Perform an asynchronous HTTP (Ajax) request
     * Catch promise errors/rejects if any
     * @param  {object} params            A string containing the URL to which the request is sent.
     * @return {Promise}       Promise will resolve with "data" or fail with "errorThrown"
     */
    ajax(params) {
        let promise = this._ajax(params);
        if (this._errorHandler) promise = promise.catch(this._errorHandler);
        return promise;
    }

    /**
     * Perform an asynchronous HTTP (Ajax) request
     * @param  {object} params            A string containing the URL to which the request is sent.
     * @return {Promise}       Promise will resolve with "data" or fail with "errorThrown"
     * @private
     */
    async _ajax(params) {
        const {
            contentType,
            data,
            dataType,
            headers = {},
            responseType = 'text',
            type = 'GET',
            url
        } = params;

        const isJson = dataType == 'json';
        const body = this._dataAsString(data);

        const requestHeaders = { ...headers, ...this.options.headers };

        requestHeaders['X-CSRF-Token'] = this.csrfToken || this.readCookie('csrf_token') || '';

        //include a parameter with the application name so that the server can apply filters
        let requestUrl = this._addParamToUrl(url, 'application', this.applicationName);
        //include a parameter with the language so that the server can do localisation to database values
        requestUrl = this._addParamToUrl(requestUrl, 'lang', localisation.language);

        if (isJson) {
            requestHeaders['Content-Type'] = 'application/json';
        }

        if (contentType) {
            requestHeaders['Content-Type'] = contentType;
        }

        let response = null;
        try {
            response = await fetch(requestUrl, {
                method: type,
                headers: requestHeaders,
                body,
                credentials: 'include'
            });
        } catch (error) {
            throw new Error(`Can't fetch ${JSON.stringify(requestUrl)}`);
        }

        const { status } = response;

        if (status >= 200 && status < 400) {
            const attachmentFilename = this._processAttachmentFilename(response);

            if (responseType == 'json' || isJson) {
                try {
                    response = await response.json();
                } catch (e) {
                    response = '';
                }
            } else if (['arrayBuffer', 'blob', 'text'].includes(responseType)) {
                response = await response[responseType]();
            } else if (responseType === 'document') {
                response = await response.text();
                response = new DOMParser().parseFromString(response, 'text/html');
            }

            if (attachmentFilename !== false) {
                response = {
                    filename: attachmentFilename,
                    body: response
                };
            }

            return response;
        } else {
            const responseText = await response.text();
            if (status == 502 && responseText.includes('mywAbort')) {
                //MywAbort message
                const msgStartIndex = responseText.indexOf('mywAbort:') + 9;

                const msgEndIndex = responseText.indexOf('</body>');
                const htmlMsg = responseText.slice(msgStartIndex, msgEndIndex).trim();
                const data = JSON.parse(unescape(htmlMsg));
                const error = new Error(data.msg);
                error.params = data.params;
                throw error;
            } else if (status == 412) {
                // Duplicate key error
                throw new DuplicateKeyError();
            } else if (status === 404) {
                throw new ObjectNotFoundError();
            } else if (status === 403) {
                throw new UnauthorizedError();
            } else if (status === 400) {
                throw new BadRequest();
            } else if (status === 413) {
                throw new RequestTooLargeError();
            } else {
                const error = new Error(`Status code was ${status}`);
                error.code = status;
                error.responseText = responseText;
                throw error;
            }
        }
    }

    _processAttachmentFilename(fetchRes) {
        const disposition = fetchRes.headers.get('Content-Disposition');
        if (disposition?.includes('attachment')) {
            // Handle file download, retrieve file name.
            const filenameRegex = /filename=\"(?<filename>.+?)\"/;
            return disposition.match(filenameRegex).groups['filename'];
        }
        return false;
    }

    _dataAsString(data) {
        return data instanceof Object ? new URLSearchParams(data).toString() : data;
    }

    /**
     * Delete a record by it's id
     * @param  {string}   schema
     * @param  {string}   tableName
     * @param  {string}   recordId
     */
    _deleteRecord(schema, tableName, recordId) {
        return this.ajax({
            type: 'DELETE',
            url: `${this.baseUrl + schema}/${tableName}/${recordId}?delta=${this.uriEncodedDelta}`,
            data: `${recordId}` //if we don't include a data value we get a 411 when running the js tests in node
        });
    }

    /**
     * Insert a record into a table
     * @param  {string}   schema
     * @param  {string}   tableName
     * @param  {Array<object>}   insertData
     */
    _insertRecord(schema, tableName, insertData, update) {
        let url = `${this.baseUrl + schema}/${tableName}?delta=${this.uriEncodedDelta}`;
        if (update) url += '&update=true';

        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(insertData),
            dataType: 'json',
            type: 'POST',
            url
        });
    }

    /**
     * Update a record in a table
     * @param  {string}   schema
     * @param  {string}   tableName  [description]
     * @param  {string}   recordId
     * @param  {object}   updateData
     */
    _updateRecord(schema, tableName, recordId, updateData) {
        return this.ajax({
            contentType: 'application/json',
            data: JSON.stringify(updateData),
            dataType: 'json',
            type: 'PUT',
            url: `${this.baseUrl + schema}/${tableName}/${recordId}?delta=${this.uriEncodedDelta}`
        });
    }

    /**
     * returns a "data" object for ajax requests with svars
     * @return {Object}
     */
    _sessionVarsData() {
        const data = {};
        const sessionVars = myw.app?.database?.getSessionVars({ includeSystem: false }); //ENH: access the database without being via the global - breaks expected way to write js tests

        if (sessionVars) data.svars = JSON.stringify(sessionVars);

        data.delta = this.delta;

        return data;
    }

    /**
     * Converts attribute query clauses into MapFish format
     * @param  {Object[]}  An array of clause objects
     * @param  {Object}    The query parameters to update
     * @return {String}         [description]
     */
    _processClausesParam(clauses, params) {
        let queryable = '';

        for (const clause of clauses) {
            let mapFishParameter;
            let mapFishOperator;
            let value = clause.value;

            mapFishOperator = this._operatorLookup[clause.operator];
            if (clause.operator == 'like' || clause.operator == 'ilike') {
                value = `%${value}%`;
            }
            if (value === null) value = '';
            mapFishParameter = `${clause.fieldName}__${mapFishOperator}`;
            params[mapFishParameter] = value;

            queryable += (queryable.length ? ',' : '') + clause.fieldName;
        }

        if (queryable !== '') {
            params.queryable = queryable;
        }
    }

    /**
     * Converts a bouding box to string format
     * @private
     * @param  {LatLngBounds} bounds
     * @return {string}
     */
    _boundsToStr(bounds) {
        if (bounds) {
            return `${bounds._southWest.lng},${bounds._southWest.lat},${bounds._northEast.lng},${bounds._northEast.lat}`;
        }
    }

    /**
     * Adds a parameter to a url unless the url already contains the parameter
     * @param {string} url
     * @param {string} paramName
     * @param {string} paramValue
     * @return {string}
     */
    _addParamToUrl(url, paramName, paramValue) {
        if (paramValue && !url.includes(`${paramName}=`)) {
            const prefix = url.includes('?') ? '&' : '?';
            url += `${prefix + paramName}=${encodeURIComponent(paramValue)}`;
        }
        return url;
    }
}

export default RestServer;
