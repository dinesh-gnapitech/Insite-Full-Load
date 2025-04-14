import { Conflict } from './conflict';
import { FeatureChange } from './featureChange';

/**
 * Additional methods for VersionedFeatureTable
 * @mixin
 */
export const VersionedFeatureTableExtension = {
    /**
     * Conflict details for 'deltaRec' (if it is in conflict)
     * @returns {Conflict}
     */
    async conflictFor(deltaRec) {
        const id = deltaRec.id;
        const baseRec = await this._baseRec(id);
        const masterRec = await this.masterTable.get(id);

        const masterChange = this._changeTypeFor(baseRec, masterRec);
        if (!masterChange) return;

        const conflict = new Conflict(masterChange, deltaRec, masterRec, baseRec);

        return conflict;
    },

    /*
     * Returns change type from base
     */
    _changeTypeFor(base_rec, rec) {
        if (rec && !base_rec) return 'insert';
        if (!rec && base_rec) return 'delete';
        if (!rec && !base_rec) return null;

        const fc = new FeatureChange(null, rec, base_rec);
        const fields = fc.changedFields();
        if (fields?.length) return 'update';

        return null;
    },

    /*
     *  Returns a detached record
     */
    _new_detached() {
        return {
            geometry: {},
            properties: {},
            getType: () => this.featureName
        };
    },

    /*
     * The raw base record for 'id' (if there is one)
     */
    _baseRec(id) {
        return this.baseTable.get(id, { delta: this.delta });
    }
};
