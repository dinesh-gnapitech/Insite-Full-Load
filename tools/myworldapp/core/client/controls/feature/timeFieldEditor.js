// Copyright: IQGeo Limited 2010-2023
import { FieldEditor } from './fieldEditor';
import { Input } from 'myWorld/uiComponents/index';

/**
 * Input for fields of type timestamp. <br/>
 * Currently just a disabled text input
 * @name TimeFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class TimeFieldEditor extends FieldEditor {
    // Fields with type timestamp are disabled.
    // They were meant to be used with generators and they are not handled well in the GUI and
    // in validation at the moment.
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        const value = this.fieldValue?.toLocaleString();
        this.control = new Input({
            value,
            cssClass: 'disabled-input',
            disabled: 'disabled'
        });
        this.setElement(this.control.render().$el);

        //enable firing 'change' event
        this.control.$el.on('input', this._changed.bind(this));
    }

    getValue() {
        return undefined;
    }

    /**
     * this editor is (currently) always readonly
     */
    setReadonly() {
        //this editor is (currently) always readonly
    }
}

export default TimeFieldEditor;
