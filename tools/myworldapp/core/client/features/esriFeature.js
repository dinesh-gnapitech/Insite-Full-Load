// Copyright: IQGeo Limited 2010-2023
import { DDFeature } from 'myWorld/features/ddFeature';

export class EsriFeature extends DDFeature {
    /**
     * @class  Feature that represents an address search result
     * @param  {featureData} featureData Feature details
     * @augments Feature
     * @constructs
     */
    constructor(featureData) {
        // Call the super constructor
        super(featureData);

        this.displayFieldName = featureData.displayFieldName;
    }

    /**
     * Returns an HTML string with the description to be shown in a myWorld results listing
     * Assumes the result will be enclosed in HTML where an <a> tag has started
     * @return {string} The html string with the formatted address
     */
    getTitle() {
        if (this.featureDD.title_expr) return super.getTitle();

        const typeExternalName = this.featureDD.external_name,
            title = this.displayFieldName && this.properties[this.displayFieldName];

        if (title) {
            return `${typeExternalName}: ${title}`;
        } else {
            return typeExternalName;
        }
    }

    /*
     * Apply an additional conversion on any timestamp fields so that we can parse them properly in our base DDFeature class
     */
    _deSerialiseField(props, key, fieldType) {
        if (fieldType == 'timestamp') {
            let value = props[key];
            if (fieldType == 'timestamp' && value != 'Null') {
                props[key] = new Date(value).toISOString();
            }
        }
        return super._deSerialiseField(props, key, fieldType);
    }
}

export default EsriFeature;
