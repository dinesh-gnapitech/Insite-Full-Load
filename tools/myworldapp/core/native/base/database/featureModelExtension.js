import { isEqual } from 'underscore';

/**
 * Additional methods for feature models
 * @mixin
 */
export const FeatureModelExtension = {
    /**
     * Record referenced by 'field' (if any)
     * @param {string} fieldname
     * @returns {FeatureModel}
     */
    async followRef(fieldname) {
        const recs = await this.followRelationship(fieldname);
        if (!recs.length) return undefined;
        const refRec = recs[0];
        return refRec;
    },

    /**
     * Records referenced by 'field' (if any)
     * @param {string} fieldname
     * @param {boolean} [ordered=false]
     * @returns {FeatureModel[]}
     */
    async followRefSet(fieldname, ordered = false) {
        // Compare two objects by URN
        // Workaround for strange sort order in server - see case 19814
        const sortProc = function (rec1, rec2) {
            const urn1 = rec1.getUrn();
            const urn2 = rec2.getUrn();
            if (urn1 < urn2) return -1;
            if (urn1 > urn2) return +1;
            return 0;
        };

        // Get records
        let recs = await this.followRelationship(fieldname);

        if (ordered) recs = recs.sort(sortProc);

        return recs;
    },

    followRelationship(relationshipName) {
        //overrides method defined in app code
        const fieldDD = this.featureDef.fields[relationshipName];
        if (!fieldDD)
            throw new Error(
                `No relationship '${relationshipName}' for feature type: ${this.getType()}`
            );

        return this.view.followRelationship(this, relationshipName);
    },

    /**
     * GeoJSON representation of self
     * @returns {GeoJsonFeature}
     */
    async asGeojsonFeature(options = {}) {
        // See python method on MywFeatureModelMixin
        const res = { ...this };
        res.type = 'Feature';

        // Add delta and delta owner title
        if (options.displayValues) {
            const myw_props = {};
            if (this.myw.delta) {
                myw_props['delta'] = this.myw.delta;
                // Get delta owner title
                const deltaOwner = await this.view.get(this.myw.delta);
                const deltaOwnerTitle = deltaOwner
                    ? deltaOwner.myw.title
                    : 'Bad reference: ' + this.myw.delta;
                if (deltaOwnerTitle) myw_props['delta_owner_title'] = deltaOwnerTitle;
            }
            Object.assign(res.myw, myw_props);
        }
        delete res.view;
        return res;
    },

    /**
     * Names of the fields with a different value between to records of the same type
    /**
     * Names of the fields that have changed rec1 -> rec2 (handling unsets)
     * @param {FeatureModel} rec1
     * @param {FeatureModel} rec2
     * @param {string[]} [fields] Names of fields to compare. Defaults to all fields
     * @returns {string[]}
     */
    differencesTo(other, fields) {
        fields = fields ?? Object.keys(this.featureDef.fields);
        const diffs = [];

        for (const fname of fields) {
            const fieldDD = this.featureDef.fields[fname];
            let equal;
            if (this.isGeometryType(fieldDD.type)) {
                if (fname == this.featureDef.primary_geom_name)
                    equal = isEqual(this.geometry, other.geometry);
                else
                    equal = isEqual(
                        this.secondary_geometries[fname],
                        other.secondary_geometries[fname]
                    );
            } else {
                equal = this.properties[fname] == other.properties[fname];
            }

            if (!equal) diffs.push(fname);
        }
        return diffs;
    }
};
