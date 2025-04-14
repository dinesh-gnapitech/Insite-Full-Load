import { BaseStore } from './BaseStore';
import { action } from 'mobx';

export class NetworkStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/network';
        this.collectionWrapper = 'networks';
        this.filterFields = ['name', 'external_name', 'description', 'topology', 'engine'];
        this.rowKey = 'name';
        this.uniques = ['name', 'description'];
    }

    @action async updateFeatures(items, selected) {
        const rec = this.current;
        if (!rec.feature_types) rec.feature_types = {};

        if (!items.length) rec.feature_types = {};
        else {
            items.forEach(item => {
                if (selected) {
                    rec.feature_types[item.name] = {};
                } else {
                    delete rec.feature_types[item.name];
                }
            });
        }
        await this.modifyCurrent(rec);
        return rec.feature_types;
    }
}
