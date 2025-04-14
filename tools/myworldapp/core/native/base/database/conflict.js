//###############################################################################
// Object modelling a feature conflict
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

/**
 * A feature-level conflict
 *
 * Holds the delta, master and base versions of the record plus the type of
 * change made in master
 */
export class Conflict {
    /**
     * @param {string} master_change
     * @param {FeatureModel} delta_rec
     * @param {FeatureModel} master_rec
     * @param {FeatureModel} base_rec
     */
    constructor(master_change, delta_rec, master_rec = undefined, base_rec = undefined) {
        this.master_change = master_change;
        this.delta_rec = delta_rec;
        this.master_rec = master_rec;
        this.base_rec = base_rec;
    }

    /**
     * Self as a serialisable structure
     */
    definition() {
        const defn = {};

        // Add records
        defn['delta'] = this.delta_rec;
        if (this.base_rec) defn['base'] = this.base_rec;
        if (this.master_rec) defn['master'] = this.master_rec;

        // Add change info
        const master_fields = this.changedFields(this.base_rec, this.master_rec);
        const delta_fields = this.changedFields(this.base_rec, this.delta_rec);

        defn['master_change'] = this.master_change;
        defn['master_fields'] = master_fields;
        defn['delta_fields'] = delta_fields;

        // Add fields in conflict (if appropriate)
        if (this.master_rec && this.delta_rec) {
            const common_fields = master_fields.filter(f => delta_fields.includes(f));
            if (common_fields.length) {
                defn['conflict_fields'] = this.changedFields(
                    this.delta_rec,
                    this.master_rec,
                    common_fields
                );
            }
        }

        return defn;
    }

    /**
     * String summarising the change rec1 -> rec2
     * @param {FeatureModel} rec1
     * @param {FeatureModel} rec2
     */
    changeStr(rec1, rec2) {
        if (!rec1 && !rec2) return '-';
        if (!rec1 && rec2) return 'insert';
        if (rec1 && !rec2) return 'delete';

        const fields = this.changedFields(rec1, rec2);
        return 'update({})'.format(','.join(fields));
    }

    /**
     * Names of the fields that have changed rec1 -> rec2 (handling unsets)
     * @param {FeatureModel} rec1
     * @param {FeatureModel} rec2
     * @param {string[]} [fields] Names of fields to compare. Defaults to all fields
     * @returns {string[]}
     */
    changedFields(rec1, rec2, fields = undefined) {
        if (!rec1 || !rec2) {
            return undefined;
        }

        return rec1.differencesTo(rec2, fields);
    }
}
