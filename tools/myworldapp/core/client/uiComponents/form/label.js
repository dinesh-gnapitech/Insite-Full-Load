// Copyright: IQGeo Limited 2010-2023

import { FormComponent } from './formComponent';

/**
 * UI Component to display a label
 * @class Label
 * @param {string} options.Label label text
 * @param {formComponent} wrap component to wrap the label around
 * @param {boolean} beginWithLabel Whether to display the label before the wrapped component
 *
 * @example
 * new Label({label: "Hello World")
 *
 * @example
 * new Label({label: "Email", wrap: new Input())

 * @extends {FormComponent}
 */
export class Label extends FormComponent {
    static {
        this.prototype.tagName = 'label';
        this.prototype.className = 'ui-label';
    }

    constructor(options) {
        super(options);

        this.component = null;
        this.$el.html(this.options.label);

        if (this.options.wrap) {
            this.component = this.options.wrap.render();
            this.$el[this.options.beginWithLabel ? 'append' : 'prepend'](this.component.$el);
            if (this.options.beginWithLabel) this.component.$el.css('margin-left', '10px');
        }
        return this;
    }

    /**
     *   Does the label wrap a components
     *   @return {boolean}
     */
    hasComponent() {
        return null != this.component;
    }

    /**
     *   Get the component wrapped by the label
     *   @return {FormComponent}
     */
    getComponent() {
        return this.component;
    }
}

export default Label;
