// Copyright: IQGeo Limited 2010-2023
import GeoJSON from 'ol/format/GeoJSON';

//subclass of GeoJSON format so that it can handle the output from our server which:
// - uses 'MywFeatureCollection' instead of 'FeatureCollection'
// - includes secondary geometries
export class MywGeoJSONFormat extends GeoJSON {
    readFeaturesFromObject(object, opt_options) {
        const geoJSONObject = /** @type {GeoJSONObject} */ (object);
        /** @type {Array<OlFeature>} */
        let features = null;
        //IQGeo: handle 'MywFeatureCollection' type as sent by server
        if (['MywFeatureCollection', 'FeatureCollection'].includes(geoJSONObject['type'])) {
            const geoJSONFeatureCollection = /** @type {GeoJSONFeatureCollection} */ (object);
            features = [];
            const geoJSONFeatures = geoJSONFeatureCollection['features'];
            for (let i = 0, ii = geoJSONFeatures.length; i < ii; ++i) {
                const geoJSONFeature = geoJSONFeatures[i];
                features.push(this.readFeatureFromObject(geoJSONFeature, opt_options));
                //IQGeo: handle secondary_geometries by adding a feature for each geometry
                if (geoJSONFeature.secondary_geometries) {
                    const { id, properties, myw, type } = geoJSONFeature;
                    for (const [geomFieldName, geometry] of Object.entries(
                        geoJSONFeature.secondary_geometries
                    )) {
                        if (!geometry) continue;
                        const secondaryFeature = {
                            id,
                            geometry,
                            properties,
                            myw,
                            type,
                            geomFieldName
                        };
                        features.push(this.readFeatureFromObject(secondaryFeature, opt_options));
                    }
                }
            }
        } else {
            features = [this.readFeatureFromObject(object, opt_options)];
        }
        return features;
    }

    readFeatureFromObject(object, opt_options) {
        const feature = super.readFeatureFromObject(object, opt_options);

        feature.myw = object.myw;
        feature.geomFieldName = object.geomFieldName;

        return feature;
    }
}

export default MywGeoJSONFormat;
