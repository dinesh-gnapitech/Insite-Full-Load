// Copyright: IQGeo Limited 2010-2023
import { FieldViewer } from './fieldViewer';

/**
 * Displays a timestamp following the ISO 8601 Extended Format but removing the 'T' and 'Z' so it's user presentable.
 * Equivalent to 6.1 and earlier default behaviour
 * @name TimeRawFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class TimeRawFieldViewer extends FieldViewer {
    convertValue() {
        let value = this.fieldValue;
        let parseTime, date, newTime;

        if (!value) return '';

        if (value instanceof Date) {
            value = value.toISOString();
        }
        if (typeof value == 'string') {
            parseTime = value.split('T');
            if (parseTime.length == 2) {
                date = parseTime[0];

                newTime = parseTime[1].split('.');
                newTime = newTime[0];

                value = `${date} ${newTime}`;
            }
        }
        return value;
    }
}

export default TimeRawFieldViewer;
