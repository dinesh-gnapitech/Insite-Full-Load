// Copyright: IQGeo Limited 2010-2023

import { FormComponent } from './formComponent';
import searchingImg from 'images/searching.gif';

/**
 * @class Button
 * @param  {string} options.text Button label text
 * @param  {function} options.onClick onClick handler
 * @param  {boolean} options.loading Display a loading indicator
 *
 * @example
 * new Button({
 *   text: "Hello World",
 *   onClick: function() {},
 *   loading: true
 * })
 *
 * @extends {FormComponent}
 */
export class Button extends FormComponent {
    static {
        this.prototype.tagName = 'button';

        this.prototype.events = {
            click: '_onClick'
        };
    }

    constructor(options) {
        super(options);
        this.render(options);
    }

    render(options) {
        if (this.options.text) {
            this.$el.html(this.options.text);
        }

        if (this.options.loading) {
            this.$el.html(`<img height="15px"src="${searchingImg}" />`);
        }
        super.render(options);
        return this;
    }

    _onClick(el) {
        const options = this.options;
        if (options.onClick) {
            options.onClick.call({}, this);
        }
    }
}

export default Button;
