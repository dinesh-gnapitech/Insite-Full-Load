// Copyright: IQGeo Limited 2010-2023
import { Dialog } from 'myWorld/uiComponents/dialog';
import { UserGroupForm } from 'myWorld/controls/userGroups/userGroupForm';

export class UserGroupDetails extends Dialog {
    static {
        this.prototype.id = 'user-group-editor';
        this.prototype.tagName = 'ul';
        this.prototype.className = 'list';

        this.mergeOptions({
            modal: true,
            autoOpen: false,
            minWidth: 490,
            width: 490,
            resizable: true,
            position: { my: 'center', at: 'top+150', of: window },
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

    constructor(options) {
        super(options);

        this.owner = options.owner;
        this.app = this.owner.app;
        this.system = this.owner.system;
        this.groupId = options.groupId;
    }

    render() {
        return this.system.getGroup(this.groupId).then(group => {
            this.group = group;

            this.form = new UserGroupForm({
                owner: this,
                model: group
            });

            this.translate(this.$el);
            this.delegateEvents();

            this.options.contents = this.form.$el;
            this.options.title = group.name;

            delete this.options['groupId'];
            Dialog.prototype.render.call(this);

            return this.form.$el;
        });
    }

    /**
     * Renders the dialog and makes it visible
     */
    open() {
        return this.render().then(() => this.$el.dialog('open'));
    }

    /*
     * Shows the group window.
     */
    show() {
        this.open();
    }

    /**
     * Hides the dialog
     */
    close() {
        this.$el.dialog('destroy');
    }
}

export default UserGroupDetails;
