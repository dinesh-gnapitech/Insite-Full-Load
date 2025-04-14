import { action } from 'mobx';
import { BaseStore } from './BaseStore';

export class TableSetStore extends BaseStore {
    constructor() {
        super();
        this.current = { layers: {}, tile_files: {} };
        this.endpoint = 'config/table_set';
        this.collectionWrapper = 'table_sets';
        this.filterFields = ['name', 'description'];
        this.rowKey = 'name';
        this.uniques = ['name'];
    }

    /**
     * Since there is no API to get the resources individually
     */
    async get(id) {
        await this.getAll();
        return this.store[id];
    }

    /**
     * Overriding the super's method to always hava a blank entries for layers and tile_files
     * @param {string} id    Id to fetch from cache
     */
    setCurrent(id) {
        if (!id) {
            this.current = { layers: {}, tile_files: {} };
        } else BaseStore.prototype.setCurrent.call(this, id);
    }

    /**
     * After save of a new record
     */
    afterSaveHook() {
        this.current = { layers: {}, tile_files: {} };
    }

    @action setTableSetLayerProp(layerName, propName, value) {
        const rec = { ...this.current };
        let tableSetLayer = rec.layers[layerName];
        if (!tableSetLayer) tableSetLayer = {};
        tableSetLayer[propName] = value;

        this.modifyCurrent(rec);
    }

    @action setTableSetTileProp(tileFileName, propName, value) {
        const rec = { ...this.current };
        let tableSetTile = rec.tile_files[tileFileName];
        if (!tableSetTile) tableSetTile = {};
        tableSetTile[propName] = value;

        this.modifyCurrent(rec);
    }

    /**
     * Adds/removes layer from the current tableSet
     * @param  {string}  layerName layer to add/remove
     * @param  {boolean} selected
     */
    @action updateLayer(layerName, selected) {
        let rec = { ...this.current };
        if (selected) {
            rec.layers[layerName] = { on_demand: false, updates: true };
        } else {
            delete rec.layers[layerName];
        }
        this.modifyCurrent(rec);
    }

    /**
     * Adds/removes layer from the current tableSet
     * @param  {string}  layerName layer to add/remove
     * @param  {boolean} selected
     */
    @action updateTile(tileFileName, selected) {
        let rec = { ...this.current };
        if (selected) {
            rec.tile_files[tileFileName] = {
                on_demand: false,
                updates: true,
                by_layer: false,
                min_zoom: null,
                max_zoom: null
            };
        } else {
            delete rec.tile_files[tileFileName];
        }
        this.modifyCurrent(rec);
    }

    resetCurrent() {
        delete this.current.isDuplicate;
    }

    duplicate(id) {
        BaseStore.prototype.duplicate.call(this, id);
        this.modifyCurrent({ isDuplicate: true });
    }
}
