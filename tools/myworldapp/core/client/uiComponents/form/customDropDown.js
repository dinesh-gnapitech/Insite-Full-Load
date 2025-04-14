// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';

import customDropDownHtml from 'text!html/customDropDown.html';
import { FormComponent } from './formComponent';

/**
 * Custom select box which can be extended to make it multilevel
 * The items for the select box are
 * @name CustomDropDown
 * @constructor
 * @extends {FormComponent}
 */
export class CustomDropDown extends FormComponent {
    static {
        this.prototype.template = template(
            $(customDropDownHtml).filter('#custom-enum-field-template').html()
        );
        this.prototype.listTemplate = template(
            $(customDropDownHtml).filter('#custom-enum-list-template').html()
        );

        this.prototype.events = {
            'click .custom-dropdown-button': 'toggleMenu'
        };
    }

    constructor(options) {
        super(options);
        this.options = options;
        this.isOpen = false;
        this.render();
    }

    render() {
        const defaultSelection = this.options.args ? this.options.args.defaultSelection : null;
        const fieldVal = this.getDisplayValue(this.options.value) || defaultSelection || '';

        this.$el.html(this.template({ selectedOption: fieldVal }));

        this.list = $(this.listTemplate({ options: this.options.options })).menu();

        $('body').append(this.list);
        super.render(this.options);
        this.list.on('menuselect', (event, ui) => {
            this.setValue(ui.item);
        });

        $(document).on('mousedown', event => {
            if (
                !$(event.target).closest('.custom-dropdown-button').length &&
                !$(event.target).closest('.custom-enum-list').length
            ) {
                this.list.hide();
                this.isOpen = false;
            }
        });

        return this.$el; //Since the ui-dropdowns are hidden by default by the bootstrap css
    }

    getDisplayValue(val) {
        return val;
    }

    positionList() {
        const top = this.$el.offset().top + this.$el.height();
        const left = this.$el.offset().left;

        this.list.css({ top: top, left: left });
    }

    /*
     * Opens/Closes the menu
     */
    toggleMenu() {
        if (!this.isOpen) this.positionList();
        this.list[this.isOpen ? 'hide' : 'show']();
        this.isOpen = !this.isOpen;
    }

    setValue(item) {
        if (item.attr('role') !== 'no-select') {
            const selectedText = item.text().trim();
            this.selectedOption = this._setSelectedOptionFromItem(item);

            this.$('input').val(selectedText);
            this.list.hide();
            this.isOpen = false;
        }
    }

    _setSelectedOptionFromItem(item) {
        return item.text().trim();
    }

    getValue() {
        return this.$('input').val().trim();
    }
}

export default CustomDropDown;
