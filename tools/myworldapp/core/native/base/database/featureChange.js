// Copyright: IQGeo Limited 2010-2023
//###############################################################################
// Object modelling a feature record change
//###############################################################################

export class FeatureChange {
    /**
     * Object modelling a change to a feature record
     *
     * Holds the old and new versions of record. Provides serialisation etc
     */
    constructor(change_type, rec, orig_rec = undefined) {
        this.change_type = change_type;
        this.rec = rec;
        this.orig_rec = orig_rec;
        this.reasons = [];
    }

    /**
     * String representation of self for test results
     */
    __ident__() {
        let res = 'FeatureChange'; //str(this);

        if (this.change_type == 'update') {
            res += ' fields={}'.format(','.join(this.changedFields()));
        }

        return res;
    }

    /**
     * String representation of self for tracebacks etc
     */
    __repr__() {
        return '{}({},{})'.format(this.__class__.__name__, this.rec, this.change_type);
    }

    /**
     * Self as a serialisable structure
     */
    definition() {
        const defn = {};

        defn['change_type'] = this.change_type;
        defn['feature'] = this.rec;

        if (this.orig_rec) {
            defn['orig_feature'] = this.orig_rec;

            if (this.change_type == 'update') {
                defn['fields'] = this.changedFields();
            }
        }

        return defn;
    }

    /**
     * Names of the fields whose values have changed
     */
    changedFields() {
        if (!this.orig_rec) {
            return [];
        }

        return this.rec.differencesTo(this.orig_rec);
    }
}
