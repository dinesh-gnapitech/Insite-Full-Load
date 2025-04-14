// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { Feature } from 'myWorld/features/feature';

// A conflict object
//
// Behaves as a feature. Internally stores base, delta and master features plus conflict details
class Conflict extends Feature {
    constructor(delta, master, base, masterChange, masterFields, deltaFields) {
        const feature = delta ? delta : base;
        super(feature); // TODO: Hack to get goto etc
        this.delta = delta;
        this.base = base;
        this.master = master;
        this.masterChange = masterChange;
        this.masterFields = masterFields;
        this.deltaChange = delta._myw.change_type;
        this.deltaFields = deltaFields;

        this.feature = delta ? delta : base;

        this.datasource = delta.datasource;
    }

    getTitle() {
        return this.feature.getTitle();
    }

    getResultsHtmlDescription() {
        const title = escape(this.feature.getTitle());
        const desc = escape(`Conflict: ${this.masterChange} / ${this.deltaChange}`);
        return `${title}</div><div class="result-desc">${desc}</div>`;
    }

    getResultsHoverText() {
        const masterStr = this._infoStr('master', this.masterChange, this.masterFields);
        const deltaStr = this._infoStr('delta', this.deltaChange, this.deltaFields);
        return masterStr + '\n' + deltaStr;
    }

    /**
     * Creates a string to nicely display changed fields (taking into account photo, geometry and long string fields)
     * @param {string} recType
     * @param {string} changeType
     * @param {Array} fields
     * @returns {string}
     */
    _infoStr(recType, changeType, fields) {
        let info = `Change in ${recType}: ${changeType}`;
        info += '\n';

        if (changeType == 'update') {
            const feature = recType == 'master' ? this.master : this.delta;
            fields.forEach(fieldName => {
                const field = feature.getFieldDD(fieldName);
                const fieldValueStr = this._getStringForFieldValue(feature, field);

                info += `   ${field.external_name}: ${fieldValueStr}`;
                info += '\n';
            });
        }
        return info;
    }

    /**
     * Returns display formatted string of value in field of feature (taking into account photo fields, long strings and geometry fields)
     * @param {MyWorldFeature} feature
     * @param {string} field
     * @private
     */
    _getStringForFieldValue(feature, field) {
        let fieldValueStr = feature.properties[field.internal_name] || '<null>';

        //Geometry field: Say which point is changed
        if (field.internal_name == feature.getGeometryFieldNameInWorld('geo')) {
            fieldValueStr = this._getGeometryString(feature.geometry);
        }

        //Photo field: set fieldValueStr to type of image
        if (field.type.includes('image')) {
            fieldValueStr = field.type;
        }

        //Long string: truncate
        if (fieldValueStr.length > 50) {
            fieldValueStr = fieldValueStr.substring(0, 50);
            fieldValueStr += '...';
        }

        return fieldValueStr;
    }

    _getGeometryString(geometry) {
        return `${geometry.type} (${geometry.flatCoordinates().length})`;
    }
}

export default Conflict;
