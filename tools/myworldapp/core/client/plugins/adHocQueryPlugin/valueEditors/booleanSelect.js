// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldEditor } from 'myWorld/controls';

export class BooleanSelect extends FieldEditor {
    static {
        this.prototype.tagName = 'select';
        this.prototype.className = 'text';

        this.mergeOptions({
            selectOptions: ['true', 'false']
        });

        this.prototype.events = Object.assign({}, FieldEditor.prototype.events, {
            'click li': 'selectItem'
        });
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.$el.on('input', this._changed.bind(this));
        this.render();
    }

    render() {
        this.$el.empty();

        // Create the list
        this.options.selectOptions.forEach(enumValue => {
            const option = $('<option>')
                .val(enumValue)
                .text(this.owner.msg(enumValue))
                .prop('selected', enumValue === this.fieldValue?.toString());
            this.$el.append(option);
        });
    }

    getValue() {
        let orig = super.getValue();
        if (orig == 'true') return true;
        else if (orig == 'false') return false;
        else throw new Error(`Can't parse selection: ${orig}`);
    }
}
