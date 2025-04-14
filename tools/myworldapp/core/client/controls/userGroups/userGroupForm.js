// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import myw, { msg as mywMsg } from 'myWorld-base';
import userGroupsHtml from 'text!html/userGroups.html';
import { Form, Input, Textarea, Label } from 'myWorld/uiComponents';
import { DisplayMessage } from '../displayMessage';

const editorHtml = $(userGroupsHtml).filter('#user-group-editor-template').html();
const actionsHtml = $(userGroupsHtml).filter('#group-editor-actions-template').html();
const msgGroup = 'UserGroupEditor';
const msg = mywMsg(msgGroup);
export class UserGroupForm extends Form {
    static {
        this.prototype.messageGroup = msgGroup;
        this.prototype.className = 'user-group-editor ui-form';

        this.prototype.events = {
            'click .add-member-btn': 'addMemberToGroup'
        };

        this.prototype.actionsTemplate = template(actionsHtml);
        this.prototype.editorTemplate = template(editorHtml);
    }

    constructor(options) {
        const schema = {
            messageGroup: 'UserGroupEditor',
            onChange: options.onChange
        };

        if (options.isNew) {
            schema.rows = [
                {
                    components: [
                        new Input({
                            name: 'name',
                            cssClass: 'full-width',
                            placeholder: msg('name'),
                            value: options.model.name || ''
                        })
                    ]
                },
                {
                    components: [
                        new Label({
                            label: '<strong>{:description}:</strong>'
                        }),
                        new Textarea({
                            name: 'description',
                            cssClass: 'full-width',
                            value: options.model.description || ''
                        })
                    ]
                }
            ];
        } else {
            schema.rows = [
                {
                    components: [
                        new Label({
                            label: `<strong>{:owner}:</strong> ${options.model.owner}`
                        })
                    ]
                },
                {
                    components: [
                        new Label({
                            label: '<strong>{:description}:</strong>'
                        }),
                        new Textarea({
                            name: 'description',
                            cssClass: 'full-width',
                            value: options.model.description || ''
                        })
                    ]
                }
            ];
        }
        super({ ...schema, ...options });
    }

    render() {
        super.render();
        if (!this.memberViews) this.memberViews = [];

        this.$el.append(this.editorTemplate({ userHasEditPerm: true }));
        if (!this.options.isNew) {
            Object.entries(this.options.model.members).forEach(([member, isManager]) => {
                const memberView = new GroupMember({
                    owner: this,
                    isManager,
                    name: member,
                    placeholder: this.msg('member_username')
                });
                this.memberViews.push(memberView);
                this.$('.members-list').append(memberView.$el);
            });
        }
    }

    getValues() {
        const groupData = super.getValues();
        const members = this.getMembersList();

        return Object.assign(groupData, {
            members: members,
            owner:
                typeof this.options === 'undefined'
                    ? myw.currentUser.username
                    : this.options.model.owner
        });
    }

    getMembersList() {
        const members = {};

        this.memberViews.forEach(memberView => {
            const memberVal = memberView.getValue();
            if (memberVal) Object.assign(members, memberVal);
        });
        return members;
    }

    addMemberToGroup() {
        const newRow = new GroupMember({
            owner: this,
            isManager: false,
            name: null,
            placeholder: this.msg('member_username')
        });
        this.memberViews.push(newRow);
        this.$('.members-list').append(newRow.$el);
    }

    displayMessage(message, type) {
        new DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }
}

const groupMemberHtml = $(userGroupsHtml).filter('#group-member-template').html();

class GroupMember extends Backbone.View {
    static {
        this.prototype.tagName = 'li';
        this.prototype.messageGroup = 'UserGroupEditor';

        this.prototype.events = {
            'click .remove-btn': 'removeFromGroup',
            'click .manager-btn': 'toggleManager'
        };

        this.prototype.template = template(groupMemberHtml);
    }

    constructor(options) {
        super(options);
        this.options = options;
        this.msg = options.owner.msg;
        this.isManager = this.options.isManager;
        this.render();
    }

    render() {
        this.$el.html(this.template(this.options));
    }

    toggleManager() {
        this.isManager = !this.isManager;
        this.$('.manager-btn').toggleClass('active', this.isManager);
    }

    removeFromGroup() {
        this.$el.remove();
        this.options.owner.memberViews = this.options.owner.memberViews.filter(
            view => view !== this
        );
    }

    getValue() {
        const memberName = this.$('input').val().trim();
        return memberName
            ? {
                  [memberName]: this.isManager
              }
            : null;
    }
}

export default UserGroupForm;
