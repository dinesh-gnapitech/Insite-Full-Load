// Copyright: IQGeo Limited 2010-2023
import { FieldEditor } from './fieldEditor';
import { Checkbox } from 'myWorld/uiComponents';

/**
 * Checkbox input for fields of type boolean. <br/>     *
 * @name BooleanFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class BooleanFieldEditor extends FieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.control = new Checkbox({
            indeterminate: true,
            mandatory: feature.matchesPredicate(this.fieldDD.mandatory),
            value: this.fieldValue === undefined ? null : this.fieldValue,
            onChange: this._changed.bind(this)
        });
        this.setElement(this.control.render().$el);
    }
}

export default BooleanFieldEditor;
