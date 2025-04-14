// Copyright: IQGeo Limited 2010-2023
import { FieldViewer } from './fieldViewer';

/**
 * Displays a timestamp with a locality-sensitive representation of this date
 * Uses Date.prototype.toLocaleString()
 * @name TimeFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class TimeFieldViewer extends FieldViewer {
    convertValue() {
        let value = this.fieldValue;
        if (!value) return '';
        if (value instanceof Date) return value.toLocaleString();
        return value;
    }
}

export default TimeFieldViewer;
