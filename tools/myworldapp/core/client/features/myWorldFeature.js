// Copyright: IQGeo Limited 2010-2023
import { DDFeature } from 'myWorld/features/ddFeature';

export class MyWorldFeature extends DDFeature {
    static {
        /**
         * List of fields that are not editable <br/>
         * Can also be implemented as a function that returns the list
         * @type {Array<string>|Function}
         */
        this.prototype.readonlyFields = ['myw_smallworld_id'];
    }

    /**
     * Creates an instance that represents a feature in the myWorld database <br/>
     * Detached records should be created using database.createDetachedRecord()
     * @class Abstract class for a feature based on a myWorld database record. <br/>
     *        A subclass holding the featureDD and other common properties will be generated for each feature type<br/>
     *        Use as super-class for feature models of feature types stored in the myWorld database. <br/>
     * @param  {featureData}    featureData         Feature details
     * @param  {boolean}        options.complete    Whether the feature information includes all the 'simple' properties or not
     * @param  {boolean}        options.lobs        Whether the feature information includes all the 'large object' properties or not
     * @constructs
     * @augments DDFeature
     */
    constructor(featureData, options) {
        // Call the super constructor
        super(featureData, options);

        featureData = featureData || {};

        // eslint-disable-next-line no-unused-vars
        const { feature_type, ...mywProps } = featureData.myw || {}; //feature_type doesn't need to be stored as it can be obtained via the prototype's type property
        this._myw = mywProps;

        options = options || {};
        this._loadedAspects['simple'] = options.complete;
        this._loadedAspects['display_values'] = !!featureData.display_values;
        this._loadedAspects['lobs'] = options.lobs;
        this.keyFieldName = this.featureDD.key_name;
        this._excludedFields = [
            this.keyFieldName,
            'myw_geometry_world_name',
            'myw_internal_world_view'
        ];
    }

    /**
     * Urn of myWorld features do not include the datasource component
     * @param {boolean} [includeQualifier=false]  If true, the an existing id qualifier will be included in the result
     * @param {boolean} [includeDelta=false]  If true and the feature exists in a delta, the delta id will be included in the result
     * @return {string} the urn (system wide identifier) of this feature
     */
    getUrn(includeQualifier = false, includeDelta = false) {
        let id = this.id;
        if (includeQualifier && this.idQualifier) id += `?${this.idQualifier}`;
        if (includeDelta && this._myw.delta) id += `?${this._myw.delta}`;
        return [this.type, id].join('/');
    }

    /**
     * Updates self by getting details from the database
     * @return {Promise<Feature>} Promise that will be resolved when the feature details have been updated
     */
    async update() {
        await this.getDetails(true);
        return this;
    }

    mergeFeatureDetails(includeLobs, feature) {
        super.mergeFeatureDetails(includeLobs, feature);
        Object.assign(this._myw, feature._myw);
    }

    /**
     * @return {boolean} Whether self's geometry belongs to an internal world or not
     */
    inInternalsWorld() {
        return this.getInternalWorldTypes().length > 0;
    }

    /**
     * Returns True if self is owner of a given world
     * @param  {string}  worldName World name
     * @return {Boolean}
     */
    isWorldOwner(worldName) {
        const matches = worldName.match(/(.*)\/.*YY(.*)YY(.*)/);
        /* this.id  may be in simple (1234) or urn (gisYYbuildingYY1234) form */
        let id = this.id;
        if (typeof id == 'string') {
            const id_bits = this.id.match(/(.*)YY(.*)YY(.*)/);
            if (id_bits) id = id_bits[id_bits.length - 1];
        }
        return matches && matches[2] == this.type && matches[3] == id;
    }

    /**
     * Recurse world containment hierarchy from self
     * looking for the owner of the specified worldName
     * @param  {string} worldName World identifier
     * @return {Promise<Feature>}
     */
    getOwnerInWorld(worldName) {
        if (this.getGeometryInWorld(worldName)) {
            return Promise.resolve(this);
        }

        // ENH: Try to use reduce(). We want to do a depth first search where we
        // break out when we find an owner in worldName.
        return this.getWorldOwners()
            .map(owner => {
                if (!owner || owner.id == this.id) return undefined;
                const geom = owner.getGeometryInWorld(worldName);
                if (geom) return owner;
                return owner.getOwnerInWorld(worldName);
            })
            .then(features => features.find(Boolean));
    }

    /**
     * Returns a Lat/Long coordinate representative of self in the geographic world. <br/>
     * @return <LatLng>
     */
    getGeoLocation() {
        const geom = this.getGeometryInWorld('geo');
        if (geom) return this._nominalLocationForGeom(geom);
    }

    /**
     * Return list of internals world types that this feature appears in
     * Ordered acording to field order
     * @return {Array<string>}      List of drawing types
     */
    getInternalWorldTypes() {
        if (this.properties['myw_internal_world_view']) return ['int'];

        const geomWorldTypes = this._getGeometries().map(geom => geom.world_type);
        const worldTypes = [...this.getOwnerWorldTypes(), ...geomWorldTypes];
        return [...new Set(worldTypes)].filter(
            worldType => worldType && worldType !== 'geo' && worldType !== 'all'
        );
    }

    /**
     * Returns list of world types self can own
     */
    getOwnerWorldTypes() {
        return (
            this.ownerWorldTypes ??
            Object.values(this.featureDD.fields)
                .filter(fieldDD => fieldDD.baseType == 'polygon' && fieldDD.creates_world_type)
                .map(fieldDD => fieldDD.creates_world_type)
        );
    }

    /**
     * Calculates world id for world of given type owned by self
     * return string in the form "gas_floorplan/gisYYgas_supply_hubYY1"
     * @param {string} worldType
     */
    worldNameForType(worldType) {
        return `${worldType}/gisYY${this.featureDD.name}YY${this.id}`;
    }

    /**
     * Provides list of the owners of worlds that self has geometry in.
     * @return {Promise<Array<Feature>>}
     */
    getWorldOwners() {
        if (!this._ownersPromise) {
            let worldList = this._getWorldNames();
            worldList = [...new Set(worldList.filter(world => world !== 'geo'))];
            this._ownersPromise = Promise.all(
                worldList.map(worldName => this._getWorldOwner(worldName))
            );
        }
        return this._ownersPromise;
    }

    /**
     * Provides list of worlds that this feature has geometry in.
     * @return {Array<string>} List of world names
     * @private
     */
    _getWorldNames() {
        return this._getGeometries().map(g => g.world_name);
    }

    /**
     * Returns all of self's geometries. Ordered as per field order
     * @return {geometry[]}
     * @private
     */
    _getGeometries() {
        const geoms = [];
        if (this.geometry) geoms.push(this.geometry);
        if (this.secondary_geometries) {
            //use field order so geometries are in the same order
            const fieldOrder = this.featureDD.fields_order;
            fieldOrder.forEach(fieldName => {
                const secGeom = this.secondary_geometries[fieldName];
                if (secGeom) geoms.push(secGeom);
            });
        }
        return geoms;
    }

    /**
     * Returns promise for the features that own the worlds where self's geometries exists
     * Promise resolves to empty list if the feature only has geometry in the geographical world
     * @return {Promise<Feature>}
     * @private
     */
    _getWorldOwner(worldName) {
        let ownerUrn = this._getWorldOwnerUrn(worldName);
        return this.datasource.getFeatureByUrn(ownerUrn).then(
            owner => owner,
            reason => {
                //couldn't find owner using new id format. try with old
                ownerUrn = this._getWorldOwnerUrn(worldName, true);
                return this.datasource.getFeatureByUrn(ownerUrn).then(
                    owner => owner,
                    reason => undefined
                );
            }
        );
    }

    /**
     * Obtains the urn of the owner of the world that self's geometry belongs to
     * If self's geometry is of the geographical world returns null
     * @param  {boolean}    [oldIdFormat=false]     True if feature IDs are URN format (rather than simple ids)
     * @return {string}     Urn of the world owner, or null if in geographical world
     * @private
     */
    _getWorldOwnerUrn(worldName, oldIdFormat) {
        let worldNameParts;
        const swUrn = worldName.split('/')[1];
        const featureType = swUrn.split('YY')[1];
        if (!worldName || worldName === 'geo' || worldName === 'none') {
            return null;
        } else if (oldIdFormat === true) {
            //Feature id is URN
            return `${featureType}/${swUrn}`;
        } else {
            //Feature id is simple
            worldNameParts = swUrn.split('YY');
            return `${featureType}/${worldNameParts[2]}`;
        }
    }

    /**
     * Returns true if self is editable in given world
     * Returns false if the field configured for the world type has a geometry on a different world
     * @param {string} worldName
     */
    isEditableInWorld(worldName) {
        if (!this.isEditable()) return false;

        //get the geom field name for the world from the DD
        const fieldName = this.getGeometryFieldNameForWorld(worldName);
        if (!fieldName) return false;

        //if there is already a geometry check it matches the world
        const geom = this.getGeometry(fieldName);
        if (geom) return (geom.world_name ?? 'geo') === worldName;
        return true;
    }

    /**
     * Returns the title for self.
     * If title is missing, returns feature type's external name
     * @return {string}
     */
    getTitle() {
        return this._myw.title || this.featureDD.external_name;
    }

    /**
     * Returns the short description for self.
     * Defaults to empty string
     * @return {string}
     */
    getShortDescription() {
        return this._myw.short_description || '';
    }

    /**
     * Returns true if self is in a delta different from the datasource's current delta,
     * i.e. was obtained from a request to delta schema (ex: forward view)
     * @return {boolean}
     */
    isDeltaSchema() {
        return this._myw.delta && this._myw.delta !== this.datasource.delta;
    }

    /**
     * Returns a description of self's delta
     * @return {string}
     */
    getDeltaDescription() {
        return this._myw.delta_owner_title || '';
    }

    /**
     * Returns self's delta
     * @return {string}
     */
    getDelta() {
        return this._myw.delta;
    }

    /**
     * Creates a transaction to insert a feature
     * Can be overriden in feature models (e.g. to create substructure)
     * @param {object} featureJson      New feature details
     * @param  {Application}    app    The application instance
     * @return {object} Object with properties 'transaction' and 'opIndex' (index of operation that inserts the feature)
     */
    buildInsertTransaction(featureJson) {
        const transaction = this.datasource.transaction();
        const placeholder = transaction.addInsert(this.getType(), featureJson);

        this._processSubFeaturesForTransaction(featureJson, transaction, placeholder);

        return { transaction, opIndex: placeholder.operation };
    }

    /**
     * Creates a transaction to update a feature
     * Can be overriden in feature models (e.g. to maintain substructure)
     * @param {object} featureJson  Details to update
     * @param  {Application}    app    The application instance
     * @return {Transaction}
     */
    buildUpdateTransaction(featureJson) {
        const transaction = this.datasource.transaction();
        this._processSubFeaturesForTransaction(featureJson, transaction, this.getUrn());
        transaction.addUpdate(this.getType(), featureJson);
        return transaction;
    }

    /**
     * Replace sub feature data in calculated reference set fields with insert transactions
     * @param {object} featureJson Feature details
     * @param {Transaction} transaction
     * @param {transactionPlaceholder|urn} ownerRef  Reference to owning feature
     * @private
     */
    _processSubFeaturesForTransaction(featureJson, transaction, ownerRef) {
        for (let [fieldName, fieldDD] of Object.entries(this.featureDD.fields)) {
            const { baseType, value } = fieldDD;
            if (baseType === 'reference_set' && value) {
                //Find the field name that needs to store the parent object's urn
                const subFeaturesData = featureJson.properties[fieldName];
                if (!subFeaturesData) continue;

                delete featureJson.properties[fieldName];
                const { inserts, updates, deletions } = subFeaturesData;

                const processSubFeatureFn = transactionOp => refFeature => {
                    if (!(refFeature instanceof DDFeature)) {
                        console.warn(`building transaction: Expected a feature, got:`, refFeature);
                        return;
                    }
                    const ownerFieldName = fieldDD.valueSelectFieldFor(refFeature.getType());
                    if (ownerFieldName) refFeature.properties[ownerFieldName] = ownerRef;
                    const args =
                        transactionOp == 'addDelete'
                            ? [refFeature]
                            : [refFeature.getType(), refFeature];
                    transaction[transactionOp](...args);
                };

                inserts.forEach(processSubFeatureFn('addInsert'));
                updates.forEach(processSubFeatureFn('addUpdate'));
                deletions.forEach(processSubFeatureFn('addDelete'));
            }
            //ENH: also support stored reference sets
        }
    }

    /**
     * Creates a transaction that deletes self
     * Can be overriden in feature models (e.g. to maintain substructure)
     * @param  {Application}    app    The application instance
     * @return {Transaction}
     */
    buildDeleteTransaction() {
        const transaction = this.datasource.transaction();
        transaction.addDelete(this);
        return transaction;
    }

    /**
     * Pre Insert to be redefined in subclasses <br/>
     * Called just before a feature is inserted in the database from the editor. <br/>
     * @param  {object}    featureJson    Details of feature to insert in geojson format
     * @param  {Application}    app    The application instance
     * @return {Promise}   Promise to be resolved when the hook is complete
     */
    preInsert(featureJson, app) {
        return Promise.resolve();
    }

    /**
     * Post Insert hook to be redefined in subclasses <br/>
     * Called just after a feature is inserted in the database from the editor. <br/>
     * Self will included any properties calculated in the database (title, timestamps, etc...)
     * @param  {object}    origFeatureJson    Original feature data passed to insert call
     * @param  {Application}    app    The application instance
     * @return {Promise}   Promise to be resolved when the hook is complete
     */
    posInsert(origFeatureJson, app) {
        return Promise.resolve();
    }

    /**
     * Pre update hook to be redefined in subclasses <br/>
     * Called just before a feature update is sent to the database from the editor <br/>
     * @param  {object}    featureJson    New values for feature. geojson format
     * @param  {Application}    app    The application instance
     * @return {Promise}   Promise to be resolved when the hook is complete
     */
    preUpdate(featureJson, app) {
        return Promise.resolve();
    }

    /**
     * Post update hook to be redefined in subclasses <br/>
     * Called just after a feature update is sent to the database from the editor.  <br/>
     * Self will include any properties calculated in the database (title, timestamps, etc...)
     * @param  {object}    preUpdateFeatureJson    Original feature data passed to update call
     * @param  {Application}    app    The application instance
     * @return {Promise}   Promise to be resolved when the hook is complete
     */
    posUpdate(preUpdateFeatureJson, app) {
        return Promise.resolve();
    }

    /**
     * Pre delete hook to be redefined in subclasses.  <br/>
     * Called just before a feature deletion is sent to the database from the editor. <br/>
     * @param  {Application}    app    The application instance
     * @return {Promise}   Promise to be resolved when the hook is complete
     */
    preDelete(app) {
        return Promise.resolve();
    }

    /**
     * Post delete hook to be redefined in subclasses <br/>
     * Called just after a feature deletion is sent to the database from the editor. <br/>
     * @param  {Application}    app    The application instance
     * @return {Promise}   Promise to be resolved when the hook is complete
     */
    posDelete(app) {
        return Promise.resolve();
    }
}

export default MyWorldFeature;
