// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { MywClass } from 'myWorld/base/class';
import { EventsMixin } from 'myWorld/base/eventsMixin';
import { evalAccessors } from 'myWorld/base/util';
import geometry from 'myWorld/base/geometry';

export class Feature extends MywClass {
    static {
        this.include(EventsMixin);

        /** (static) Override in sub-classes to specify a custom viewer class to be used when displaying features
         * @type {FeatureViewer}
         */
        this.prototype.viewerClass = undefined; // used in custom code

        /** (static) Override in sub-classes to specify custom field viewers for given fields.
         *  Keyed on field's internal name
         * @type {Object<FieldViewer>}
         */
        this.prototype.fieldViewers = {};

        this.prototype._evaluateFieldRegExp = /\[([^\]]+)\]/g;
    }

    /**
     * Map from myWorld DD geometry type to GEOJson geometry type
     * @type {Object<string>}
     */
    static geomMapTable = { point: 'Point', linestring: 'LineString', polygon: 'Polygon' };

    /**
     * @class  Abstract class for a generic feature <br/>
     *         A subclass holding the featureDD and other common properties will be generated for each feature type<br/>
     *         Use as super-class for feature models of external feature types
     *         Detached records should be created using database.createDetachedRecord()
     * @constructs
     * @param {featureData}     featureData Feature details
     */
    constructor(featureData, options) {
        super();
        featureData = featureData || {};

        /** The feature's type
         * @memberof Feature.prototype
         * @member {string} */

        /** Access to datasource
         * @memberof Feature.prototype
         * @member {IDatasource} datasource */

        //id of the feature
        this.id = featureData.id;
        //properties (field values)
        this.properties = featureData.properties || {};

        this.displayValues = featureData.display_values || {};

        // Transform geometry information into form that easier to work with
        this.geometry = geometry(featureData.geometry);

        if (featureData.geo_geometry) this.geo_geometry = geometry(featureData.geo_geometry);
        if (featureData.bounds) this.bounds = featureData.bounds;

        if (this.geometry) {
            this.geometry.world_name = featureData.properties.myw_geometry_world_name || 'geo';
            this.geometry.world_type = this.geometry.world_name.split('/')[0];
        }

        if (featureData.secondary_geometries) {
            this.secondary_geometries = featureData.secondary_geometries;
            for (const k in this.secondary_geometries) {
                if (this.secondary_geometries[k]) {
                    this.secondary_geometries[k] = geometry(this.secondary_geometries[k]);
                    const world_name = this.properties[`myw_gwn_${k}`] || 'geo';
                    this.secondary_geometries[k].world_name = world_name;
                    this.secondary_geometries[k].world_type = world_name.split('/')[0];
                }
            }
        }

        //If the feature is part of a MywFeature layer, this will be a reference to it. @type {MywVectorLayer}
        this.layer = null;
    }

    /**
     * @return {string} the system id of this feature
     */
    getId() {
        return this.id;
    }

    /**
     * @return {string} the feature's type
     */
    getType() {
        return this.type;
    }

    /**
     * @return {univFeatureType} the feature's type including datasource name (if not myworld)
     */
    getUniversalType() {
        return this.featureDD.ufn;
    }

    /**
     * @return {string} the urn (system wide identifier) of this feature
     */
    getUrn() {
        return [this.datasource.getName(), this.type, this.id].join('/');
    }

    /**
     * Returns geometry of the fieldName. If argument is not provided returns self's geometry
     * @return {Geometry}
     */
    getGeometry(fieldName) {
        if (fieldName && fieldName !== this.featureDD?.primary_geom_name) {
            return this.secondary_geometries?.[fieldName] || null;
        } else {
            return this.geometry;
        }
    }

    /**
     * Override in a subclass to define the style to use when self is being highlighted on the map for being
     * the currentFeature or part of the currentFeatureSet
     * @param  {MapControl}  map  Map instance
     * @return {styleDefinition}
     */
    getCurrentFeatureStyleDef(map) {
        return undefined;
    }

    /**
     * Returns True if self is owner of a given world
     * @param  {string}  worldName World name
     * @return {Boolean}
     */
    isWorldOwner(worldName) {
        return false; // only myWorld features can be world owners
    }

    /**
     * Returns self's geometry in a specific world
     * @param {string}  worldName   Name of the world of the desired geometry
     * @return {Geometry}
     */
    getGeometryInWorld(worldName) {
        let geom = this.geometry;
        const geomWorldName = geom?.world_name || 'geo';

        if (geom && geomWorldName == worldName) {
            // Primary geometry is the one we are after.
            return geom;
        } else {
            // Look at secondary geometry and finally geo_geometry
            geom = Object.values(this.secondary_geometries || {}).find(
                g => g?.world_name === worldName
            );
            if (!geom && this.geo_geometry && worldName == 'geo') return this.geo_geometry;
            return geom;
        }
    }

    /**
     * Returns geometry for a feature for the specified world type
     * @param  {string} worldType   World type. For example: 'floorplan'
     * @return {Geometry}          Geometry of the feature for the specified world type
     */
    getGeometryForWorldType(worldType) {
        let geom = this.geometry;
        if (!geom || geom.world_type != worldType) {
            //look in secondary geometries
            geom = Object.values(this.secondary_geometries || {}).find(
                g => g?.world_type === worldType
            );
        }
        return geom;
    }

    /**
     * @param {string}  [worldName='geo']   Name of the world of the desired geometry
     * @throws {Error} If there is no geometry for that world
     * @return {string} GeoJSON geometry type of the geometry of this feature. Will
     * be one of Point, MultiPoint, LineString, MultiLineString, Polygon or MultiPolygon
     */
    getGeometryType(worldName) {
        worldName = worldName || 'geo';
        const geom = this.getGeometryInWorld(worldName);
        if (!geom)
            throw new Error(
                `Feature '${this.getUrn()}' unexpectedly doesn't have a geometry in world '${worldName}'`
            );
        return geom.type;
    }

    /**
     * @return {boolean} Whether the feature has a (primary) geometry
     */
    hasGeometry() {
        return !!this.getGeometry();
    }

    /**
     * Returns a Lat/Long coordinate representative of self in the geographic world. <br/>
     * In the default implementation it is assumed that the primary geometry is geographic
     * @return {LatLng}
     */
    getGeoLocation() {
        return this._nominalLocationForGeom(this.getGeometry());
    }

    /**
     * Returns a Lat/Long coordinate representative of self's primary geometry
     * Uses the first coordinate when the geometry is of a type other than Point
     * @return {LatLng}
     */
    getLocation() {
        return this._nominalLocationForGeom(this.getGeometry());
    }

    /**
     * Returns a field viewer for a given field if one is specified
     * Returns undefined if no custom viewer is defined
     * @param  {fieldDD} fieldDD
     * @return {FieldViewer}
     */
    getCustomFieldViewerFor(fieldDD) {
        return fieldDD.viewer_class
            ? evalAccessors(fieldDD.viewer_class)
            : this.fieldViewers[fieldDD.internal_name];
    }

    /**
     * Returns a field editor for a given field
     * Returns undefined if no custom editor is defined
     * @param  {fieldDD} fieldDD
     * @return {FieldViewer}
     */
    getCustomFieldEditorFor(fieldDD) {
        return fieldDD.editor_class
            ? evalAccessors(fieldDD.editor_class)
            : this.fieldEditors?.[fieldDD.internal_name];
    }

    /*
     * Returns a Lat/Long coordinate representative of self's primary geometry
     * Uses the first coordinate when the geometry is of a type other than Point
     * @return {LatLng}
     */
    _nominalLocationForGeom(geom) {
        if (!geom || !geom.coordinates) return null;

        //ENH: improve calculation for lines and polygons
        let coord = geom.coordinates;
        switch (geom.type) {
            case 'Point':
                break;
            case 'MultiPoint':
            case 'LineString':
                coord = coord[0];
                break;
            case 'MultiPolygon':
                coord = coord[0]?.[0]?.[0];
                break;
            default:
                coord = coord[0]?.[0];
                break;
        }
        return coord ? { lat: coord[1], lng: coord[0] } : null;
    }

    /**
     * set the geometry, primarily used with detached feature
     * @param  {string} type    type of geometry: Point, LineString, Polygon
     * @param  {Array}  coordinates  Coordinates matching the given type as per GeoJson format. See {@link http://geojson.org/geojson-spec.html#appendix-a-geometry-examples}
     * @param  {string} [worldName='geo']
     * @param  {string} [fieldName]     Name of geometry field. Defaults to primary geometry field
     */
    setGeometry(type, coordinates, worldName = 'geo', fieldName = undefined) {
        const geom = geometry({ type, coordinates });
        geom.world_name = worldName;
        geom.world_type = worldName.split('/')[0];
        if (!fieldName || fieldName == this.featureDD?.primary_geom_name) {
            this.geometry = geom;
        } else {
            if (!this.secondary_geometries) this.secondary_geometries = {};
            this.secondary_geometries[fieldName] = geom;
        }
    }

    /**
     * @returns {Object} the additional (non-geometry) properties of this feature.
     */
    getProperties() {
        return this.properties;
    }

    /**
     * Returns self's representation in GeoJson
     * @return {featureData}
     */
    asGeoJson() {
        const geojson = {
            type: 'Feature',
            properties: { ...this.getProperties() },
            geometry: { ...this.getGeometry() }
        };
        if (this.secondary_geometries) {
            geojson.secondary_geometries = { ...this.secondary_geometries };
        }

        return geojson;
    }

    /**
     * Creates a new detached feature with properties and geometry copied from self
     * @param {object} [options] See copyValuesFrom for details on options
     * @return {Feature}    New (detached) feature
     */
    clone(options = {}) {
        const { keepKey = false } = options;
        const FeatureClass = this.datasource._getFeatureClassFor(this.getType()); //ENH: replace use of private method, while keeping this method synchronous!
        const clone = new FeatureClass(null, true);
        clone.copyValuesFrom(this, { keepKey });
        return clone;
    }

    /**
     * Copies the values from another feature to self
     * By default key field is not copied
     * @param {Feature|GeoJSONFeature} [other]
     * @param {object} [options]
     * @param {object} [options.keepKey=false] If true the key field is also copied
     */
    copyValuesFrom(other, options = {}) {
        const { keepKey = false } = options;
        const keyFieldName = this.featureDD?.key_name;
        const props = { ...other.properties };
        if (!keepKey && keyFieldName) delete props[keyFieldName];
        Object.assign(this.properties, props);
        this.geometry = other.geometry && geometry(other.geometry).clone();
        if (other.secondary_geometries) {
            if (!this.secondary_geometries) this.secondary_geometries = {};
            for (const [name, geom] of Object.entries(other.secondary_geometries)) {
                this.secondary_geometries[name] = geom && geometry(geom).clone();
            }
        }
    }

    /**
     * Returns a string with the HTML to display an extra set of buttons
     * String should include the necessary <td> tags
     * Empty implemention - to be subclassed
     * @return {string}
     */
    getExtraButtonsHTML() {
        return '';
    }

    /**
     * Returns an HTML string with the description to be shown in a myWorld results listing
     * Assumes the result will be enclosed in HTML where an <a> tag has started
     * @return {string} The html string
     */
    getResultsHtmlDescription() {
        let htmlDescriptionString = `${escape(
            this.getTitle()
        )}</div><div class="result-desc">${escape(this.getShortDescription())}</div>`;

        //Add delta description if delta feature not in current design
        if (this.isDeltaSchema()) {
            htmlDescriptionString += `<div class="result-delta">[${escape(
                this.getDeltaDescription()
            )}]</div>`;
        }

        return htmlDescriptionString;
    }

    hasDetailsToPresent() {
        return true;
    }

    /**
     * @return {boolean} Whether self's geometry belongs to an internal world or not. False unless subclassed
     */
    inInternalsWorld() {
        return false;
    }

    /**
     * Ensures properties for the specified aspects are loaded.
     * Resolved for this implementation as there is nothing further to get - only one aspect
     * @return {Promise}
     */
    ensure() {
        return Promise.resolve(true);
    }

    /**
     * Returns the title for self
     * @return {string}
     */
    getTitle() {
        return this.type || 'Feature';
    }

    /**
     * Returns short descritption for self
     * @return {string}
     */
    getShortDescription() {
        return '';
    }

    /**
     * Returns true if self is in a delta different from the datasource's current delta
     * To be overriden in subclasses
     * @return {boolean}  false
     */
    isDeltaSchema() {
        return false;
    }

    /**
     * Returns a description of self's delta
     * To be overriden in subclasses
     * @return {string} ''
     */
    getDeltaDescription() {
        return '';
    }

    /**
     * Returns self's delta
     * To be overriden in subclasses
     * @return {null} ''
     */
    getDelta() {
        return null;
    }

    /**
     * External name of self's feature type <br/>
     * Self's type. Overridden in sub classes
     * @return {string}
     */
    getTypeExternalName() {
        return this.type;
    }

    /**
     * Returns Field group information or undefined if none is defined...
     * @return {Array<fieldGroup>}
     */
    getFieldGroups() {
        return undefined;
    }

    /**
     * Returns the order in which fields should be presented to the user
     * Exclude world name fields.
     * @return {Array<string>}
     */
    getFieldsOrder() {
        return Object.keys(this.properties).filter(key => key !== 'myw_geometry_world_name');
    }

    getFieldDD(internalName) {
        const externalName =
            internalName.charAt(0).toUpperCase() + internalName.substring(1).split('_').join(' ');
        return {
            internal_name: internalName,
            external_name: externalName,
            type: 'string'
        };
    }

    getFieldsDD() {
        return Object.keys(this.properties).reduce((prev, fn) => {
            prev[fn] = this.getFieldDD(fn);
            return prev;
        }, {});
    }

    isEditable() {
        return false;
    }

    /**
     * Obtains the other features in a relationship
     * @param  {string} relationshipName
     * @param  {object} aspects
     * @property  {boolean}        [aspects.includeLobs=false]      Whether to include 'large object' (eg. image) fields or not. Defaults to false. (myWorld datasource only)
     * @property  {boolean}        [aspects.includeGeoGeometry=true]  Whether to include geo location geometry for internals objects. Defaults to true. (myWorld datasource only)
     * @return {Promise<Feature[]>}
     */
    followRelationship(relationshipName, aspects = {}) {
        const { includeGeoGeometry = true, includeLobs = false } = aspects;
        aspects = { includeGeoGeometry, includeLobs };
        return this.datasource.getRelationship(this, relationshipName, aspects);
    }

    /**
     * Obtains the feature referenced in a given field
     * @param  {string} fieldName   Name of field with the reference (or foreign key) relationship
     * @return {Promise<Feature>}
     */
    async followReference(fieldName) {
        if (!this.featureDD) throw new Error(`Feature doesn't have DD`);
        const fieldDD = this.featureDD.fields[fieldName];
        if (fieldDD.baseType !== 'reference' && fieldDD.baseType !== 'foreign_key')
            throw new Error(`Type of field '${fieldName}' is not reference or foreign_key`);

        const features = await this.followRelationship(fieldName);
        return features?.[0];
    }

    /**
     * Returns the style to use when representing self on the map. Can be subclassed to provide finer-grained control
     * over feature styles; for example attribute based styling.
     * For some subclasses such as MywFeature you may need to define the fields being used via the property customStyleFieldNames
     * @param  {styleDefinition} defaultStyleDef Generic styles for examples, specified for the whole layer
     * @return {styleDefinition}
     * @example

    customStyleFieldNames: ['urgent'],

    getCustomStyles: function(defaultStyles) {
        if (this.properties.urgent) {
            let normal = defaultStyles.normal;
            if (normal.lookup) normal = normal.getStyleFor(this);
            normal = normal.clone(); //clone style do it doesn't affect other features
            normal.size = 36;
            return { normal };
        }
        return defaultStyles;
    },
     */
    getCustomStyles(defaultStyleDef) {
        return defaultStyleDef;
    }

    /**
     * @return {string} Geometry type of this feature from the DD mapped to GeoJSON geometry type. <br/>
     *                  Returns undefined if the DD doesn't specify a geometry type
     */
    getDDGeometryType() {
        return undefined;
    }

    /**
     * Returns the networks self can be a part of
     * @return {Promise}         Network properties keyed on network name
     */
    getNetworks() {
        return this.datasource.getNetworksFor(this);
    }

    //for compatibility with DDFeature so method is available on any feature
    matchesFilter(filter) {
        return true;
    }

    //for compatibility with DDFeature so method is available on any feature
    matchesPredicate(predicate) {
        return true;
    }

    /**
     * Converts an expression into a string matching the properties of self
     * Replaces references of the form [<field_name>] with the corresponding value
     * @param  {string} expression possibly including references of the form [<field_name>]
     * @return {string}
     * @private
     */
    _evaluateFieldExpression(expression, missing_language_text = '') {
        if (!expression) return '';

        const external_name = this.database.system.localise(
            this.featureDD.external_name,
            `${this.type}.display_name`
        );
        expression = this.database.system.localise(expression, missing_language_text);
        expression = expression.replace(/{display_name}/g, external_name);

        const props = this.properties;
        return expression.replace(this._evaluateFieldRegExp, (match, p1) => props[p1] || '');
    }
}

/**
 * A geojson geometry. See {@link http://geojson.org/geojson-spec.html#geometry-objects}
 * @typedef {Object} geojsonGeom
 * @property {string} type          One of "Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"
 * @property {Array} coordinates    Depends on type. See {@link http://geojson.org/geojson-spec.html#appendix-a-geometry-examples}
 */

/**
 * Information necessary to create or update a feature. <br/>
 * Corresponds to the 'Feature' element of the GeoJson format
 * @typedef featureData
 * @property {geojsonGeom}          geometry     Geometry details
 * @property {featureProperties}    properties   Feature property values.
 */

/**
 * Field values keyed on internal field name. <br/>
 * For fields of type "date" the value can be a string of the format YYYY-MM-DD or a Date object <br/>
 * For fields of type "timestamp" the value can be a string of the format YYYY-MM-DDTHH:MM:SS.MS or a Date object <br/>
 * For fields of type "image" the value should be a string with the image encoded in base64 <br/>
 * For fields of type "boolean" the value should be a bollean value, 'true' or 'false' <br/>
 * For fields of type "reference" the value should be a feature {@link featureReference} <br/>
 * For fields of type "reference_set" the value should be a list of references ({@link Array<featureReference>}) <br/>
 * For fields of type "link" the value should be a string with an absolute or relative url <br/>
 * For fields of type "integer", "double" or "numeric" the value should be a number or a string that represents a number <br/>
 * @typedef {Object<string|Date|boolean|number|featureReference|Array<featureReference>>} featureProperties
 */

/**
 * String of the form: &lt;feature type>/&lt;feature id>
 * @typedef {string} featureReference
 */

export default Feature;
