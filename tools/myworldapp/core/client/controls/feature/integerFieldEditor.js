// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldEditor } from './fieldEditor';
import { NumberFieldEditor } from './numberFieldEditor';

/**
 * Editor for fields of type integer<br/>
 * @name IntegerFieldEditor
 * @constructor
 * @extends {NumberFieldEditor}
 */
export class IntegerFieldEditor extends NumberFieldEditor {
    static {
        this.mergeOptions({
            inputMode: 'numeric',
            smallRange: 10, // If the items are in this range, show radio buttons
            mediumRange: 20, // If the items are in this range, show a pick list
            unitValueOptions: { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        });

        this.prototype.events = Object.assign({}, FieldEditor.prototype.events, {
            'click li': 'selectItem'
        });
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        const range = Math.abs(fieldDD.max_value - fieldDD.min_value);
        if (options.expandedMode && range) {
            if (range > 0 && range < this.options.smallRange) {
                this.mode = 'expanded';
            } else if (range >= this.options.smallRange && range <= this.options.mediumRange) {
                this.mode = 'medium';
            } else {
                this.mode = 'compact';
            }
        } else {
            this.mode = 'compact';
        }

        this.render();
    }

    render() {
        //this.$el.empty();
        if (this.mode === 'expanded') this.renderExpanded();
        else if (this.mode === 'medium') this.renderMedium();
        else {
            // if the range includes all positive integers, use type='tel'
            if (this.fieldDD.min_value >= 0 && this.fieldDD.max_value > 0) {
                this.options.inputType = 'tel';
                this.options.pattern = '[0-9]*';
            }
            //NumberFieldEditor.prototype.render.apply(this);
        }
        this.$el.on('input', this._changed.bind(this));
    }

    /**
     * Render a button-set and select the one with the fieldValue
     */
    renderExpanded() {
        this.selectedValue = null;
        let listItem;
        const list = $('<ul>', { class: 'focused-select-menu' });
        // create the list
        for (let i = this.fieldDD.min_value; i < this.fieldDD.max_value + 1; i++) {
            listItem = $('<li>').text(this.convertValueForDisplay(i));
            list.append(listItem);
        }
        this.$el.html(list);

        // Select the field value
        let selectedValue = this.convertValueForDisplay(this.fieldValue);
        this.$el
            .children()
            .children()
            .toArray()
            .forEach(li => {
                if (this.$(li).html() === selectedValue) {
                    this.$(li).addClass('selected');
                }
            });
    }

    /**
     * Render a pick list and select the fieldValue
     */
    renderMedium() {
        let option;
        const picklist = (this.picklist = $('<select>', { class: 'text' }));
        // create the list
        for (let i = this.fieldDD.min_value; i < this.fieldDD.max_value + 1; i++) {
            const displayValue = this.convertValueForDisplay(i);
            option = $('<option>').val(displayValue).text(displayValue);
            picklist.append(option);
        }

        // Select the field value
        const disabledDefault = this.required ? 'disabled ' : '';
        option = $(`<option value="" ${disabledDefault}selected></option>`);
        picklist.append(option); // add an empty option
        picklist.val(this.convertValueForDisplay(this.fieldValue));

        this.$el.html(picklist);

        //enable firing 'change' event
        this.$el.on('input', this._changed.bind(this));
    }

    selectItem(ev) {
        const currentlySelected = this.$('li.selected');
        this.$('li.selected').removeClass('selected'); // un-select the previously selected value

        if ($(ev.currentTarget)[0] === currentlySelected[0]) {
            this.selectedValue = ''; // delete the selected value
        } else {
            $(ev.currentTarget).addClass('selected');
            this.selectedValue = $(ev.currentTarget).text(); // store the selected value
        }
        this._changed({});
    }

    getValue() {
        let value;
        if (this.mode === 'expanded') {
            value = this.convertValueString(this.selectedValue);
        } else if (this.mode === 'medium') {
            value = this.convertValueString(this.picklist.val());
        } else {
            value = super.getValue();
        }
        return value === '' ? null : value; //So it can be sent to the server as null value
    }

    convertValueString(valueString, options = {}) {
        //overridden so that rounding  is applied when display unit is diffent from stored unit
        return super.convertValueString(valueString, {
            ...options,
            rounding: true
        });
    }

    validate(value) {
        const missing = value === null || value === '';

        if (this.required && missing) {
            if (this.mode === 'expanded' || this.mode === 'medium')
                return this.msg('select_required');
            else return this.msg('value_required');
        } else if (this.mode === 'compact' && !missing) {
            return this.validateValue(value);
        } else {
            // a null value is always valid for a non-mandatory field
            return true;
        }
    }

    validateValue(value) {
        if (this.control.validity && !this.control.validity.valid) {
            return this.control.validity.message || this.msg('invalid_number');
        }

        //check if the value is an integer (value is already an int because of the input type 'number/tel')
        if (value != parseInt(value, 10)) return this.msg('invalid_integer');

        return super.validateValue(value);
    }
}

export default IntegerFieldEditor;
