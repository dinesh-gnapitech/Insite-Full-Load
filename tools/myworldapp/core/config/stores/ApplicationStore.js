import { action } from 'mobx';
import { RestClient } from './RestClient';
import { BaseStore } from './BaseStore';
import { LayerStore } from './LayerStore';

export class ApplicationStore extends BaseStore {
    constructor() {
        super();
        this.current = {};
        this.endpoint = 'config/application';
        this.collectionWrapper = 'applications';
        this.filterFields = ['name', 'datasource'];
        this.rowKey = 'id';
        this.uniques = ['name', 'external_name', 'description'];
    }

    async set(id, application) {
        this.layerStore = new LayerStore(this);
        await this.layerStore.getAll();
        const appLayers = application.layer_items.map(layer => layer.id);

        application.basemaps = this._appLayersByType('basemaps', appLayers);
        //Set layers to format required by checkboxlist with read only
        application.other_layers = this.formatLayersForReadOnlyList(application, 'other_layers');
        application.overlays = this.formatLayersForReadOnlyList(application, 'overlays');

        await BaseStore.prototype.set.call(this, id, application);
    }

    _appLayersByType(type, appLayers) {
        return this.layerStore[type]
            .map(item => item.id)
            .filter(itemId => appLayers.includes(itemId));
    }

    /**
     * Formats layer data into format expected from checkboxListWithReadOnly
     * @param {Array} data - application
     * @returns Array of objects [{id:int, read_only:bool, disabled:bool}]
     */
    formatLayersForReadOnlyList(data, variable) {
        const nameComp = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

        const readOnlyLayers = data.layer_items;
        let tempOverlays = [];
        if (this.layerStore) {
            const overlays = this.layerStore[variable];
            tempOverlays = overlays.sort(nameComp).map(overlay => {
                let temp = { label: overlay.name, value: overlay.id };
                let layer;
                if (readOnlyLayers) {
                    layer = readOnlyLayers.find(layer => layer.id == overlay.id);
                }
                if (layer) {
                    temp.selected = true;
                    temp.read_only = layer.read_only;
                    temp.snap = layer.snap;
                } else {
                    temp.selected = false;
                    temp.read_only = false;
                    temp.snap = false;
                }
                if (overlay.datasource == 'myworld') temp.disabled = false;
                else temp.disabled = true;

                return temp;
            });
        }
        return tempOverlays;
    }

    /**
     * Makes sure the set() method completes before returning
     */
    async get(id) {
        try {
            const res = await RestClient.get(`${this.endpoint}/${id}`);
            await this.set(res.data[this.rowKey], res.data);
        } catch (e) {
            console.error(e);
        }
        return this.store[id];
    }

    _beforeSave(application) {
        if (application.name === 'config') {
            application.overlays = [];
            application.other_layers = [];
            application.layer_items = [];
        } else {
            application.overlays = this.unformatLayers([...application.overlays]);
            application.other_layers = this.unformatLayers([...application.other_layers]);
            application.layer_items = Array.from(
                new Set([
                    ...application.basemaps,
                    ...application.other_layers,
                    ...application.overlays
                ])
            );
        }
        delete application.basemaps;
        delete application.other_layers;
        delete application.overlays;
        return application;
    }

    @action updateLayers(layers, type) {
        const typeObj = {};
        typeObj[type] = layers;
        this.modifyCurrent(typeObj);
    }

    async save(application) {
        return super.save(this._beforeSave(application));
    }

    unformatLayers(layers) {
        return layers.reduce((results, overlay) => {
            if (overlay.selected) {
                results.push({
                    id: overlay.value,
                    read_only: overlay.read_only,
                    snap: overlay.snap
                });
            }
            return results;
        }, []);
    }

    async update(id, application) {
        this._beforeSave(application);
        await BaseStore.prototype.update.call(this, id, application);
    }
}
