// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { sortBy, template } from 'underscore';
import Backbone from 'backbone';
import myw from 'myWorld-base';
import userGroupsHtml from 'text!html/userGroups.html';
import Dialog from 'myWorld/uiComponents/dialog';
import { UserGroupDetails } from './userGroupDetails';
import { UserGroupEditor } from './userGroupEditor';
import { CreateUserGroupDialog } from './createUserGroupDialog';

export class UserGroupsManager extends Dialog {
    static {
        this.prototype.id = 'user-groups-manager';
        this.prototype.className = 'list';

        this.mergeOptions({
            modal: true,
            autoOpen: true,
            destroyOnClose: true,
            minWidth: 400,
            width: 400,
            resizable: true,
            position: { my: 'center', at: 'top', of: window },
            title: '{:manage_title}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });
    }

    /**
     * @class Creates a list of all the groups the user has access to and puts it in a dialog
     * @param  {System}  system
     * @constructs
     */
    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.system = options.system;
    }

    setHeight() {
        this.$el.css({
            'max-height': $(window).height() - 110,
            'overflow-y': 'auto',
            'overflow-x': 'hidden'
        });
    }

    async render() {
        const hasPerm = await this.system.userHasPermission('editGroups');
        if (hasPerm) {
            this.options.buttons['Add'] = {
                text: '{:add_new}',
                class: 'primary-btn',
                click: () => {
                    this.showCreateDialog();
                }
            };
        }
        await this.populateGroupsList();
        super.render();

        // Resize the groups list on window resize
        $(window)
            .resize(() => {
                this.setHeight();
            })
            .resize();
    }

    /*
     * Populates the list of groups (with its members) accessible to the user
     */
    async populateGroupsList() {
        this.$el.empty();
        const groups = await this.getGroupsDetails();
        if (groups.length === 0) {
            this.populateWithEmptyMsg();
        } else {
            const refactoredGroups = this._processGroups(groups);
            //Sort the groups list alphabetically
            const sortedGroups = sortBy(refactoredGroups, group => group.name.toLowerCase());

            sortedGroups.forEach(group => this.addItemToList(group));
        }
        this.delegateEvents();
        return;
    }

    /**
     * Gets the details for each group from the database
     * @return {Array<Promise>}
     */
    async getGroupsDetails() {
        const groupIds = await this.system.getGroupsIds();
        const groups = groupIds.map(groupId => {
            return this.system.getGroup(groupId);
        });
        return Promise.all(groups);
    }

    /**
     * For groups with conflicting group names, adds the owner in brackets with the group name
     * @param {Array<object>}  groups
     * @return {Array<object>}
     */
    _processGroups(groups) {
        //Add the owner in brackets to the group names that are ambiguous
        const refactoredGroups = groups.map(group => {
            let displayName;
            if (groups.filter(g => g.name === group.name).length > 1) {
                displayName = `${group.name} (${group.owner})`;
            } else {
                displayName = group.name;
            }

            return { ...group, display_name: displayName };
        });

        return refactoredGroups;
    }

    /*
     * Adds a message to the dialog indicating that there are no accessible groups
     */
    populateWithEmptyMsg() {
        this.$el.html($('<div>', { text: this.msg('no_saved'), class: 'group-manager-msg' }));
    }

    /**
     * Creates a groupRow and adds it to the list
     */
    addItemToList(item) {
        const groupRow = new GroupRow({ owner: this, groupObj: item });
        this.$el.append(groupRow.render());
    }

    /**
     * Shows the create group dialog
     */
    showCreateDialog() {
        new CreateUserGroupDialog({ owner: this });
    }
}

const groupRowHtml = $(userGroupsHtml).filter('#group-manager-row-template').html();

class GroupRow extends Backbone.View {
    static {
        this.prototype.className = 'group-manager-row';
        this.prototype.messageGroup = 'UserGroupsManager';

        this.prototype.events = {
            click: 'openGroupEditor'
        };

        this.prototype.template = template(groupRowHtml);
    }

    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.group = options.groupObj;
    }

    render() {
        const members = Object.keys(this.group.members).join(', ');
        this.groupId = `${this.group.owner}:${this.group.name}`;
        this.$el.html(
            this.template({
                groupId: this.groupId,
                name: this.group.display_name,
                members
            })
        );
        return this.$el;
    }

    openGroupEditor() {
        //Check if the user should see an editor or just group details
        this.owner.app.userHasPermission('editGroups').then(hasPerm => {
            const canEdit =
                this.group.members[myw.currentUser.username] === true ||
                this.group.owner === myw.currentUser.username;
            if (hasPerm && canEdit) {
                new UserGroupEditor({
                    owner: this.owner,
                    system: this.owner.system,
                    groupId: this.groupId
                });
            } else {
                const groupDetails = new UserGroupDetails({
                    owner: this.owner,
                    groupId: this.groupId
                });
                groupDetails.show();
            }
        });
    }
}

export default UserGroupsManager;
