// Copyright: IQGeo Limited 2010-2023

import { BaseComponent } from '../baseComponent';

/**
 * Defines common API for form components.
 *
 * A form component is a UI element for displaying or entering a data value.
 * It provides methods to get and set its data and to display an associated
 * error message. It also provides a data change callback and an optional
 * name (for use when embedded in a {@link Form}).
 *
 * **Controls:**
 * * {@link Label}
 * * {@link Input}
 * * {@link UnitInput}
 * * {@link Textarea}
 * * {@link Checkbox}
 * * {@link Dropdown}
 * * {@link Button}
 * * {@link PrimaryButton}
 *
 * @class FormComponent
 * @param  {function} options.onChange onChange handler
 * @extends BaseComponent
 */
export class FormComponent extends BaseComponent {
    static {
        this.prototype.validParams = [
            'name',
            'value',
            'text',
            'type',
            'inputmode',
            'title',
            'disabled',
            'type',
            'checked',
            'pattern',
            'step',
            'style',
            'placeholder',
            'min',
            'max'
        ];

        this.prototype.events = {
            change: '_onChange'
        };
    }

    constructor(options) {
        super(options);

        for (const param of this.validParams) {
            if (param === 'text' && this.options[param] != null) {
                this.$el.val(this.options[param]);
            }
            this.addAttribute(param, this.options[param]);
        }

        super.render(options);
    }

    /**
     * Set the value of the component
     * @param {mixed} value
     */
    setValue(value) {
        this.$el.val(value);
    }

    /**
     * Get the value of the component
     * @return {string}
     */
    getValue() {
        let val = this.$el.val();
        if (this.options.type == 'number') {
            if (val === null || val === '') return val;
            return isNaN(val) ? undefined : parseFloat(val);
        }
        return val;
    }

    /**
     * Get the name of the component
     * @return {string}
     */
    getName() {
        return this.options.name;
    }

    /**
     * Clear validation erros from the component
     */
    clearError() {
        this.parent.find('.inlineValidation').remove();
        this.$el.removeClass('validationHighlight');
    }

    /**
     * Set a validation error
     * @param {string} message The error message to show
     */
    renderError(message) {
        if (message?.length) {
            this.parent.append(`<div class="inlineValidation">${message}</div>`);
        }

        this.$el.addClass('validationHighlight');
    }

    _onChange() {
        const options = this.options;
        if (options.onChange) {
            options.onChange.call({}, this);
        }
    }
}

export default FormComponent;
