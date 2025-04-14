// Copyright: IQGeo Limited 2010-2023
import { BaseController } from '../base/controllers';

export class RenderLayerController extends BaseController {
    async getFeatures(layerName, bboxes, args) {
        // Params:
        // - limit: mandatory
        // - layerName: mandatory
        // - bounds: mandatory
        // - zoom: mandatory
        // - featureTypes: optional
        // - world_name: optional (default: 'geo')
        // - offset: optional - default null
        // - schema: optional - if 'delta' only features in a delta are returned
        //
        let offset;

        const layer = await this.currentUser.getLayer(layerName);
        const dsName = layer.datasource_name;
        let featureItems = layer.feature_items;
        const { limit, zoom, schema, world_name, featureTypes, requiredFields } = args;
        let offsetString = args.offset;
        const featureTypesDetails = this._renderDetailsByFeatureType(
            featureItems,
            featureTypes,
            requiredFields
        );
        offset = new RenderLayerOffset(offsetString, bboxes, dsName, featureTypesDetails);

        const features = await this._getFeatures(offset, zoom, limit, world_name, schema);
        const result = { featureCollection: { features } };
        offsetString = offset.serializeState();
        if (offsetString) {
            result.offset = offsetString;
        }
        return result;
    }

    _renderDetailsByFeatureType(featureItemDefs, featureTypes, requiredFields = {}) {
        // Gather the details from layer_feature_item by feature type
        // A feature can have multiple geometry fields to render. This method returns the details necessary to do one query per feature type
        //gather item details per feature type
        const featureTypesDetails = {};
        for (const featureItemDef of featureItemDefs) {
            const featureType = featureItemDef.name;

            //Check for specific feature type
            if (featureTypes && !featureTypes.includes(featureType)) continue;

            const fieldName = featureItemDef.field_name;
            if (!featureTypesDetails[featureType]) {
                featureTypesDetails[featureType] = {
                    name: featureType,
                    geom_field_names: [],
                    required_fields: ['myw_geometry_world_name'].concat(
                        requiredFields[featureType] ?? []
                    ),
                    min_vis: 100,
                    max_vis: 0
                };
            }
            const details = featureTypesDetails[featureType];

            if (fieldName) {
                details.geom_field_names.push(fieldName);
                details.required_fields.push(
                    fieldName,
                    'myw_gwn_' + fieldName,
                    'myw_orientation_' + fieldName
                );
            }

            //include fields used by text styles in results
            const textStyle = featureItemDef.text_style ?? '';
            const textField = textStyle.split(':')[0];
            if (textField) details.required_fields.push(textField);

            details.min_vis = Math.min(details.min_vis, featureItemDef.min_vis ?? 0);
            details.max_vis = Math.max(details.max_vis, featureItemDef.max_vis ?? 100);
            details.filter = featureItemDef.filter; //filter should be the same if several items
        }
        return Object.values(featureTypesDetails);
    }

    async _getFeatures(offset, zoom, limit, world, schema) {
        // Get next chunk of features from world 'world_name'

        const fc = await this._getRenderFeaturesFrom(offset, zoom, limit, world, schema);
        const features = fc.features;
        if (fc.count < limit) {
            offset.increment();
            if (!offset.finished()) {
                limit -= fc.count;
                const moreFeatures = await this._getFeatures(offset, zoom, limit, world, schema);
                return features.concat(moreFeatures);
            }
        } else {
            offset.incrementRecordOffset(limit);
        }
        return features;
    }

    async _getRenderFeaturesFrom(offset, zoom, limit, world = 'geo', schema) {
        // Get features from the current feature type
        // 'offset paraemeter tableName defines the feature type to scan
        if (offset.featureTypesDetails.length === 0) return { features: [], count: 0 };

        const params = offset.getParameters();
        const { featureDetails, dsName, bounds } = params;
        if (
            zoom < featureDetails.min_vis ||
            zoom > featureDetails.max_vis ||
            !featureDetails.geom_field_names.length //geometryless feature
        )
            return { features: [], count: 0 };

        const featureDef = await this.currentUser.getAppFeatureDef(dsName, featureDetails.name);
        const table = this._db.view(this.view.delta, schema).table(featureDetails.name, dsName);
        const filter = featureDef.filters.find(filter => filter.name === featureDetails.filter);

        const includeFields = [featureDef.key_name].concat(featureDetails.required_fields);
        const bbox = {
            xmin: bounds._southWest.lng,
            ymin: bounds._southWest.lat,
            xmax: bounds._northEast.lng,
            ymax: bounds._northEast.lat
        };

        const query = table
            .query({ displayValues: false, includeFields })
            .whereGeometryIn(featureDetails.geom_field_names, world, bbox)
            .limit(limit)
            .orderBy([{ fieldName: featureDef.key_name }]);

        if ('offset' in params) query.offset(params.offset);
        if (filter) query.filter([filter.pred]);

        const features = await query.all();
        return {
            features,
            count: features.length,
            offset
        };
    }
}

// Local class used to handle offset information:
//   - bound box index (which bounding box is being processed)
//   - feature type index (which feature type is being processed)
//   - feature offset (from which feature to obtain)
class RenderLayerOffset {
    constructor(offsetString, bboxes, dsName, featureTypesDetails) {
        this.bboxIndex = 0;
        this.featureTypeIndex = 0;
        this.recordOffset = 0;
        this.bboxes = bboxes;
        this.dsName = dsName;
        this.featureTypesDetails = featureTypesDetails; // processing of layer feature items
        if (offsetString) {
            this._parseOffset(offsetString);
        }
    }
    _parseOffset(offsetString) {
        const offsetParts = JSON.parse(offsetString);

        this.bboxIndex = this._parseBboxIndex(offsetParts[0]);
        this.featureTypeIndex = this._featureTypeIndexFromTypeName(offsetParts[1]);
        this.recordOffset = parseInt(offsetParts[2], 10);
    }
    _parseBboxIndex(indexAsString) {
        const numBboxes = this.bboxes.length;
        const bboxIndex = parseInt(indexAsString, 10);
        if (bboxIndex < 0 || bboxIndex >= numBboxes) {
            throw new Error(
                `Invalid bounding box index ${bboxIndex}. Should be between 0 and ${numBboxes - 1}.`
            );
        }
        return bboxIndex;
    }
    _featureTypeIndexFromTypeName(nextFeature) {
        const index = this.featureTypesDetails.findIndex(item => item.name === nextFeature);
        if (index == -1) {
            throw new Error(`Invalid next feature ${nextFeature}`);
        }
        return index;
    }
    serializeState() {
        if (this.finished()) {
            return null;
        }
        const nextFeature = this.featureTypesDetails[this.featureTypeIndex];
        return JSON.stringify([this.bboxIndex, nextFeature.name, this.recordOffset]);
    }
    increment() {
        this.recordOffset = 0;
        this.featureTypeIndex += 1;
        if (this.featureTypeIndex >= this.featureTypesDetails.length) {
            this.featureTypeIndex = 0;
            this.bboxIndex += 1;
        }
    }
    incrementRecordOffset(increment) {
        this.recordOffset += increment;
    }
    // Return true if the offset object has been incremented to the end and no
    // more possibilities remain
    finished() {
        return this.bboxIndex >= this.bboxes.length;
    }
    // Return a parameters object for the current state of the offset
    getParameters() {
        const featureDetails = this.featureTypesDetails[this.featureTypeIndex];
        const bbox = this.bboxes[this.bboxIndex];
        const params = {
            dsName: this.dsName,
            featureDetails,
            bounds: bbox
        };
        if (this.recordOffset) {
            params.offset = this.recordOffset;
        }
        return params;
    }
}
