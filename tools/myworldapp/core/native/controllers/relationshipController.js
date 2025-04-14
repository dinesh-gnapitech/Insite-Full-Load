// Copyright: IQGeo Limited 2010-2023
import { ObjectNotFoundError, UnauthorizedError } from 'myWorld-base';
import { BaseController } from '../base/controllers';
import { Reference } from '../base';

/* Used to get myWorld features from foreign_key fields, reference fields
 * and reference_set fields */
export class RelationshipController extends BaseController {
    /**
     * Obtains the features in a given relationship
     * @param  {string} tableName Feature Type
     * @param  {string} key Feature key
     * @param  {string} relationshipName Name of relationship (field)
     * @param  {object} aspects
     * @param  {boolean} aspects.includeLobs
     * @param  {boolean} aspects.includeGeoGeometry
     */
    async get(tableName, key, relationshipName, aspects) {
        const featureOrFeatures = await this._followRelationship(
            tableName,
            key,
            relationshipName,
            aspects
        );
        const features = this._asFeaturesArray(featureOrFeatures);
        return { features };
    }

    async _followRelationship(tableName, key, relationshipName, aspects) {
        const ref = new Reference('myworld', tableName, key);
        const featureRec = await this.view.get(ref);

        const getFeatureOptions = {
            displayValues: true,
            includeGeoGeometry: true,
            ...aspects
        };

        return this.view
            .followRelationship(featureRec, relationshipName, getFeatureOptions)
            .catch(error => {
                if (error instanceof ObjectNotFoundError) return;
                if (error instanceof UnauthorizedError) {
                    // Mock up just enough of a feature so that we get to the DD check
                    // that will raise the unauthorised exception.
                    return {
                        id: key,
                        properties: { myw_object_type: tableName }
                    };
                }
                //unexpected. output error but continue with request
                console.log(`Unexpected error in relationship Controller`, error);
                return;
            });
    }

    _asFeaturesArray(featureOrFeatures) {
        if (!featureOrFeatures) return [];
        else if (!Array.isArray(featureOrFeatures)) return [featureOrFeatures];
        return featureOrFeatures;
    }
}
