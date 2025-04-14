// Copyright: IQGeo Limited 2010-2023

import { FormComponent } from './formComponent';
import View from 'myWorld/base/view';

/**
 * @class  Textarea
 * @param  {string} options.value input value
 * @param  {function} options.onChange callback fired onKeyUp and Blur
 *
 * @example
 *     new Textarea({value: "Hello World", onChange: function() {} })
 *
 * @extends {FormComponent}
 */
export class Textarea extends FormComponent {
    static {
        this.prototype.tagName = 'textarea';
        this.prototype.className = 'text ui-input';
    }

    constructor(options) {
        super(options);
        this.initUi();
        return this;
    }

    initUi() {
        if (this.options.value) this.$el.text(this.options.value);
    }
}

View.prototype.componentMapping['textarea'] = Textarea;
export default Textarea;
