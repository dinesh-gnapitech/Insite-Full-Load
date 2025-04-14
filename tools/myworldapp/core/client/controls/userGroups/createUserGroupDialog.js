// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-base';
import { Dialog } from 'myWorld/uiComponents/dialog';
import UserGroupForm from './userGroupForm';

export class CreateUserGroupDialog extends Dialog {
    static {
        this.prototype.className = 'create-user-group-form';

        this.mergeOptions({
            modal: true,
            autoOpen: true,
            destroyOnClose: true,
            minWidth: 490,
            position: { my: 'center', at: 'top', of: window },
            title: '{:create_title}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                },
                Save: {
                    text: '{:save}',
                    class: 'primary-btn',
                    click() {
                        this.saveGroup();
                    }
                }
            }
        });
    }

    constructor(options) {
        super(options);

        this.owner = options.owner;
        this.system = this.owner.system;
    }

    /**
     * Creates the dialog according to the instance options and applies localisation
     */
    render() {
        this.form = new UserGroupForm({
            model: {},
            isNew: true
        });
        this.options.contents = this.form.$el;
        super.render();

        // Resize the form on window resize
        $(window)
            .resize(() => {
                this.$el.css({
                    'max-height': $(window).height() - 110,
                    'overflow-y': 'auto',
                    'overflow-x': 'hidden'
                });
            })
            .resize();
    }

    saveGroup() {
        const groupData = this.form.getValues();
        this.validate(groupData).then(validationObj => {
            if (validationObj.isValid) {
                this.form.displayMessage(this.msg('saving'), 'alert');
                this.system.saveGroup(groupData).then(argument => {
                    setTimeout(() => {
                        this.form.displayMessage(this.msg('saved'));
                        this.owner.populateGroupsList();
                        this.close();
                    }, 1000);
                });
            }
        });
    }

    validate(data) {
        this.removeValidationHighlight();
        let isValid = false;
        const name = data.name;

        return this.system.getGroupsIds(true).then(existingGroupIds => {
            let message = '';
            const groupIdExists = existingGroupIds.find(
                groupId => `${myw.currentUser.username}:${name}` == groupId
            );

            if (name.trim().length === 0) message = this.msg('blank_internal_name');
            else if (!this._isValidName(name)) message = this.msg('invalid_group_name');
            else if (groupIdExists) message = this.msg('group_name_exists', { name: name });
            else isValid = true;

            if (!isValid) {
                this.$("input[name='name']").addClass('validationHighlight');
                this.form.displayMessage(message, 'error');
            }
            return { isValid: isValid, msg: message };
        });
    }

    /**
     * Validates the name to make sure it doesn't have : and /
     * @param  {string}  name Name to validate
     * @return {Boolean}      True if the name only has permitted characters.
     */
    _isValidName(name) {
        const reg = /[:/]/;
        return !reg.test(name);
    }

    /**
     * Remove validation errors if any
     */
    removeValidationHighlight() {
        this.$el.find('.validationHighlight').removeClass('validationHighlight');
    }
}

export default CreateUserGroupDialog;
