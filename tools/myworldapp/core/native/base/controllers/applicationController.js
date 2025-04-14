// Copyright: IQGeo Limited 2010-2023
import { groupBy, indexBy, mapObject, sortBy } from 'underscore';
import { BaseController } from './baseController';
import { UserController } from './userController';
import { LayerGroupController } from './layerGroupController';

export class ApplicationController extends BaseController {
    async get(applicationName) {
        const applicationRec = await this._db.table('application').get(applicationName);
        if (!applicationRec) {
            throw new Error(`No application with name: ${applicationName}`);
        }
        return applicationRec;
    }

    async getStartupInfo(applicationName) {
        const [appRec, layers, layerGroups, rights, privateLayers] = await Promise.all([
            this.get(applicationName),
            this.currentUser.getLayerDefs(applicationName),
            this.getLayerGroups(),
            this.getUserPermissionsForApp(applicationName),
            this.getPrivateLayers()
        ]);
        const result = {
            externalName: appRec.external_name,
            layers: layers.map(layerRec => layerRec.serialize()),
            layerGroups: sortBy(layerGroups, 'name'),
            rights: rights,
            roles: this.currentUser.roles,
            privateLayers: privateLayers
        };
        let dsNames = layers.map(l => l.datasource_name);
        dsNames = [...new Set(['myworld', 'google'].concat(dsNames))];
        const datasources = await this._getDatasources(dsNames, applicationName);
        result.datasources = datasources;
        return result;
    }

    getLayerGroups() {
        const layerGroupController = new LayerGroupController(this.view);
        return layerGroupController.getAll();
    }

    getUserPermissionsForApp(applicationName) {
        const userController = new UserController(this.view);
        return userController.getUserPermissionsForApp(this.currentUser.username, applicationName);
    }

    async getPrivateLayers() {
        const groupIds = this.currentUser.groups;
        const table = this._db.table('private_layer');
        const [privLayers, privateLayers] = await Promise.all([
            table.where({ owner: this.currentUser.username }).all(),
            table.where({ sharing: groupIds }).all()
        ]);
        let layers = {};
        // return just the unique ones
        [...privLayers, ...privateLayers].forEach(layer => {
            layers[layer.id] = layer;
        });
        return Object.values(layers);
    }

    async getFeatureTypes(applicationName, dsName, editableOnly) {
        let featureDefs = await this.currentUser.getAppFeatureTypeDefs(applicationName);
        featureDefs = Object.values(featureDefs).filter(
            featureDef => featureDef.datasource_name === dsName
        );
        return indexBy(featureDefs, 'feature_name');
    }

    async getAllApplications() {
        const records = await this._db.table('application').all();
        return records.map(rec => rec.serialize());
    }

    async _getDatasources(datasourceNames, applicationName) {
        const [queryRecs, datasourceRecs] = await Promise.all([
            this._db.table('query').all(),
            this._db.table('datasource').where({ name: datasourceNames }).all()
        ]);

        const queriesByDs = groupBy(queryRecs, 'datasource_name');
        const promises = datasourceRecs.map(datasource => {
            const dsName = datasource.name;
            const dsQueries =
                dsName == 'myworld' ? {} : this._serializeQueries(queriesByDs[dsName]);
            return this._completeDatasourceInfo(applicationName, datasource, dsQueries);
        });
        return Promise.all(promises);
    }

    _serializeQueries(queries) {
        const queriesByType = groupBy(queries, 'myw_object_type');
        return mapObject(queriesByType, queries =>
            queries.map(query => ({
                attrib_query: query.attrib_query,
                display_value: query.myw_search_desc1,
                matched_value: query.myw_search_val1,
                lang: query.lang
            }))
        );
    }

    /* This merges data from the 'spec' field of the datasource with the DD information only
       for features that are visible in the application */
    async _completeDatasourceInfo(applicationName, datasource, queries) {
        const featureTypes = (datasource['featureTypes'] = {});
        let featureTypesSpec = {};

        if (datasource['spec']?.['featureTypes']) {
            featureTypesSpec = datasource['spec']['featureTypes'];
            delete datasource['spec']['featureTypes'];
        }

        const appFeatureTypes = await this.getFeatureTypes(applicationName, datasource.name);
        const ddRecs = await this._db
            .cachedTable('dd_feature')
            .where({ datasource_name: datasource.name })
            .all();
        ddRecs.forEach(ddRec => {
            const featureTypeInfo = appFeatureTypes[ddRec.feature_name];
            if (!featureTypeInfo) return;

            // Get feature info from the datasource spec
            let featureInfo = featureTypesSpec[ddRec.feature_name];
            if (!featureInfo) featureInfo = {};

            // Now add information from the DD
            featureInfo['external_name'] = ddRec.external_name;
            featureInfo['primary_geom_name'] = ddRec.primary_geom_name;
            if (featureTypeInfo.editable_in_application) featureInfo['editable'] = true;
            if (featureTypeInfo.versioned) featureInfo['versioned'] = true;

            //add query info
            if (queries[ddRec.feature_name]) featureInfo['queries'] = queries[ddRec.feature_name];

            //add searches
            let searchRules = featureTypeInfo.search_rules;
            if (datasource.name != 'myworld' && searchRules.length > 0) {
                searchRules = this._processSearchRules(searchRules);
                featureInfo['search_id_terms'] = searchRules.idTerms;
                featureInfo['search_fields'] = searchRules.fields;
            }

            featureTypes[ddRec.feature_name] = featureInfo;
        });
        return datasource;
    }

    /*
     * Converts a search rule into id terms and searchable fields
     * To be used by external datasources
     * @param  {object[]} searchRules  Search rule records. assumes only one exists
     * @return {object}
     */
    _processSearchRules(searchRules) {
        const rule = searchRules[0].search_val_expr;
        if (!rule) return { idTerms: '', fields: [] };
        const parts = rule.split('[');
        const fields = parts.splice(1);
        return {
            idTerms: parts[0].trim().split(' '),
            fields: fields.map(p => p.trim().slice(0, -1))
        };
    }
}
