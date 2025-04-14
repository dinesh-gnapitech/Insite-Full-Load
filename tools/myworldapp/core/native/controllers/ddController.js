// Copyright: IQGeo Limited 2010-2023
import { indexBy, mapObject, pick } from 'underscore';
import { UnauthorizedError } from 'myWorld-base';

import { BaseController } from '../base/controllers';

export class DDController extends BaseController {
    async request(ds_name, feature_types) {
        const features_dd = {};

        const table_dd_requests = [];
        feature_types.forEach(type => {
            if (!type) return;

            const table_dd_request = this.ddForType(ds_name, type)
                .then(result => {
                    if (result) features_dd[type] = result;
                })
                .catch(error => {
                    if (error instanceof UnauthorizedError) return; //ignore
                    throw error;
                });
            table_dd_requests.push(table_dd_request);
        });

        await Promise.all(table_dd_requests);
        const catalogues = await this.cataloguesFor(ds_name, features_dd);
        const enumerators = await this.enumeratorsFor(features_dd, catalogues);
        return {
            features_dd,
            enumerators,
            catalogues
        };
    }

    async ddForType(ds_name, type) {
        const [featureDef, field_groups] = await Promise.all([
            this.dd.currentUser.getAppFeatureDef(ds_name, type),
            this.dd.fieldGroupDefsFor(ds_name, type)
        ]);
        if (!featureDef) return;

        const filters = featureDef.filters.reduce((prev, filter) => {
            prev[filter.name] = filter.value;
            return prev;
        }, {});

        const ddInfo = {
            ...pick(
                featureDef,
                'name',
                'key_name',
                'short_description_expr',
                'title_expr',
                'external_name',
                'editable',
                'editor_options',
                'track_changes',
                'insert_from_gui',
                'update_from_gui',
                'delete_from_gui',
                'fields',
                'fields_order',
                'field_groups',
                'geometry_type',
                'primary_geom_name',
                'geom_indexed'
            ),
            name: type,
            fields: this._fieldDefs(featureDef),
            field_groups,
            filters
        };

        if (featureDef.remote_spec) ddInfo.remote_spec = featureDef.remote_spec;
        if (featureDef.versioned) ddInfo.versioned = featureDef.versioned;

        return ddInfo;
    }

    async enumeratorsFor(featuresDD, catalogues) {
        const enumsToGet = new Set();
        for (const dd of Object.values(featuresDD)) {
            for (const fieldDef of Object.values(dd.fields)) {
                if (fieldDef.enum) enumsToGet.add(fieldDef['enum']);
            }
        }
        for (const catalogue of Object.values(catalogues)) {
            for (const fieldDef of Object.values(catalogue.fields)) {
                if (fieldDef.enum) enumsToGet.add(fieldDef['enum']);
            }
        }

        let enumerators = await this._db
            .table('dd_enum')
            .where({ name: [...enumsToGet] })
            .all();
        for (const key in enumerators) {
            enumerators[key] = await enumerators[key].setValues();
        }
        return indexBy(enumerators, 'name');
    }

    async cataloguesFor(dsName, featuresDD) {
        const catalogues = {};
        //identify which catalogues we need
        for (const dd of Object.values(featuresDD)) {
            for (const fieldDef of Object.values(dd.fields)) {
                if (!fieldDef.enum) continue;
                const enumParts = fieldDef.enum.split('.');
                if (enumParts.length < 2) continue;

                const featureType = enumParts[0];
                if (catalogues[featureType]) continue;
                try {
                    catalogues[featureType] = await this._catalogueDetailsFor(dsName, featureType);
                } catch (error) {
                    console.warn(`Fetching catalogue details for ${featureType}:`, error);
                }
            }
        }
        return catalogues;
    }

    async _catalogueDetailsFor(dsName, featureType) {
        const dd = await this.dd.getFeatureTypeDef(dsName, featureType);
        const fields = {};
        for (const [fieldName, fieldDef] of Object.entries(dd.fields)) {
            if (fieldDef.enum) fields[fieldName] = { enum: fieldDef.enum };
        }

        //get the catalogue records
        const table = this.view.table(featureType);
        const features = await table.all();
        return {
            fields,
            records: features.map(f => f.properties)
        };
    }

    _fieldDefs(featureDef) {
        return mapObject(featureDef.fields, fieldDef =>
            Object.entries(fieldDef).reduce((prev, [key, value]) => {
                if (
                    ['id', 'table_name', 'datasource_name'].includes(key) ||
                    value === null ||
                    (key == 'mandatory' && value === 'false') ||
                    (key == 'read_only' && value === 'false') ||
                    (key == 'visible' && value === 'true') ||
                    (key == 'new_row' && value === true)
                )
                    return prev;

                prev[key] = value;
                return prev;
            }, {})
        );
    }
}
