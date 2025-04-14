// Copyright: IQGeo Limited 2010-2023
import { NumberFieldEditor } from './numberFieldEditor';

/**
 * Editor for fields of type numeric<br/>
 * @name NumericFieldEditor
 * @constructor
 * @extends {NumberFieldEditor}
 */
export class NumericFieldEditor extends NumberFieldEditor {
    constructor(owner, feature, fieldDD) {
        const options = getRangeOptions(fieldDD);
        super(owner, feature, fieldDD, options);
    }
}

/**
 * Obtain options that define the min and the max limit using the precision and scale from the data type
 */
export function getRangeOptions(fieldDD) {
    const { type } = fieldDD;
    const precisionStr = type.substring(8, type.indexOf(')')).split(',');
    const precision = parseInt(precisionStr[0], 10);
    const scale = parseInt(precisionStr[1], 10);

    const integerDigitsAllowed = precision - scale;
    const decimalDigitsAllowed = scale;
    let dbMaxStr = '';

    for (let i = 0; i < integerDigitsAllowed; i++) dbMaxStr += '9';

    if (decimalDigitsAllowed) {
        //Adds the digits after the decimal
        dbMaxStr += '.'; //Adds a decimal point
        for (let j = 0; j < decimalDigitsAllowed; j++) dbMaxStr += '9';
    }

    const dbMax = parseFloat(dbMaxStr, 10),
        dbMin = dbMax * -1,
        fieldMin = fieldDD.min_value,
        fieldMax = fieldDD.max_value;

    const min_value =
        (fieldMin && fieldMin < dbMin) || typeof fieldMin === 'undefined' ? dbMin : fieldMin;
    const max_value =
        (fieldMax && fieldMax > dbMax) || typeof fieldMax === 'undefined' ? dbMax : fieldMax;

    const unitValueFactionalDigits = decimalDigitsAllowed || 0;
    const unitValueOptions = {
        minimumFractionDigits: unitValueFactionalDigits,
        maximumFractionDigits: unitValueFactionalDigits
    };

    return {
        min_value,
        max_value,
        unitValueOptions
    };
}

export default NumericFieldEditor;
