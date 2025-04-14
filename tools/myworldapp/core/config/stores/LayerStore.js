import { action, computed } from 'mobx';
import { BaseStore } from './BaseStore';
import { result } from 'underscore';
import { datasourceTypes } from 'myWorld/datasources';
import { toJS } from 'mobx';

export class LayerStore extends BaseStore {
    constructor(store) {
        super();
        this.current = { feature_types: [] };
        this.endpoint = 'config/layer';
        this.collectionWrapper = 'layers';
        this.filterFields = ['name', 'category', 'datasource', 'type', 'code'];
        this.rowKey = 'id';
        this.defaults = {
            datasource: 'myworld',
            spec: { rendering: 'vector' },
            min_scale: 0,
            max_scale: 20,
            transparency: 0,
            category: 'overlay',
            render_order: 0
        };
        this.uniques = ['id', 'name', 'display_name', 'description', 'code'];
    }

    /**
     * Overriding the super's method to always hava a blank feature_types entry
     * @param {string} id    Id to fetch from cache
     */
    setCurrent(id) {
        if (!id) this.current = { feature_types: [] };
        else BaseStore.prototype.setCurrent.call(this, id);
    }

    @action setLfiProp(featureName, field, propName, value) {
        const rec = this.current;
        let lfi = field
            ? rec.feature_types.find(f => f.name === featureName && f.field_name === field)
            : rec.feature_types.find(f => f.name === featureName);
        if (!lfi) {
            lfi = { name: featureName, field_name: field };
            lfi[propName] = value;
            rec.feature_types.push(lfi);
        } else {
            lfi[propName] = value;
        }
        this.modifyCurrent(rec);
    }

    @action async updateFeatures(items, selected, fields) {
        let rec = this.current;
        let lfi;
        if (!items.length || !rec.feature_types) rec.feature_types = [];
        else {
            items.forEach(item => {
                if (selected) {
                    const updatedField = fields?.[item.name].find(
                        field => field.internal_name === item.field_name
                    );

                    const type = updatedField?.type || 'point';
                    lfi = this.createLfiFor(item, type);

                    const alreadyExists = rec.feature_types.find(obj => {
                        return obj.name === item.name && obj.field_name === item.field_name;
                    });
                    if (typeof alreadyExists === 'undefined') rec.feature_types.push(lfi);
                } else {
                    rec.feature_types = rec.feature_types.filter(obj => {
                        if (obj.name == item.name) {
                            if (obj.field_name == item.field_name) {
                                return false;
                            }
                        }
                        return true;
                    });
                }
            });
        }

        await this.modifyCurrent(rec);
        return rec.feature_types;
    }

    /*
     * Restructures the spec fields before sending them to the server
     */
    unformatData(data) {
        Object.entries(data).forEach(([field, value]) => {
            if (field.includes('spec.')) {
                data.spec[field.split('.')[1]] = value;
                delete data[field];
            }
        });
        return data;
    }

    _setData(res) {
        this.set(res.data[this.rowKey], res.data);
    }

    beforeSend(data) {
        //  We shouldn't store the ESRI FeatureServer drawing_info for features in the layer info. Remove any features with it set here
        const ret = JSON.parse(JSON.stringify(data));
        for (let featureInfo of ret.feature_types) {
            delete featureInfo.drawing_info;
        }
        return ret;
    }

    async save(data) {
        const clone = toJS(data);
        if (clone.updates) delete clone.updates;
        return super.save(this.unformatData(clone));
    }

    async update(id, data) {
        const clone = toJS(data);
        return super.update(id, this.unformatData(clone));
    }

    /**
     * Overriding the super's method to add isDuplicate flag
     * @param {string} id    Id to duplicate from cache
     */
    duplicate(id) {
        BaseStore.prototype.duplicate.call(this, id);
        this.current['isDuplicate'] = true;
    }

    /**
     * Used when a hybrid layer adds styles for native app vector layer
     */
    @action async addStylesTo(fields) {
        let rec = this.current;
        let feature_types = [];
        if (rec.feature_types.length) {
            feature_types = rec.feature_types.map(item => {
                if (item.point_style || item.line_style || item.fill_style) return item; //Don't overwrite existing styles
                const updatedField =
                    fields &&
                    fields[item.name].find(field => field.internal_name === item.field_name);

                const type = updatedField?.type || 'point';
                return this.createLfiFor(item, type);
            });
        }
        rec.feature_types = feature_types;
        await this.modifyCurrent(rec);
    }

    /**
     * Creates layer feature items with default styles
     * @param {object} field   Feature field
     * @param {string} type    Geometry type of the feature field
     */
    createLfiFor(featureItem, type) {
        const lfi = { name: featureItem.name, field_name: featureItem.field_name };
        switch (type) {
            case 'point':
                lfi.point_style = 'circle:green:4:green';
                break;
            case 'linestring':
                lfi.line_style = 'green:2:solid';
                break;
            case 'polygon':
                lfi.line_style = 'green:2:solid';
                lfi.fill_style = 'green:40';
                break;
        }
        return lfi;
    }

    modifyCurrent(data) {
        const dataSpec = { ...data.spec };
        data['spec'] = { ...this.current.spec, ...dataSpec };
        const clone = toJS(data);
        this.current = { ...this.current, ...this.unformatData(clone) };
    }

    @action setSpecValue(propLayers, value) {
        const rec = this.current;
        let currentObj = rec.spec;
        for (let i = 0; i < propLayers.length - 1; ++i) {
            const name = propLayers[i];
            if (!currentObj[name]) currentObj[name] = {};
            currentObj = currentObj[name];
        }
        currentObj[propLayers[propLayers.length - 1]] = value;
        this.current = { ...this.current };
    }

    @action getLayerByName(layerName) {
        return Object.values(this.store).find(a => a.name === layerName);
    }

    @action getLayerByCode(layerCode) {
        return Object.values(this.store).find(a => a.code === layerCode);
    }

    @computed get basemaps() {
        return Object.values(this.store).filter(a => a.category === 'basemap');
    }

    @computed get overlays() {
        return Object.values(this.store).filter(a => a.category === 'overlay');
    }

    @computed get other_layers() {
        return Object.values(this.store).filter(
            a => a.category != 'basemap' && a.category != 'overlay'
        );
    }

    @computed get all_categories() {
        let categories = new Set(['basemap', 'overlay']);
        Object.values(this.store).forEach(layer => categories.add(layer.category));
        return Array.from(categories);
    }

    @action evaluateDefaultsFor(dsType, dsName, store) {
        const fieldDefs = this._getAllFieldDefs(dsType);
        let fields = [];
        toJS(fieldDefs).forEach(fieldDef => {
            let def = { ...fieldDef };
            if (Object.prototype.hasOwnProperty.call(fieldDef, 'default')) {
                if (fieldDef.enumerator && typeof fieldDef.default == 'function') {
                    const enumValues = store.datasourceStore.getEnumeratorValues(
                        dsName,
                        fieldDef.enumerator
                    );
                    def.default = fieldDef.default(enumValues);
                } else {
                    def.default = result(fieldDef, 'default');
                }
            }
            fields.push(def);
        });
        return fields;
    }

    _getAllFieldDefs(dsType) {
        if (!dsType) return [];
        return datasourceTypes[dsType].layerDefFields;
    }

    @action defaultValuesFor(dsType, dsName, store) {
        const specFields = this.evaluateDefaultsFor(dsType, dsName, store);
        let values = { spec: {} };
        specFields.map(fieldDef => {
            if (Object.prototype.hasOwnProperty.call(fieldDef, 'default')) {
                values.spec[fieldDef.name] = fieldDef.default;
            }
        });
        return values;
    }
}
