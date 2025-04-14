// Copyright: IQGeo Limited 2010-2023
import { NumberFieldEditor } from './numberFieldEditor';

/**
 * Editor for fields of type double<br/>
 * @name DoubleFieldEditor
 * @constructor
 * @extends {NumberFieldEditor}
 */
export class DoubleFieldEditor extends NumberFieldEditor {
    static {
        this.mergeOptions({
            unitValueOptions: {
                minimumFractionDigits: 0, //minimumFractionDigit to lowest possible
                maximumFractionDigits: 20 //maximumFractionDigit to highest possible
            }
        });
    }

    validateValue(value) {
        if (this.control.validity && !this.control.validity.valid) {
            return this.control.validity.message || this.msg('invalid_number');
        }

        //check if the value is an double
        if (value != parseFloat(value)) return this.msg('invalid_double');

        return super.validateValue(value);
    }
}

export default DoubleFieldEditor;
