// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldEditor } from './fieldEditor';
import { UserGroupSelector, CustomDropDown } from 'myWorld/uiComponents';

/**
 * Input for the sharing field. Shows up as a multilevel menu
 * @name SharingFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class SharingFieldEditor extends FieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.options = options;
        this.isOpen = false;

        this.control = new SharingDropDown({
            system: this.app.system,
            options: this.fieldDD.enumValues,
            value: this.fieldValue
        });
        this.setElement(this.control.$el);

        const subMenuIcon = $('<span>', { class: 'ui-menu-icon ui-icon ui-icon-caret-1-e' });

        this.control.list
            .find("li[name='group']")
            .attr('role', 'no-select')
            .addClass('group-option')
            .children('div')
            .append(subMenuIcon); //jquery-ui menu doesnt add this icon for some reason
    }
}

export class SharingDropDown extends CustomDropDown {
    getDisplayValue(val) {
        if (val?.split(':').length > 1) return val.split(':')[1];
        else return val;
    }

    _setSelectedOptionFromItem(item) {
        const selectedText = item.text().trim();
        return item.attr('data') === undefined ? selectedText : item.attr('data');
    }

    getValue() {
        const defaultSelection = this.options.args ? this.options.args.defaultSelection : null;
        return this.selectedOption || this.options.value || defaultSelection;
    }

    toggleMenu() {
        super.toggleMenu();
        if (this.isOpen) this._updateGroupSelector();
    }

    _updateGroupSelector() {
        if (!this.groupSelector) {
            this.groupSelector = new UserGroupSelector({
                system: this.options.system,
                isSubMenu: true
            });
            this.groupSelector.render();
        }

        this.groupSelector.populateOptions().then(gpSelect => {
            //Add the group selector as a sub menu for the group option
            this.list.find("li[name='group']").append(gpSelect.hide());
        });
    }
}

export default SharingFieldEditor;
