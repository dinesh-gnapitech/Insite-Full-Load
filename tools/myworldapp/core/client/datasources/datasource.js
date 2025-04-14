// Copyright: IQGeo Limited 2010-2023
import { difference, intersection, pick } from 'underscore';
import myw, { MywClass, EventsMixin, Util, trace, config, MissingFeatureDD } from 'myWorld/base';
import { Feature } from 'myWorld/features/feature';
import FieldDD from './fieldDD';

export class Datasource extends MywClass {
    static supportsFeatureDefs = false;
    static supportsFeatureUpdating = false;
    static supportsTrackChanges = false;
    static supportsMultiGeomFields = false;
    static supportsVersioning = false;
    static supportsGeomIndexing = false;
    static supportsFeatureFilters = false;
    static supportsImportFeatureDefs = false;
    static supportsNewFeatureTypes = false;
    static {
        this.include(EventsMixin);
        this.prototype.defaultFeatureModel = Feature;

        /**
         * List of regular expressions to use when matching query attribute clauses with post processing if required
         * @private
         */
        this.prototype._attributeQueryMatchers = [
            {
                // null value
                regexp: /\[(.+)]\s*(=|<>)\s*null/
            },
            {
                // String
                regexp: /\[(.+)]\s*(=|<>|like|ilike)\s*'(.+)'/
            },
            {
                // Boolean
                regexp: /\[(.+)]\s*(=|<>)\s*(true|false)/,
                postProcess(clause) {
                    // Convert value from string to boolean
                    clause.value = clause.value == 'true';
                }
            },
            {
                // Variable
                regexp: /\[(.+)]\s*(=|<>|>=|<=|>|<)\s{(.+)}/
            },
            {
                // Number
                regexp: /\[(.+)]\s*(=|<>|>=|<=|>|<)\s*(.+)/,
                postProcess(clause) {
                    // Convert value from string to number
                    clause.value = parseFloat(clause.value);
                }
            }
        ];
    }

    /**
     * @class Abstract datasource class</br>
     * @param  {Database}                database
     * @param  {myWorldDatasourceOptions}    options
     * @constructs
     */
    constructor(database, options) {
        super();
        this.setOptions(options);
        this.database = database;
        this.system = database.system;
        this.name = options.name;
        this.type = options.type;
        this.owner = options.owner;

        this.featuresDD = options.featureTypes || {};
        this.appEditableFeatureTypes = pick(
            options.featureTypes,
            featureInfo => featureInfo.editable
        );
        this.layerDefs = options.layerDefs || {};
        this.enumerators = {};
        this.catalogues = {};
        this._completeFeatureTypes = [];
        this._featureModels = {};
        this._ddPromises = {};
        this._state = 'ok';

        ['_handleError', '_handleSuccess', 'ensureLoggedIn', '_setupLoginRetry'].forEach(
            method => (this[method] = this[method].bind(this))
        );

        //wrap asynchronous api methods so they all have error and success handling
        Util.wrapMethodsWith(
            this,
            this._apiMethodWrapper.bind(this, true),
            'select',
            'getFeature',
            'getFeatures',
            'getFeaturesAround',
            'countFeatures',
            'runQuery',
            'runSearch',
            'getRelationship',
            'getLayerFeatures',
            'getFeaturesMatching',
            'runTransaction'
        );
        //wrap methods that can cache results with error handling only - we don't want to handle cached results as a success
        Util.wrapMethodsWith(this, this._apiMethodWrapper.bind(this, false), 'getDDInfoFor');

        this.initialized = Promise.resolve(this);
    }

    /**
     * Returns the name of the datasource
     * @return {string}
     */
    getName() {
        return this.options.name;
    }

    /**
     * Returns the external name of the datasource
     * @return {string}
     */
    getExternalName() {
        return (
            this.system.localise(this.options.external_name, this.options.name) +
            (this.options.masterMode ? ' (master)' : '')
        );
    }

    /**
     * Whether this datasource allows editing of features. <br/>
     * Returns false. Override in subclasses
     * @return {Boolean}
     */
    isEditable() {
        return false;
    }

    /**
     * True if this datasource is accessible
     * @param  {string}  [layerName] Name of a layer. If given, current app view mode for the layer will be taken into consideration
     * @return {Boolean}
     */
    isOk(layerName) {
        return this._state == 'ok';
    }

    /**
     * Returns the definition of a given layerName
     * @param  {string} layerName
     * @return {layerDefinition}
     */
    getLayerDef(layerName) {
        return this.layerDefs.find(l => l.name === layerName);
    }

    /**
     * Ensures the datasource is logged in
     * Obtains credentials and does login call if appropriate
     * Promise will be rejected if the login fails or the users cancels the login dialog
     * @return {Promise} Resolved (to self) when login is complete
     */
    ensureLoggedIn() {
        if (this._loginPromise) return this._loginPromise;

        this._loginPromise = this.initialized
            .then(() => this.getLoginCredentials())
            .then(credentials => {
                if (credentials === true) {
                    //needs credentials given by user
                    return this.loginWithDialog();
                } else if (credentials === false) {
                    //no credentials are necessary
                    return Promise.resolve();
                } else {
                    //use (stored) credentials
                    return this.login(credentials);
                }
            })
            .then(() => this);

        return this._loginPromise.catch(this._handleError).catch(this._setupLoginRetry);
    }

    /**
     * Returns the credentials to use for the login request
     * Returns true if it needs credentials by user
     * Returns false if login is not necessary
     * @return {object|boolean}  Keyed on field name
     */
    getLoginCredentials() {
        if (this.options.username)
            return {
                username: this.options.username,
                password: this.options.password
            };
        else return false;
    }

    /*
     * Setups a retry of ensureLoggedIn when internet becomes available
     */
    _setupLoginRetry(reason) {
        //clear the cached promise otherwise won't retry
        this._loginPromise = undefined;
        //setup retry login when internet becomes available
        this.database.once('internetStatus-changed', e => {
            this.ensureLoggedIn().then(this._handleSuccess);
        });

        return Promise.reject(reason);
    }

    /**
     * Presents a dialog requesting the appropriate login details and then performs the login request
     * Promise is rejected if the user cancels
     * @return {Promise}            Resolved when login successful
     */
    loginWithDialog() {
        if (myw.LoginDialog) {
            const loginDialog = new myw.LoginDialog(this);
            return loginDialog.login();
        } else {
            throw new Error('LoginDialog is unavailable');
        }
    }

    /**
     * Obtain DD information for a list of feature types.
     * @param  {string[]}   types       A list of the desired feature types
     * @return {Promise<Object<featureDD>>} Will resolve with an object keyed on feature type
     */
    async getDDInfoFor(types) {
        if (!types) {
            // unexpected request, resolve to null to make sure we don't "hide" the error
            return null;
        } else {
            await this._ensureDDInfoFor(types);
            return pick(this.featuresDD, types);
        }
    }

    /**
     * Obtains information about self's editable features
     * @return {Object<featureType,object>} Keyed on feature type
     */
    getEditableFeatureTypes() {
        return pick(this.featuresDD, featureDD => featureDD.editable);
    }

    /**
     * Get features types which are versioned
     * @return {object<featureType,object>} Keyed on feature type
     */
    getVersionedFeatureTypes() {
        return pick(this.featuresDD, featureDD => featureDD.versioned);
    }

    /**
     * Obtains the field name for the primary geometry
     * @param  {string} featureTypeName
     * @return {string}
     */
    getPrimaryGeomFieldNameFor(featureTypeName) {
        const featureDD = this.featuresDD[featureTypeName];
        return featureDD?.primary_geom_name;
    }

    /**
     * Obtains a feature identified by its urn </br>
     * @param  {string}   urn      Urn of the desired feature
     * @return {Promise<Feature>}  Promise for the specified feature
     */
    getFeatureByUrn(urn, ...args) {
        const parts = urn.split('/'),
            id = parts.splice(-1)[0],
            type = parts.splice(-1)[0];

        if (parts.length > 0 && parts[0] !== this.getName()) {
            throw new Error(
                'Requested feature with a urn of a different datasource',
                urn,
                this.getName()
            );
        }

        //pass on additional arguments
        args = [type, id, ...args];
        return this.getFeature(...args);
    }

    /**
     * Get features given a list or urns
     * @param {string[]} urns
     * @param {queryParameters} options Only options controlling aspects to obtain are used
     */
    getFeaturesByUrn(urns, ...args) {
        return Promise.all(urns.map(urn => this.getFeatureByUrn(urn, ...args)));
    }

    /**
     * Queries the database for features filtered on a field criteria
     * @param  {string}   featureType Name of the table/feature
     * @param  {string}   field     Name of the field to filter on
     * @param  {string}   operator  Operator to use on the filter: "=" or "like"
     * @param  {string}   value     Value to filter on
     * @return {Promise<Array<Feature>>}  Promise for the resulting features
     */
    getFeaturesByValue(featureType, field, operator, value) {
        if (operator == 'equals') operator = '=';

        const params = {
            limit: config['core.queryResultLimit'],
            clauses: [
                {
                    fieldName: field,
                    operator: operator,
                    value: value
                }
            ]
        };
        return this.getFeatures(featureType, params);
    }

    /**
     * Create a new detached feature
     * @param  {string}   featureType     feature type
     * @return {Feature}
     */
    async createDetachedFeature(featureType) {
        await this._ensureDDInfoFor([featureType]);
        const FeatureClass = this._getFeatureClassFor(featureType);
        return new FeatureClass(null, true);
    }

    /**
     * Creates a new detached feature with properties and geometry copied from a given feature
     * @param {Feature} feature
     * @return {Feature}
     */
    createDetachedFrom(feature) {
        return feature.clone();
    }

    /**
     * Creates a new detached feature with properties and geometry copied from a given featureJson
     * @param  {string}   featureType     Type of feature to create
     * @param {GeoJSON} featureJson     Geojson to copy onto new detached feature
     * @return {Feature}
     */
    async createDetachedFromJson(featureType, featureJson) {
        const detached = await this.createDetachedFeature(featureType);
        detached.copyValuesFrom(featureJson);
        return detached;
    }

    /**
     * Insert a feature to a datasource. <br/>
     * Receives either a detached feature or a feature type and geojson
     * @param  {Feature|string}   detachedFeatureOrFeatureType
     * @param  {featureData}  [insertData]
     * @param  {boolean}   [update=false] If true, an id is provided and feature already exits, update
     *                                    it instead of throwing an error
     * @return {Promise<number|string>}    Promise for the id of the inserted feature
     */
    insertFeature(detachedFeatureOrFeatureType, insertData, update = false) {
        const { type, geojson } = this._parseInsertArgs(detachedFeatureOrFeatureType, insertData);
        return this._insertFeature(type, geojson, update);
    }

    /**
     * Insert a detached feature to a datasource. <br/>
     * @param  {Feature}   detachedFeature
     * @param  {boolean}   [update=false] If true, an id is provided and feature already exits, update
     *                                    it instead of throwing an error
     * @return {Promise<Feature>}    Promise for the feature after insertion
     */
    async insertAndGetFeature(detachedFeature, update = false) {
        const key = await this.insertFeature(detachedFeature, undefined, update);
        return this.getFeature(detachedFeature.getType(), key);
    }

    /**
     * Updates a feature in a datasource. <br/>
     * Receives either an existing feature or a feature type, feature id and geojson with the changes to apply
     * @param  {Feature|string}   featureOrType
     * @param  {string}   [featureId]
     * @param  {featureData}   [updateData]
     * @return {Promise<boolean>}    Promise for the success of the operation
     */
    updateFeature(featureOrType, featureId, updateData) {
        let featureType, feature;
        if (typeof featureOrType == 'string') {
            featureType = featureOrType;
        } else {
            //instance of Feature
            feature = featureOrType;
            featureType = feature.type;
            featureId = feature.getId();
            updateData = feature.asGeoJson();
        }
        return this._updateFeature(featureType, featureId, updateData);
    }

    /**
     * Delete a feature<br/>
     * Receives either an existing feature or a feature type and id
     * @param  {Feature|string}   featureOrType
     * @param  {string}   [featureId]
     * @return {Promise}    Promise which will resolve when the operation has completed
     */
    deleteFeature(featureOrType, featureId) {
        let featureType, feature;
        if (typeof featureOrType == 'string') {
            featureType = featureOrType;
        } else {
            //instance of Feature
            feature = featureOrType;
            featureType = feature.type;
            featureId = feature.getId();
        }
        return this._deleteFeature(featureType, featureId);
    }

    /**
     * Returns the networks a given feature can be part of
     * @param  {MyWorldFeature} feature
     * @return {Promise}         Network properties keyed on network name
     */
    getNetworksFor(feature) {
        return Promise.resolve({});
    }

    /**
     * Sends a request via the myWorld server<br/>
     * Uses the url specified in the datasource definition
     * @param  {Object}     requestParams   Key/value pairs that will be passed on as url parameters
     * @param  {string}     [options.urlFieldName='url']    Name of property in datasource's spec that holds the base url for the request
     * @param  {string}     [options.relativeUrl='']        Relative url to append to the base url
     * @return {Promise<Object>}  Promise for the results (parsed from json)
     */
    tunnelRequest(requestParams, options) {
        return this.system.tunnelDatasourceRequest(this.getName(), requestParams, options);
    }

    /*
     * Returns a url for tunneled requests
     * @param  {object}     requestParams   Parameters to send to the external selection server
     * @param  {string}     options.featureType
     * @param  {string}     options.urlFieldName        Name of datasource field that holds the base url
     * @param  {string}     [options.relativeUrl='']
     * @return {String}     url for the request
     */
    buildTunnelRequestUrl(requestParams, options) {
        return this.system.buildTunnelDatasourceRequestUrl(this.getName(), requestParams, options);
    }

    /**
     * Wraps a datasource api method with error handling
     * @param  {boolean}  handleSuccess     Whether resolved promises should be handled as success or not
     * @param  {function} originalMethod    Original method to be wrapped
     * @return {function} New method with error/success handling
     * @private
     */
    _apiMethodWrapper(handleSuccess, originalMethod) {
        return async (...args) => {
            try {
                await this.initialized;
            } catch (reason) {
                throw new Error(
                    `Datasource '${this.options.name}' has not been successfully initialized: ${reason.message}`
                );
            }
            const originalPromise = Promise.resolve(originalMethod.apply(this, args));
            if (handleSuccess) {
                return originalPromise.then(this._handleSuccess, this._handleError);
            } else {
                return originalPromise.catch(this._handleError);
            }
        };
    }

    /**
     * Informs the database via a changed event that the datasource is "ok"
     * Call after a successful request
     * @protected
     */
    _handleSuccess(result) {
        if (this._state !== 'ok') {
            this._state = 'ok';
            this.fire('changed', { state: 'ok', datasource: this });
            trace('datasource', 2, `Datasource '${this.getName()}' state changed to ok`);
        }

        return result;
    }

    /**
     * Handles an error with accessing services by firing the changed event
     * @protected
     */
    _handleError(reason) {
        const expectedErrors = [
            'ObjectNotFoundError',
            'DuplicateKeyError',
            'UnauthorizedError',
            'BadRequest'
        ];
        const errorName = reason?.name || reason;
        if (!expectedErrors.includes(errorName)) {
            this._state = 'error';
            this.fire('changed', { state: 'error', reason, datasource: this });
            trace(
                'datasource',
                2,
                `Datasource '${this.getName()}' state changed to error: ${reason}`
            );
            trace('datasource', 4, reason.stack);
        }

        return Promise.reject(reason);
    }

    /**
     * Returns a of Feature instance from a feature's data<br/>
     * _ensureDDInfoFor() should be called beforehand
     * @param  {featureData}    featureData         Objects obtained from parsing json results
     * @param  {string}         featureType         Type of feature
     * @param  {object}         options             Options to be passed on to constructor
     * @returns {}
     * @protected
     */
    _asFeature(featureData, featureType, options) {
        const featureClass = this._getFeatureClassFor(featureType);

        return new featureClass(featureData, options);
    }

    /**
     * Obtains the JavaScript class to instantiate a feature of the given type <br/>
     * _ensureDDInfoFor() should be called beforehand
     * @param  {string}     [featureType]     Type of feature
     * @return {Class}
     * @protected
     */
    _getFeatureClassFor(featureType) {
        const dsName = this.getName();
        const key = dsName == 'myworld' ? featureType : `${dsName}/${featureType}`;
        let FeatureModel = this._featureModels[key];
        let ParentClass;
        let featureDD;

        if (!FeatureModel) {
            //no cached feature model for this feature type yet, create it

            featureDD = this.featuresDD[featureType];
            if (featureDD) ParentClass = myw.featureModels[key] || this.defaultFeatureModel;
            else {
                //use top level class to allow usage with out-of-date DD information
                ParentClass = Feature;
                console.log(
                    `Warning: missing DD information for ${key} in datasource ${dsName}. Update DD info?`
                );
            }

            const className = featureType.replace(/[^\w]/g, '_'); //replace any special characters with '_' to ensure safe and valid syntax
            FeatureModel = eval(`class ${className} extends ParentClass {};${className};`);
            Object.assign(FeatureModel.prototype, {
                datasource: this,
                database: this.database,
                type: featureType,
                featureDD: featureDD,
                usePopupEditor:
                    ParentClass.prototype.usePopupEditor || featureDD?.editor_options?.popup
            });
            this._featureModels[key] = FeatureModel;
        }
        return FeatureModel;
    }

    /**
     * Returns the appropriate JS class to instante a layer
     * @param  {layerDefinition}    layerDef        Layer definition. Property 'jsClass' will be used to look for the desired class
     * @param  {function}           defaultClass    Class to use if
     * @return {function}              Class constructor
     * @protected
     */
    _getLayerClassFor(layerDef, defaultClass) {
        const Layer =
            (typeof layerDef.jsClass === 'function'
                ? layerDef.jsClass
                : Util.evalAccessors(layerDef.jsClass)) || defaultClass;

        if (typeof Layer !== 'function') {
            throw new Error(
                `Definition for ${layerDef.name} doesn't evalute to a class. Expression: ${layerDef.jsClass}`
            );
        }

        return Layer;
    }

    /**
     * Ensures DD information is available for given feature types.
     * Request information (by calling _fetchDDInfoForTypes()) only if the information is not cached and has not already been requested
     * @param  {Array<string>} types An array with feature types
     * @return {Promise} Resolved when the information for all requested types is available
     * @private
     */
    async _ensureDDInfoFor(types) {
        //ENH: provide a method to invalidate the cache (useful for native app)
        const promises = this._ddPromises;
        const allTypesRequested = Object.keys(promises);
        const typesToRequest = difference(types, allTypesRequested);
        const typesOnTheWay = intersection(types, allTypesRequested);
        let promisesTypesOnTheWay = Object.entries(promises)
            .filter(([key, value]) => typesOnTheWay.includes(key))
            .map(([key, value]) => value);

        if (typesToRequest.length > 0) {
            const promise = this._getDDInfoForTypes(typesToRequest);
            typesToRequest.forEach(type => {
                promises[type] = promise;
            });
            promisesTypesOnTheWay = promisesTypesOnTheWay.concat([promise]);
        }

        await Promise.all(promisesTypesOnTheWay);
        const missingTypes = difference(types, Object.keys(this.featuresDD));
        if (missingTypes.length > 0) {
            throw new MissingFeatureDD(`Missing DD information for types:${missingTypes}`);
        }
    }

    /**
     * Obtains and processes DD information for the given feature types. <br/>
     * Obtains the DD information from the myWorld system. Can be overriden in subclasses.
     * @param  {string[]} types Feature types
     * @return {Promise} Promise which will resolve when the DD information has been processed
     * @protected
     */
    _getDDInfoForTypes(types) {
        // request from the server the DD information
        return this._fetchDDInfoForTypes(types).then(data => {
            // add the received DD information to the dd property
            Object.entries(data.features_dd).forEach(([key, featureDD]) => {
                this._completeFeatureTypes.push(key);
                if (key in this.featuresDD) Object.assign(this.featuresDD[key], featureDD);
                else this.featuresDD[key] = featureDD; //ENH: consider including all accessible features in startup info (not just application accessible)
            });
            Object.assign(this.enumerators, data.enumerators);
            Object.assign(this.catalogues, data.catalogues);

            const localise = this.system.localise.bind(this.system);

            //Go over the new features to setup additional properties:
            //- setup a defaults object
            //- link enumerated fields with the enumerator definition
            for (const featureType in data.features_dd) {
                const featureDD = this.featuresDD[featureType];
                if (!featureDD) continue;
                featureDD.defaults = {};
                featureDD.external_name = localise(featureDD.external_name, featureDD.name);
                if (featureDD.field_groups.length) {
                    featureDD.field_groups = featureDD.field_groups.map(group => {
                        const missing_language_text = `${featureType}.groups[${group['position']}]`;
                        group['display_name'] = localise(group.display_name, missing_language_text);
                        return group;
                    });
                }
                for (const [fieldName, field] of Object.entries(featureDD.fields)) {
                    const fieldDD = new FieldDD(field, featureDD, this, this.system);
                    featureDD.fields[fieldName] = fieldDD;

                    if (Object.prototype.hasOwnProperty.call(fieldDD, 'default')) {
                        featureDD.defaults[fieldName] = fieldDD['default'];
                    }
                }
            }

            return this.featuresDD;
        });
    }

    /**
     * Fetches DD information for the given feature types
     * @private
     * @param  {string[]} types Feature types
     * @return {Promise} Promise which will resolve when the DD information is available
     */
    _fetchDDInfoForTypes(types) {
        // request from the server the DD information
        return this.system.server.getDDInfoForTypes(this.name, types);
    }

    /**
     * Insert a feature to the datasource
     * @param  {Feature|string}   detachedFeatureOrFeatureType
     * @param  {featureData}  [insertData]
     * @return {Promise<number>}    Promise for the id of the inserted feature
     * @protected
     */
    _insertFeature(detachedFeatureOrFeatureType, insertData) {
        throw new Error(`Missing implementation of _insertFeature() for ${this.getName()}`);
    }

    /**
     * Update a feature in the datasource
     * @param  {string}   featureOrType
     * @param  {string}   [featureId]
     * @param  {featureData}   [updateData]
     * @return {Promise<boolean>}    Promise for the success of the operation
     * @protected
     */
    _updateFeature(featureOrType, featureId, updateData) {
        throw new Error(`Missing implementation of _updateFeature() for ${this.getName()}`);
    }

    /**
     * Delete a feature from the datasource
     * @param  {string}   featureOrType
     * @param  {string}   [featureId]
     * @return {Promise}    Promise which will resolve when the operation has completed
     * @protected
     */
    _deleteFeature(featureOrType, featureId) {
        throw new Error(`Missing implementation of _deleteFeature() for ${this.getName()}`);
    }

    /**
     * Returns autocomplete suggestions for executing an "in window" query
     * @param  {string}            searchTerm   Text to search for
     * @param  {Array<featureDD>}  featureTypes Feature types to get queries for
     * @return {Array<autoCompleteResult>}
     * @protected
     */
    _querySuggestions(searchTerm, featureTypes) {
        const suggestions = [];

        Object.entries(featureTypes).forEach(([featureTypeName, featureDD]) => {
            featureDD.queries.forEach(queryDef => {
                if (
                    queryDef.lang &&
                    myw.localisation.languageAsPerSetting &&
                    queryDef.lang !== myw.localisation.languageAsPerSetting
                )
                    return;

                const extraTerms = Util.termsMatch(searchTerm, queryDef.matched_value);
                if (extraTerms !== '') return; //false -> didn't match, truthy -> remaining terms

                //all terms matched the query, return suggestion(s) for this query definition
                const suggestion = this._querySuggestion.bind(this, featureTypeName, queryDef);
                if (this.options.fullQuery) suggestions.push(suggestion());
                if (this.options.inWindowQuery) suggestions.push(suggestion('window'));
                if (this.options.inSelectionQuery) suggestions.push(suggestion('selection'));
            });
        });

        return suggestions;
    }

    /**
     * Returns a new query suggestion
     * @return {object}
     * @protected
     */
    _querySuggestion(featureTypeName, queryDef, spatialRestriction) {
        const suggestion = {
            label: queryDef.display_value,
            value: queryDef.matched_value,
            type: 'query',
            data: {
                feature_type: featureTypeName,
                id: queryDef.display_value, //used in search control to group queries
                spatial_restriction: spatialRestriction,
                has_geometry: true
            }
        };
        if (queryDef.attrib_query) {
            suggestion.data.clauses = this._parseAttributeQuery(queryDef.attrib_query);
        }
        return suggestion;
    }

    /**
     * For a given search text, obtains the matched featureTypes and remaining (umatched) terms
     * @param  {string}         searchTerm   Search terms (typed by a user)
     * @param  {featuresDD}  featureTypes Feature types to search on
     * @return {searchDetails}
     * @private
     */
    _getSearchDetailsFor(searchTerm, featureTypes) {
        const result = {};

        Object.entries(featureTypes).forEach(([featureType, featureDD]) => {
            const idTerms = featureDD.search_id_terms;
            if (!idTerms) return;

            const extraTerms = Util.termsMatch(searchTerm, idTerms.join(' '));

            if (extraTerms === false) {
                //no matches
            } else {
                result[featureType] = { dd: featureDD, extraTerms: extraTerms };
            }
        }, this);

        return result;
    }

    /**
     * Parse the attribute query string
     * @private
     * @param  {string} attributeQuery  The attribute query. Example: [urgent]=true & [problem_type]='Wires Down'
     * @return {Array<clause>}  An array of clause objects
     */
    _parseAttributeQuery(parseAttributeQuery) {
        const clauseStrings = parseAttributeQuery.split('&');
        const clauses = clauseStrings.map(clauseString =>
            this._parseAttributeQueryClause(clauseString)
        );

        //exclude null clauses before returning
        return clauses.filter(clause => clause);
    }

    /**
     * Parse a single attribute query clause
     * @private
     * @param  {string} attributeClause  The attribute query clause. Example: [problem_type]='Wires Down'

     * @return {queryClause}  A clause object (or nothing if the clause is invalid)
     */
    _parseAttributeQueryClause(attributeClause) {
        if (!attributeClause) return; // Empty string, don't return a clause

        for (const matcher of this._attributeQueryMatchers) {
            const clause = this._matchAttributeQueryClause(matcher, attributeClause);
            if (clause) return clause;
        }

        // No match found, don't return a clause
        console.log(`Error processing query clause: ${attributeClause}`);
    }

    /**
     * See if the clause string matches the form expected by the matcher. If so
     * return the corresponding clause object
     * @private
     * @param  {string} attributeClause  The attribute query clause string
     * @return {Clause}  A clause object (or null if the clause string does not match)
     */
    _matchAttributeQueryClause(matcher, attributeClause) {
        let clause;
        let value;
        const matches = matcher.regexp.exec(attributeClause);

        if (matches) {
            value = matches.length > 3 ? matches[3] : null; //handle null value case

            clause = {
                fieldName: matches[1],
                operator: matches[2],
                value: value
            };

            if ('postProcess' in matcher) {
                matcher.postProcess(clause);
            }
        }
        return clause;
    }

    /*
     * Processes arguments to insertFeature,
     * which receives either a detached feature or a feature type and geojson
     * Returns an object of the format: {type, geojson}
     * @param {*} detachedFeatureOrFeatureType
     * @param {*} insertData
     */
    _parseInsertArgs(detachedFeatureOrFeatureType, insertData) {
        if (typeof detachedFeatureOrFeatureType == 'string') {
            return { type: detachedFeatureOrFeatureType, geojson: insertData };
        }
        //first arg is instance of Feature
        const feature = detachedFeatureOrFeatureType;
        return { type: feature.type, geojson: feature.asGeoJson() };
    }

    /**
     * Returns empty string - overridden in myWorldDatasource
     * @returns {string} ''
     */
    getDelta() {
        return '';
    }
}

export default Datasource;
