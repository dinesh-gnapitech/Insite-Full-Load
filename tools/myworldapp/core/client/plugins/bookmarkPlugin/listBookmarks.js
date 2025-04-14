// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { sortBy } from 'underscore';
import { Dialog } from 'myWorld/uiComponents/dialog';
import { ManageBookmarkView } from './editBookmark';

export class ManageBookmarksDialog extends Dialog {
    static {
        this.prototype.id = 'bookmark-list-accordion';
        this.prototype.tagName = 'ul';
        this.prototype.className = 'list';

        this.mergeOptions({
            modal: true,
            autoOpen: false,
            minWidth: 490,
            position: { my: 'center', at: 'top+150', of: window },
            title: '{:manage_title}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                },
                Back: {
                    text: '{:back_btn}',
                    click() {
                        this.close();
                        this.owner.showCreateDialog();
                    }
                }
            }
        });
    }

    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.app = this.owner.app;
        this.system = this.app.system;
        this.bookmarkViews = [];
    }

    render() {
        super.render();
        myw.softKeyboardInput.enableOn(this.$el, this.app);
    }

    /*
     * Shows the bookmark window.
     */
    show() {
        this.populateBookmarkList();
        this.open();
    }

    /*
     * Populates the list of bookmarks accessible to the user
     */
    populateBookmarkList() {
        this.list = this.$el;
        this.list.empty();

        this.system.getBookmarksForUser().then(bookmarks => {
            this.list.empty();
            if (bookmarks.length === 0) {
                this.populateWithEmptyMsg();
            } else {
                //Sort the bookmarks list alphabetically and assign it to this.bookmarks
                this.bookmarks = this.owner.bookmarks = sortBy(bookmarks, bookmark =>
                    bookmark.title.toLowerCase()
                );

                this.bookmarks.forEach(bm => this.addBookmarkToList(bm));
            }
        });
        this.delegateEvents();
    }

    /*
     * Adds a message to the dialog indicating that there are no saved bookmarks.
     */
    populateWithEmptyMsg() {
        this.list.html(this.msg('no_saved'));
    }

    addBookmarkToList(bookmark) {
        const bookmarkView = new ManageBookmarkView(this, {
            details: bookmark,
            showBookmarkDetail: this.options.showBookmarkDetail
        });
        this.bookmarkViews.push(bookmarkView);
        this.list.append(bookmarkView.el);
    }
}

export default ManageBookmarksDialog;
