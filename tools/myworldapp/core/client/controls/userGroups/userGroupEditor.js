// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Util } from 'myWorld/base';
import { Dialog } from 'myWorld/uiComponents/dialog';
import { UserGroupForm } from 'myWorld/controls/userGroups/userGroupForm';

export class UserGroupEditor extends Dialog {
    static {
        this.prototype.id = 'user-group-editor';
        this.prototype.tagName = 'ul';
        this.prototype.className = 'list';

        this.mergeOptions({
            modal: true,
            autoOpen: true,
            destroyOnClose: true,
            minWidth: 490,
            position: { my: 'center', at: 'top', of: window },
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                },
                Delete: {
                    text: '{:delete}',
                    click() {
                        this.deleteGroup();
                    }
                },
                Update: {
                    text: '{:update}',
                    class: 'primary-btn',
                    click() {
                        this.updateGroup();
                    }
                }
            }
        });
    }

    constructor(options) {
        super(options);

        this.owner = options.owner;
        this.app = this.owner.app;
        this.system = options.system;
        options.model = options.groupId;
    }

    render() {
        return this.system.getGroup(this.options.groupId).then(group => {
            this.group = group;

            this.form = new UserGroupForm({
                owner: this,
                model: group
            });

            this.translate(this.$el);
            this.delegateEvents();

            this.options.contents = this.form.$el;
            this.options.title = `${this.msg('group_editor_title')} ${group.name}`;
            Dialog.prototype.render.call(this);

            return this.form.$el;
        });
    }

    getValues(argument) {
        return this.form.getValues();
    }

    updateGroup() {
        const groupData = this.getValues();
        this.$('.primary-btn').attr('disabled', true);
        //and display an information message
        this.form.displayMessage(this.msg('saving'), 'alert');
        this.system.updateGroup(this.options.groupId, groupData).then(argument => {
            // this.toggleSaveButton(false);
            this.form.displayMessage(this.msg('saved'));
            setTimeout(() => {
                this.owner.populateGroupsList();
                this.close();
            }, 1000);
        });
    }

    deleteGroup() {
        const that = this;
        $(`<div>${this.msg('confirm_delete_message')}</div>`)
            .appendTo('body')
            .dialog({
                modal: true,
                resizable: false,
                title: this.msg('confirm_delete_title'),
                buttons: {
                    Cancel: {
                        text: this.msg('cancel_btn'),
                        click() {
                            $(this).dialog('destroy').remove();
                        }
                    },
                    OK: {
                        text: this.msg('ok_btn'),
                        class: 'primary-btn',
                        click() {
                            $(this).dialog('destroy').remove();
                            that._confirmedDelete();
                        }
                    }
                }
            });
    }

    async _confirmedDelete() {
        await this.system.deleteGroup(this.options.groupId);
        this.form.displayMessage(this.msg('deleted_ok', { title: this.group.name }));
        await Util.delay(1000);
        this.close();
        this.owner.populateGroupsList();
    }
}

export default UserGroupEditor;
