import { BaseController } from '../base/controllers';
import { Conflict } from '../base';

export class DeltaController extends BaseController {
    async features(delta) {
        // Find records
        let features = [];
        const ddRecords = await this._getVersionedFeatureTypes();
        for (const ddRec of ddRecords) {
            const featureType = ddRec.feature_name;
            const table = this._db.view(delta).table(featureType);
            const recs = await this.getDeltaRecsFor(table);
            features = features.concat(recs);
        }
        return { features };
    }

    async conflicts(delta) {
        // Find conflicts
        const conflicts = {};
        const ddRecords = await this._getVersionedFeatureTypes();
        for (const ddRec of ddRecords) {
            const featureType = ddRec.feature_name;
            const table = this._db.view(delta).table(featureType);
            // Build result
            const ftConflicts = {};

            const deltaRecs = await this.getDeltaRecsFor(table);
            for (const deltaRec of deltaRecs) {
                const conflict = await this.conflictFor(table, deltaRec);
                if (conflict) ftConflicts[deltaRec.id] = conflict.definition();
            }
            if (ftConflicts) conflicts[featureType] = ftConflicts;
        }

        return { conflicts };
    }

    async conflictFor(table, deltaRec) {
        const id = deltaRec.id;
        const baseRec = await table.baseTable.get(id);
        const masterRec = await table.masterTable.get(id);

        const masterChange = this._changeTypeFor(baseRec, masterRec);
        if (!masterChange) return;

        return new Conflict(masterChange, deltaRec, masterRec, baseRec);
    }

    getDeltaRecsFor(table) {
        const delta = table.delta;
        return table.deltaTable.where({ myw_delta: delta }).all();
    }

    _getVersionedFeatureTypes() {
        return this._db
            .cachedTable('dd_feature')
            .where({ datasource_name: 'myworld', versioned: true })
            .all();
    }

    _changeTypeFor(baseRec, rec) {
        if (rec && !baseRec) return 'insert';
        if (baseRec && !rec) return 'delete';
        if (!rec && !baseRec) return null;

        const fields = rec.differencesTo(baseRec);
        if (fields && fields.length) return 'update';

        return null;
    }
}
