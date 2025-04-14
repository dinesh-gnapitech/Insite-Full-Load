import { makeObservable, observable, action, runInAction } from 'mobx';
import { RestClient } from './RestClient';

export class MyWorldStore {
    @observable featureTypes = null;
    @observable fields = {};
    @observable isLoading = true;

    constructor() {
        makeObservable(this);
    }

    @action async getFeatureTypes() {
        runInAction(() => (this.isLoading = true));
        const res = await RestClient.get('config/dd/myworld');

        runInAction(() => {
            this.featureTypes = res.data.feature_types;
            this.isLoading = false;
        });
    }

    @action async getFields() {
        runInAction(() => (this.isLoading = true));
        const res = await RestClient.get('config/dd/myworld/fields');

        runInAction(() => {
            let next = {};

            res.data.fields.forEach(field => {
                next[field.table_name] = next[field.table_name] || [];
                next[field.table_name].push(field);
            });

            this.fields = next;
            this.isLoading = false;
        });
    }

    /**
     * Gets fields with geometry and basic features with no geom.
     * sets this.fields to {table_name [field,field]}
     */
    @action async getLayerFeatureItems() {
        runInAction(() => (this.isLoading = true));
        const [res, resFeaturesNoGeom] = await Promise.all([
            RestClient.get('config/dd/myworld/fields?types=geometry'), //Get fields with geometry
            RestClient.get('config/dd/myworld/basic?geom_type=none') //Get basic feature types with no geometry
        ]);
        const fields = res.data.fields;
        const featuresNoGeom = resFeaturesNoGeom.data.feature_types;

        runInAction(() => {
            let next = {};

            fields.forEach(field => {
                // Add basic fields to object
                next[field.table_name] = next[field.table_name] || [];
                next[field.table_name].push(field);
            });

            for (let i = 0; i < featuresNoGeom.length; i++) {
                const feature = featuresNoGeom[i];
                //Add basic fields to object
                feature.table_name = feature.name;
                feature.type = 'no geometry';
                feature.table_external_name = feature.external_name;
                next[feature.table_name] = next[feature.external_name] || [];
                next[feature.table_name].push(feature);
            }

            this.fields = next;
            this.isLoading = false;
        });
    }

    getFiltersFor(featureName) {
        if (!this.filtersTable) return;
        return this.filtersTable[featureName];
    }

    /**
     * Create filters look up table
     * [feature_name]{filter},{filter}
     */
    async filters() {
        let filters = await RestClient.get('config/dd/myworld/filters');
        filters = filters.data.filters;
        let filtersLookUpTable = {};
        filters.forEach(filter => {
            let nextFilter = { name: filter.name, value: filter.value };
            filtersLookUpTable[filter.feature_name] = filtersLookUpTable[filter.feature_name] || [];
            filtersLookUpTable[filter.feature_name].push(nextFilter);
        });
        this.filtersTable = filtersLookUpTable;
    }

    storedField(fieldName, onlyNumeric = false) {
        return this.fields[fieldName].filter(fieldDef => {
            const isNumeric = onlyNumeric ? this._isNumericType(fieldDef) : true;
            return (
                !fieldDef.internal_name.startsWith('myw_') &&
                !this._isGeometryField(fieldDef) &&
                isNumeric
            );
        });
    }

    _isGeometryField(fieldDef) {
        const geomTypes = ['point', 'polygon', 'linestring', 'raster'];
        return (
            fieldDef.internal_name === 'myw_geometry_world_name' ||
            geomTypes.includes(fieldDef.type) ||
            fieldDef.internal_name.startsWith('myw_gwn')
        );
    }

    _isNumericType(fieldDef) {
        const type = fieldDef.type;
        return type.includes('numeric') || ['integer', 'double'].includes(type);
    }
}
