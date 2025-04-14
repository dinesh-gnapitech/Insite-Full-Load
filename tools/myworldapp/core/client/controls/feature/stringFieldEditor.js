// Copyright: IQGeo Limited 2010-2023
import { FieldEditor } from './fieldEditor';
import { Textarea, Input } from 'myWorld/uiComponents';

/**
 * Text input for fields of type string. <br/>
 * Will present a text area if the max length is not defined or is greater than 100 characters
 * Superclass for: <br/>
 *        {@link FileFieldEditor} <br/>
 *        {@link ImageFieldEditor} <br/>
 * @name StringFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class StringFieldEditor extends FieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        const maxLength = this.maxLength();
        if (isNaN(maxLength) || maxLength > 100) {
            this.control = new Textarea({
                text: this.fieldValue,
                onChange: this._changed.bind(this)
            });
        } else {
            this.control = new Input({
                value: this.fieldValue,
                onChange: this._changed.bind(this)
            });
        }
        this.control.$el.appendTo(this.$el);
    }

    /**
     * If the string field is the key field for a features, this method
     * Over-rides the super's method to trim whitespace from both sides of the string
     * Fix for insert error on a windows server
     */
    getValue() {
        let value = super.getValue();
        if (this.feature.featureDD.key_name == this.fieldDD.internal_name) {
            value = value.trim();
        }
        if (value == '') value = null;
        return value;
    }

    /**
     * returns the length of a myworld string field from the DD
     * @param  {string} fieldType from the DD e.g.: 'string(32)'
     * @return {number}
     */
    maxLength() {
        const lengthStr = this.fieldDD.typeParams[0];
        return parseInt(lengthStr, 10);
    }
}
