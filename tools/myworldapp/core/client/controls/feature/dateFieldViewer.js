// Copyright: IQGeo Limited 2010-2023
import { convertToLocalDate } from './dateUtils';
import { FieldViewer } from './fieldViewer';

/**
 * Displays a date field value with a locality sensitive representation of the date portion of this date based on system settings
 * Uses Date.prototype.toLocaleDateString()
 * @name DateFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class DateFieldViewer extends FieldViewer {
    convertValue() {
        let value = this.fieldValue;
        if (this.fieldDD.baseType === 'timestamp') {
            if (!value) return '';
            if (typeof value == 'string') value = new Date(value); //If value is a string, convert to date
            if (value instanceof Date) return value.toLocaleDateString();
        } else return convertToLocalDate(value);
    }
}

export default DateFieldViewer;
