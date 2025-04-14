// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { sortBy, template } from 'underscore';
import userGroupSelector from 'text!html/userGroupSelector.html';
import { UserGroupsManager } from 'myWorld/controls/userGroups/userGroupsManager';
import { FormComponent } from './formComponent';

/**
 * Input for the sharing field. Shows up as a multilevel menu
 * @name UserGroupSelector
 * @constructor
 * @extends {FormComponent}
 */
export class UserGroupSelector extends FormComponent {
    static {
        this.prototype.template = template(
            $(userGroupSelector).filter('#user-group-selector-template').html()
        );

        this.prototype.events = {
            'click .group-selector-button': 'toggleMenu'
        };
    }

    constructor(options) {
        super(options);
        this.options = options;
        this.isOpen = false;
        this.isSubMenu = typeof options.isSubMenu === 'undefined' ? false : options.isSubMenu;
    }

    render(options) {
        if (!this.isSubMenu) {
            this.$el.html(this.template());
            this.list = $('<ul>', { class: 'group-selector-with-input' }).appendTo('body');

            $(document).on('mousedown', event => {
                const target = $(event.target);
                if (
                    !target.closest('.group-selector-button').length &&
                    !target.closest('.group-selector-with-input').length
                ) {
                    this.hide();
                }
            });
        } else {
            this.setElement($('<ul>', { class: 'group-selector' }).appendTo('body'));
            this.list = this.$el;
        }
        if (options?.parent) {
            this.parent = options.parent;
            this.parent.append(this.$el);
        }
        super.render(options);
        $(window)
            .resize(() => {
                this.positionList();
            })
            .resize();

        this.list.menu().on('menuselect', (event, ui) => {
            this.selectValue(ui.item);
        });

        return this;
    }

    positionList() {
        if (this.list.is(':visible')) return; // Don't reposition when its already being displayed
        const top = this.$el.offset().top + this.$el.height();
        const left = this.$el.offset().left;

        this.list.css({
            top: top,
            left: left,
            'max-height': $(window).height() - top,
            'overflow-y': 'auto',
            'overflow-x': 'hidden'
        });
    }

    populateOptions() {
        return this.options.system.getGroupsIds().then(groupIds => {
            const groups = this._processGroupIds(groupIds);

            this.list.empty();
            let listItem;

            groups.forEach(group => {
                listItem = $('<li>')
                    .attr('data', group.group)
                    .append($('<div>', { text: group.name }));
                this.list.append(listItem);
            });

            const manageGroupsBtn = $('<li>', { role: 'no-select', class: 'edit-btn' }).append(
                $('<div>', { text: this.msg('edit_btn_title') })
            );

            this.list.append(manageGroupsBtn);

            this.list.menu('refresh');
            this.translate(this.$el);

            return this.$el;
        });
    }

    toggleMenu() {
        if (this.$el.attr('disabled') === 'disabled') return;

        if (this.isOpen) {
            this.hide();
        } else {
            this.populateOptions().then(() => {
                this.positionList();
                this.list.show();
                this.isOpen = true;
            });
        }
    }

    hide() {
        this.list.hide();
        this.isOpen = false;
    }

    /*
     * Creates a group object for each groupId
     */
    _processGroupIds(groupIds) {
        const groups = groupIds.map(group => {
            const [owner, name] = group.split(':');
            return {
                owner,
                name,
                group
            };
        });

        //Add the owner in brackets to the group names that are ambiguous
        const refactoredGroups = groups.map(group => {
            let name;
            if (groups.filter(g => g.name === group.name).length > 1) {
                name = `${group.name} (${group.owner})`;
            } else {
                name = group.name;
            }

            return { ...group, name };
        });

        return sortBy(refactoredGroups, group => group.name.toLowerCase());
    }

    selectValue(item) {
        if (item.attr('role') !== 'no-select') {
            const displayVal = item.text().trim();
            this.$('input').val(displayVal);

            this.selectedOption = item.attr('data') === undefined ? displayVal : item.attr('data');
        } else if (item.hasClass('edit-btn')) {
            this.showManageDialog();
        }
        if (!this.isSubMenu) this.toggleMenu();
    }

    setValue(value) {
        this.selectedOption = value;
        const displayVal = value.split(':')[1];
        this.$('input').val(displayVal);
    }

    getValue() {
        return this.selectedOption;
    }

    /*
     * Shows the bookmark window.
     */
    showManageDialog() {
        new UserGroupsManager({ app: this.options.app, system: this.options.system });
    }
}

export default UserGroupSelector;
