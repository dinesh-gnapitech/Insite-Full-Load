// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';
import { FormComponent } from './formComponent';

/**
 * @class  Input
 * @param  {string}   options.value       input value
 * @param  {string}   options.placeholder Text to show in the box when there is no value
 * @param  {function} options.onChange    callback fired onChange
 * @param  {function} options.onKeyUp     callback fired onKeyUp
 *
 * @example
 *     new Input({value: "Hello World", onChange: function() {} })
 *
 * @extends {FormComponent}
 */
export class Input extends FormComponent {
    static {
        this.prototype.tagName = 'input';
        this.prototype.className = 'text ui-input';

        this.prototype.events = {
            keyup: '_onKeyUp',
            change: '_onChange'
        };
    }

    constructor(options) {
        super(options);
        if (this.options.placeholder) {
            this.$el.attr('placeholder', this.options.placeholder);
        }
    }

    _onKeyUp() {
        const options = this.options;
        if (options.onKeyUp) {
            options.onKeyUp.call({}, this);
        }
    }
}

View.prototype.componentMapping['input'] = Input;

export default Input;
