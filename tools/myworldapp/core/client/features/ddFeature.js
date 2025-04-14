// Copyright: IQGeo Limited 2010-2023
import { difference, result } from 'underscore';
import { Util, FilterParser } from 'myWorld/base';
import { UnauthorizedError, MissingImplementationError } from 'myWorld/base/errors';
import { Feature } from 'myWorld/features/feature';

export class DDFeature extends Feature {
    static {
        /** Set to true in sub-classes to specify that the editor for these features should start in Popup mode
         * @type {boolean} */
        this.prototype.usePopupEditor = undefined;

        /** When usePopupEditor is set to true, set in sub-classes to specify the width that the popup editor should use.
         * Will be overridden by the value in the config pages if it is set there
         * @type {number}*/
        this.prototype.popupEditorWidth = undefined;

        /** Override in sub-classes to specify a custom editor class to be used when editing features
         * @type {FeatureEditor} */
        this.prototype.editorClass = undefined;

        /** Override in sub-classes to specify a custom field editors for given fields.
         *  Keyed on field's internal name
         * @type {Object<FieldViewer>} */
        this.prototype.fieldEditors = {};

        /** Override in sub-classes to specify default values when creating a new feature <br/>
                    Values specified here override ones specified in the database
         *  Keyed on field's internal name
         * @type {Object<string|number>} */
        this.prototype.defaults = {};
    }

    /**
     * @class  Abstract class for a feature supported on data dictionary (DD) stored in myWorld <br/>
     *         A subclass holding the featureDD and other common properties will be generated for each feature type<br/>
     *         Use as super-class for feature models of external feature types
     *         Detached records should be created using database.createDetachedRecord()
     * @constructs
     * @param {featureData}     featureData Feature details
     * @augments Feature
     */
    constructor(featureData, options) {
        // Call the super constructor
        super(featureData);

        if (!this.id) this.id = this.properties[this.featureDD.key_name];

        /** Self's DD information
         * @memberof Feature.prototype
         * @member {featureDD} featureDD */

        /** Whether this is feature is new (detached from database) or not
         * @type {Boolean} */
        this.isNew = !featureData;

        this._loadedAspects = {};

        this._loadedAspects['simple'] = true;
        this._loadedAspects['display_values'] = true;
        this._loadedAspects['lobs'] = true;
        this._loadedAspects['calculated'] = false;

        if (!featureData) {
            //detached feature
            this.id = null;

            //set default values
            //defaults defined in feature's model class will override the ones defined in DD
            Object.assign(this.properties, this.featureDD.defaults, result(this, 'defaults'));
        } else {
            this._deSerialise(featureData);
        }
    }

    /**
     * Returns the geometry field that holds a geometry in a given world
     * @param {string}  worldName   Name of the world of the desired geometry
     * @return {string}  Name of geometry field
     */
    getGeometryFieldNameInWorld(worldName) {
        const geom = this.geometry;
        const geomWorldName = geom?.world_name || 'geo';

        // Primary geometry is the one we are after.
        if (geom && geomWorldName == worldName) {
            return this.featureDD.primary_geom_name;
        } else {
            const fieldName = Object.keys(this.secondary_geometries || {}).find(
                k => this.secondary_geometries[k]?.world_name == worldName
            );
            return fieldName;
        }
    }

    /**
     * Returns the geometry field that can hold a geometry in a given world
     * @param {string}  worldName   Name/id of the world
     * @return {string}  Name of geometry field
     */
    getGeometryFieldNameForWorld(worldName) {
        const worldType = worldName.split('/')[0];
        const fields = this.featureDD.fieldsByWorldType[worldType] ?? [];
        const primaryGeomFieldName = this.featureDD.primary_geom_name;
        if (fields.includes(primaryGeomFieldName)) return primaryGeomFieldName;
        else return fields[0];
    }

    /**
     * Returns the names of self's geometry fields that has a value in a specific world
     * @param {string}  worldName   Name of the world of the desired geometry
     * @return {Array<string>}  Names of geometry field
     */
    getGeometryFieldNamesInWorld(worldName) {
        let fieldNames = [];
        const geom = this.geometry;
        const geomWorldName = geom?.world_name || 'geo';

        if (geom && geomWorldName == worldName) {
            fieldNames.push(this.featureDD.primary_geom_name);
        }

        if (this.secondary_geometries) {
            const secFieldNames = Object.keys(this.secondary_geometries).filter(
                fieldName => this.secondary_geometries[fieldName]?.world_name === worldName
            );
            fieldNames = fieldNames.concat(secFieldNames);
        }

        return fieldNames;
    }

    /**
     * Ensures properties for the specified aspects are available.
     * @param  {featureAspect|featureAspect[]}    aspects  Aspect(s) to ensure
     * @param  {boolean}    [reload=false]   If true, details are re-obtained from server
     * @return {Promise}    Promise that is resolved when the feature data as been obtained
     */
    ensure(aspects, reload = false) {
        if (this.isNew) return Promise.resolve();

        if (this.featureDD.unauthorized) return Promise.reject(new UnauthorizedError());

        if (aspects && typeof aspects.valueOf() === 'string') aspects = [aspects];

        const missingAspects = this.missingAspects(aspects);
        if (missingAspects.length || reload) {
            return this.getDetails(reload, missingAspects);
        } else {
            // nothing missing
            return Promise.resolve(this);
        }
    }

    /**
     * Returns the aspects that are not available from a given list of aspects
     * @param {featureAspect[]} aspects    List of aspects to check.
     * @returns {featureAspect[]}
     */
    missingAspects(aspects) {
        return aspects.filter(prop => !this._loadedAspects[prop]);
    }

    /**
     * Returns true if the given aspects are all available
     * @param {featureAspect[]} aspects    List of aspects to check.
     * @returns {boolean}
     */
    hasAspects(aspects) {
        const missingAspects = this.missingAspects(aspects);
        return missingAspects.length === 0;
    }

    /**
     * Loads/reloads all of the properties of this feature from the server.
     * @param  {boolean}    [reload=false]      If there are details available, whether to obtain new details or not
     * @param  {string[]}   [missingAspects]    Aspects that are missing and should be obtained
     * @return {Promise} Resolved if/when the feature properties have been updated
     */
    getDetails(reload, missingAspects = []) {
        const //aspects missing even when considering a possible pending request
            reallyMissing = difference(missingAspects, this._expectedAspects),
            //true means the missing aspects will be received with the pending request
            onTheWay = this._getDetailsPromise && !reallyMissing.length,
            needMoreProperties = !onTheWay;

        if (reload || needMoreProperties) {
            let promise;

            const includeLobs =
                missingAspects.includes('lobs') || (reload && this._loadedAspects['lobs']);

            this._expectedAspects = missingAspects;

            if (reload || missingAspects.find(a => a !== 'calculated')) {
                //there are aspects we need to get from the database
                promise = this.datasource
                    .getFeatureByUrn(this.getUrn(), includeLobs, this.getDelta())
                    .then(this.mergeFeatureDetails.bind(this, includeLobs));
            } else {
                //we only need the calculated properties
                promise = Promise.resolve();
            }

            if (reload || missingAspects.includes('calculated')) {
                promise = promise //make sure we first got the properties from the db, before doing the calculations
                    .then(this._getCalculatedValues.bind(this))
                    .then(() => {
                        this._loadedAspects['calculated'] = true;
                        return this;
                    });
            }

            this._getDetailsPromise = promise;
        }
        return this._getDetailsPromise;
    }

    /**
     * properties obtained from the database and updates self with them
     * @param  {boolean} includeLobs
     * @return {Promise}
     * @protected
     */
    mergeFeatureDetails(includeLobs, feature) {
        if (!this.geometry && feature.geometry) this.geometry = {};

        Object.assign(this.properties, feature.properties);
        if (feature.geometry) Object.assign(this.geometry, feature.geometry);

        this.displayValues = feature.displayValues;

        if (feature.secondary_geometries) {
            this.secondary_geometries = {};
            Object.assign(this.secondary_geometries, feature.secondary_geometries);
        }

        this._loadedAspects['simple'] = true;
        this._loadedAspects['display_values'] = true;
        //for optional properties we need to consider previous value for reload requests and "simultaneous" requests of different property types
        this._loadedAspects['lobs'] = this._loadedAspects['lobs'] || includeLobs;

        this._expectedAspects = null;

        return this;
    }

    /**
     * Get (and stores on self) the values for the calculated properties
     * @return {Promise} Promise to be resolved when all the properties have been set on self
     * @private
     */
    _getCalculatedValues() {
        const requests = [];
        const setProperty = function (fieldName, value) {
            this.properties[fieldName] = value;
        };
        const errorHandler = function (fieldName, reason) {
            this.displayValues[fieldName] = reason;
        };

        for (const [fieldName, fieldDD] of Object.entries(this.featureDD.fields)) {
            //reference_set field are only calculated on-demand
            if (fieldDD.value?.startsWith('method(') && fieldDD.baseType != 'reference_set') {
                const result = this.getCalculatedValueFor(fieldDD);
                requests.push(
                    Promise.resolve(result)
                        .then(setProperty.bind(this, fieldName))
                        .catch(errorHandler.bind(this, fieldName))
                );
            }
        }
        return Promise.all(requests);
    }

    /**
     * Calculate value for a calculated field.
     * @param  {fieldDD}  fieldDD
     * @return {Object}            result of calculation
     */
    getCalculatedValueFor(fieldDD) {
        //return undefined if we don't have a calculated field.
        if (!fieldDD.value || !fieldDD.value.startsWith('method(')) return undefined;

        const fieldName = fieldDD.internal_name;
        const methodName = fieldDD.value.slice(7).split(')')[0];
        let result;
        if (!this[methodName]) {
            this.displayValues[fieldName] = new MissingImplementationError(
                `Expected '${this.getUrn()} to respond to '${methodName}'`
            );
            console.log(`***Error: Expected '${this.getUrn()} to respond to '${methodName}'`);
            return;
        }

        try {
            result = this[methodName]();
        } catch (e) {
            result = undefined;
            console.log(`Error executing method '${methodName}' on ${this.getUrn()}: `, e);
            this.displayValues[fieldName] = e;
        }
        return result;
    }

    /**
     * Returns the title for self<br/>
     * Overridden to use expression specified in Data Dictionary
     * @return {string}
     */
    getTitle() {
        return this._evaluateFieldExpression(this.featureDD.title_expr, `${this.type}.title`);
    }

    /**
     * Returns short descritption for self <br/>
     * Overridden to use expression specified in Data Dictionary
     * @return {string}
     */
    getShortDescription() {
        return this._evaluateFieldExpression(this.featureDD.short_description_expr);
    }

    /**
     * External name of self's feature type
     * @return {string}
     */
    getTypeExternalName() {
        return this.featureDD.external_name;
    }

    /**
     * Returns Field group information or undefined if none is defined...
     * @return {Array<fieldGroup>}
     */
    getFieldGroups() {
        const fieldGroups = this.featureDD.field_groups;
        if (fieldGroups?.length > 0) return fieldGroups;
    }

    /**
     * Returns the order in which fields should be presented to the user. If no field groups defined then explicitly exclude
     * internal fields including world name fields and geometry fields.
     * @param {object}  options
     * @param {boolean} [options.includeSeparators=false] Include separators in the returned list
     * @return {Array<string>} List of field names (with or without separators)
     */
    getFieldsOrder(options = {}) {
        const { includeSeparators = false } = options;
        const fieldGroups = this.getFieldGroups();
        if (fieldGroups) {
            const fieldNameList = fieldGroups
                .map(f => f.fields)
                .flat()
                .map(f => f.field_name);
            return includeSeparators
                ? fieldNameList
                : fieldNameList.filter(item => !Util.isJson(item)); //remove the separators
        } else {
            const fieldsOrder = this.featureDD.fields_order.length
                ? this.featureDD.fields_order
                : Object.keys(this.properties);
            return difference(fieldsOrder, this._excludedFields).filter(value => {
                const isGeom = ['point', 'linestring', 'polygon', 'raster'].includes(
                    this.getFieldDD(value).type
                );
                return !(value.match(/myw_gwn_.*|myw_orientation_.*/) || isGeom);
            });
        }
    }

    getFieldDD(internalName) {
        const fieldsDD = this.featureDD.fields; //don't want to use getFieldsDD() as it can go into infinite recursion if somehow featureDD.fields doesn't exist

        return fieldsDD?.[internalName] || super.getFieldDD(internalName);
    }

    parseSeparator(jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed['type'] === 'separator') {
            parsed.label = this.database.system.localise(parsed.label);
            return parsed;
        }
    }

    getFieldsDD() {
        const fieldsDD = this.featureDD.fields;
        if (fieldsDD) return fieldsDD;
        else {
            //fields is missing - DD needs to be updated from external server?
            return Object.keys(this.properties).reduce((prev, fn) => {
                prev[fn] = this.getFieldDD(fn);
                return prev;
            }, {});
        }
    }

    /**
     * Feature is editable if
     * 1. is in list of editable features in app
     * 2. is updateable from gui
     * 3. isn't from delta schema request (ex: from a forward view layer request)
     */
    isEditable() {
        const isEditableTypeInApp = this.featureDD.name in this.datasource.appEditableFeatureTypes;
        return isEditableTypeInApp && this.featureDD.update_from_gui && !this.isDeltaSchema();
    }

    /**
     * Gets the dd for the primary geometry of the feature
     * @return {object}
     */
    primaryGeomFieldDD() {
        return this.featureDD.fields[this.featureDD.primary_geom_name];
    }

    /**
     * @return {string} Geometry type of this feature from the DD mapped to GeoJSON geometry type. <br/>
     *                  Returns undefined if the DD doesn't specify a geometry type
     */
    getDDGeometryType(fieldName) {
        const internalType = fieldName
            ? this.featureDD.fields[fieldName].type
            : this.featureDD.geometry_type;
        return Feature.geomMapTable[internalType];
    }

    /**
     * Parses the given filter string and evaluates it using with self's properties
     * @param {string} filter  A filter expression. Example '[urgent]=true & [reporter]={user}'
     * @param {boolean} [defaultValue=true]  What to return if filter is undefined or empty (falsy)
     * @returns {boolean}
     */
    matchesFilter(filter, defaultValue = true) {
        if (!filter) return defaultValue;
        const predicate = new FilterParser(filter).parse();
        return this.matchesPredicate(predicate);
    }

    /**
     * Evaluates the given predicate with self's properties
     * @param {DBPredicate} predicate
     * @returns {boolean}
     */
    matchesPredicate(predicate) {
        const sessionVars = this.database.getSessionVars();
        return predicate.matches(this, sessionVars);
    }

    /*
     * de-serialise all field values.
     */
    _deSerialise(featureData) {
        const { properties: props } = featureData;
        for (const [key, value] of Object.entries(props)) {
            if (!value) continue;

            const fieldDD = this.getFieldDD(key);
            const fieldType = fieldDD?.type;

            this._deSerialiseField(props, key, fieldType);
        }
    }

    /*
     * de-serialise a single field value.
     * e.g. dates/times from string to Date objects
     */
    _deSerialiseField(props, key, fieldType) {
        if (fieldType == 'timestamp') {
            let value = props[key];
            if (value.split('Z')[1] === undefined) {
                //string doesn't include timezone info - assume UTC
                value = value + 'Z';
            }
            props[key] = new Date(value);
        }
    }
}

/**
 * A string specifiyng a type of feature data  <br/>
 * Supported aspects are: <br/>
 *     'simple':            stored properties of the feature, excluding lobs <br/>
 *     'display_values':    additional values to be used for displaying to the user <br/>
 *     'lobs'               large object properties. Currently only properties of type 'image'
 *     'calculated'         calculated properties of the feature
 * @typedef {string} featureAspect
 */

export default DDFeature;
