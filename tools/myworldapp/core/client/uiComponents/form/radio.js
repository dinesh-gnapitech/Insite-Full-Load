// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';

import View from 'myWorld/base/view';
import { FormComponent } from './formComponent';

/**
 * @class  RadioGroup
 * @param  {Array<string>} options.options Options to add to the radio group
 * @param  {string} options.selected Selected item identifier
 * @param  {function} options.onChange onChange handler
 
 * @example
 * new RadioGroup(options:['On', 'Off'], selected: 'On'})
 *
 * @extends {FormComponent}
 **/
export class RadioGroup extends FormComponent {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'ui-radiogroup';
        this.prototype.blackListParams = ['onChange'];

        this.prototype.events = {
            'input.change': '_onChange',
            'click label': '_onLabelClick'
        };
    }

    constructor(options) {
        super(options);

        this._inputNodes = {};
        //Populate the options
        this.options.options.forEach(option => {
            const { id, label } = option;
            const spanNode = $('<span />');
            const inputNode = $(`<input type="radio" name="${this.options.name} value="${id}">`);
            this._inputNodes[id] = inputNode;
            if (this.options.selected == id) {
                inputNode.prop('checked', true);
            }
            spanNode.append(inputNode);
            spanNode.append(`<label for="${id}">${label}</label>`);
            this.$el.append(spanNode);
        });

        super.render(options);

        return this;
    }

    _onChange() {
        const options = this.options;
        options.onChange?.call({}, this);
    }

    _onLabelClick(args) {
        args.currentTarget.previousSibling.click();
    }

    setValue(value) {
        this._inputNodes[value].prop('checked', true);
    }

    getValue() {
        return Object.keys(this._inputNodes).find(field => this._inputNodes[field].prop('checked'));
    }
}

View.prototype.componentMapping['radiogroup'] = RadioGroup;

export default RadioGroup;
