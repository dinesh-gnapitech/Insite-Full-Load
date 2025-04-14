// Copyright: IQGeo Limited 2010-2023

import { Plugin } from 'myWorld/base/plugin';
import { PluginButton } from 'myWorld/base/pluginButton';
import { CreateBookmarkDialog } from './createBookmark';
import { ManageBookmarksDialog } from './listBookmarks';
import { DisplayMessage } from 'myWorld/controls/displayMessage';
import bookmarkImg from 'images/toolbar/bookmark.svg';

export class BookmarksPlugin extends Plugin {
    static {
        this.mergeOptions({
            showBookmarkDetail: true
        });
    }

    /**
     * @class Provides bookmark functionality <br/>
     * Adds a button to the toolbar to access a dialog which allows the user to save or manage bookmarks
     * @param  {Application} owner                       The application
     * @param  {object}          options
     * @param  {boolean}         options.showBookmarkDetail  Whether to show the individual bookmark details in the dialog or not
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.plugin_name = 'bookmark';
    }

    /**
     * Shows the bookmark window.
     */
    showCreateDialog() {
        if (!this.addDialog) {
            this.addDialog = new CreateBookmarkDialog(this, {
                showBookmarkDetail: this.options.showBookmarkDetail
            });
        }
        this.addDialog.show();
    }

    /**
     * Shows the bookmark window.
     */
    showManageDialog() {
        if (!this.manageDialog) {
            this.manageDialog = new ManageBookmarksDialog({
                owner: this,
                showBookmarkDetail: this.options.showBookmarkDetail
            });
            this.manageDialog.render();
        }
        this.manageDialog.show();
    }

    /**
     * Checks to see if the bookmark name has previously been used
     * @param  {string} name  Name entered for the bookmark
     * @param  {Array}  list  List of the user's bookmarks
     * @return {object}       A bookmark with the same name (if any), else returns 'null'
     */
    existsInList(name, list) {
        return list.find(bookmark => bookmark.title.toLowerCase() === name.toLowerCase());
    }

    showSaveFailureDialog() {
        this.message(this.msg('update_failed'), 'error');
    }

    message(messageContainer, message, type) {
        new DisplayMessage({ el: messageContainer, type: type, message: message });
    }
}

BookmarksPlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-bookmarks';
            this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
            this.prototype.imgSrc = bookmarkImg;
        }

        action() {
            this.app.recordFunctionalityAccess('core.toolbar.bookmark');
            this.owner.showCreateDialog();
        }
    }
};

export default BookmarksPlugin;
