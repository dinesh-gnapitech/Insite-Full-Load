import { toJS } from 'mobx';
import { BaseStore } from './BaseStore';

export class LayerGroupStore extends BaseStore {
    constructor() {
        super();

        this.endpoint = 'config/layer_group';
        this.collectionWrapper = 'layerGroups';
        this.filterFields = ['name', 'description'];
        this.rowKey = 'id';
        this.uniques = ['id', 'name', 'display_name', 'description'];
    }

    /**
     * Since there is no API to get the resources individually
     */
    async get(id) {
        await this.getAll();
        return this.store[id];
    }

    async save(data) {
        const clone = toJS(data);
        this._removeEmptyLayerItemFrom(clone);
        return super.save(clone);
    }

    async update(id, data) {
        const clone = toJS(data);
        this._removeEmptyLayerItemFrom(clone);
        return super.update(id, clone);
    }

    /*
     * Remove the empty item (if any) from the end of layer names array
     */
    _removeEmptyLayerItemFrom(data) {
        let layerNames = data.layers;
        if (layerNames[layerNames.length - 1] === '') layerNames.pop();
    }
}
