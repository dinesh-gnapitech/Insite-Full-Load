// Copyright: IQGeo Limited 2010-2023

import View from 'myWorld/base/view';

/**
 * Provides a common api for UI Components
 * @class BaseComponent
 * @param  {boolean} options.visible Display the component on render
 * @param  {string} options.cssClass Additional css classes to add to the component
 */
export class BaseComponent extends View {
    static {
        this.prototype.blackListParams = ['onChange', 'onClick'];

        this.mergeOptions({
            visible: true,
            cssClass: ''
        });
    }

    render(options) {
        if (!this.options.visible) {
            return this;
        }

        if (this.options.cssClass) {
            this.$el.addClass(this.options.cssClass);
        }

        if (options?.parent) {
            this.parent = options.parent;
            this.parent.append(this.$el);
        }
        return this;
    }

    /**
     * Add a attribute to an element
     * @param  {string} key  Attribute key
     * @param  {string} value  Attribute value
     */
    addAttribute(key, value) {
        if (value != null && typeof value != 'undefined') {
            this.$el.attr(key, value);
        }
    }
}

export default BaseComponent;
