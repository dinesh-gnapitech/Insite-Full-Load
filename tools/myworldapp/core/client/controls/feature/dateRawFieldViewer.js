// Copyright: IQGeo Limited 2010-2023
import { FieldViewer } from './fieldViewer';

/**
 * Displays a date field value in ISO 8601 format (date portion only)
 * Uses Date.prototype.toISOString()
 * @name DateRawFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class DateRawFieldViewer extends FieldViewer {
    convertValue() {
        let value = this.fieldValue;

        if (!value) return '';

        if (value instanceof Date) return value.toISOString().slice(0, 10);

        return value;
    }
}

export default DateRawFieldViewer;
