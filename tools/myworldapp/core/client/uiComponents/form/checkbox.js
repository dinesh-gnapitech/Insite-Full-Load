// Copyright: IQGeo Limited 2010-2023

import View from 'myWorld/base/view';
import { FormComponent } from './formComponent';

/**
 * @class Checkbox
 * @param {string} class            Default css class
 * @param {boolean} indeterminate   Enable indeterminate display mode
 * @param {boolean} value           Default value
 * @param {function} onChange       Callback fired when checkbox changed
 *
 *
 * @example
 * new Checkbox({
 *   indeterminate: true,
 *   value: true,
 *   onChange: function() {}
 * })
 *
 * @extends {FormComponent}
 */
export class Checkbox extends FormComponent {
    static {
        this.prototype.tagName = 'input';
        this.prototype.className = 'ui-checkbox';

        this.mergeOptions({
            type: 'checkbox',
            indeterminate: false,
            mandatory: false
        });
    }

    constructor(options) {
        super(options);
        this.initUi();

        this.$el.one('click', () => {
            if (this.options.value === null) this.setValue(true);
        });

        return this;
    }

    initUi() {
        const options = this.options;
        if (options.indeterminate && options.value === null) {
            this.$el.prop('indeterminate', true).prop('checked', false);
            return;
        }
        this.$el.prop('indeterminate', false).prop('checked', options.value);
    }

    /**
     * Checks the checkbox if the value is True, if not, unchecks it
     * @param {boolean} value   Whether to check or uncheck the checkbox
     */
    setValue(value) {
        this.options.value = value;
        this.initUi();
    }

    /**
     * Returns True if the checkbox is checked, else False
     * @return {boolean}
     */
    getValue() {
        return this.options.value;
    }

    _onChange() {
        const options = this.options;
        if (
            options.indeterminate &&
            !options.mandatory &&
            this.$el.prop('checked') === true &&
            options.value === false
        ) {
            this.setValue(null);
        } else {
            const value = this.$el.prop('checked');
            this.setValue(value);
        }
        super._onChange();
    }
}

View.prototype.componentMapping['checkbox'] = Checkbox;

export default Checkbox;
