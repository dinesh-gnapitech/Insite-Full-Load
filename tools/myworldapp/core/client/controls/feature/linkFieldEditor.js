// Copyright: IQGeo Limited 2010-2023
import { FieldEditor } from './fieldEditor';
import { Input } from 'myWorld/uiComponents';

/**
 * Input for fields of type link. <br/>
 * @name LinkFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class LinkFieldEditor extends FieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.control = new Input({ value: this.fieldValue });
        this.setElement(this.control.$el);

        //enable firing 'change' event
        this.control.$el.on('input', this._changed.bind(this));
    }

    validateValue(value) {
        if (!value) return true;

        const // <description>|<url>
            regexp = /(\w+\:\/\/(.*))/i,
            res = regexp.exec(value);

        if (res) return true;
        else return this.msg('link_format');
    }
}

export default LinkFieldEditor;
