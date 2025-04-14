// Copyright: IQGeo Limited 2010-2023
import { FieldViewer } from './fieldViewer';

/**
 * Displays contents of a html field<br>
 * @name BooleanFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class BooleanFieldViewer extends FieldViewer {
    /**
     * Converts the value for display <br/>
     * Escapes the value and adds unit information where required
     * @return {string} Value as a string
     */
    convertValue(value) {
        if (value === true) return this.msg('true');
        if (value === false) return this.msg('false');

        return super.convertValue(value);
    }
}

export default BooleanFieldViewer;
