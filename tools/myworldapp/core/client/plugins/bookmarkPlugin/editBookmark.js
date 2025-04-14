// Copyright: IQGeo Limited 2010-2023

import $ from 'jquery';
import { escape, template } from 'underscore';
import bookmarksHtml from 'text!html/bookmarks.html';
import myw from 'myWorld/base/core';
import { Control } from 'myWorld/base/control';
import { BookmarkForm } from './bookmarkForm';
import bookmarkHomeImg from 'images/bookmark_home.svg';
import bookmarkSharedImg from 'images/bookmark_shared.svg';
import bookmarkBlankImg from 'images/bookmark_blank.png';

const bookmarkDetail = $(bookmarksHtml).filter('#bookmark-detail-template').html();
const bookmarkBrief = $(bookmarksHtml).filter('#bookmark-brief-template').html();
const manageBookmarkActions = $(bookmarksHtml).filter('#manage-bookmark-actions-template').html();

export class ManageBookmarkView extends Control {
    static {
        this.prototype.id = 'bookmark-list-accordion';
        this.prototype.tagName = 'li';
        this.prototype.className = 'bookmark-item';
        this.prototype.bookmarkDetailsTemplate = template(bookmarkDetail);
        this.prototype.bookmarkBriefTemplate = template(bookmarkBrief);
        this.prototype.bookmarkActionsTemplate = template(manageBookmarkActions);

        this.prototype.events = {
            click: 'showEditView',
            'click .bookmark-save': 'validate',
            'click .action_bookmarkZoom': 'zoomToLocation',
            'click .bookmark-delete': 'deleteBookmark',
            'change .bookmarkDetail input, .bookmarkDetail select': 'reactivateLocationButtons'
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.owner = owner;
        this.app = owner.app;
        this.message = owner.owner.message;
        this.system = this.app.system;
        this.canCreateSharedBookmarks = false;
        this.preRender();
    }

    preRender() {
        this.app.userHasPermission('createSharedBookmark').then(hasPerm => {
            this.canCreateSharedBookmarks = hasPerm;
            this.render();
        });
    }

    render() {
        this.$el.prop('id', `bookmark_${this.options.details.id}`);
        this.appendBookmarkDetails(this.options.details);
        this.$('.button').button();
        //Add a message container to the editor
        this.messageContainer = $('<div class="message-container"></div>').appendTo(this.$el);
        this.delegateEvents();
    }

    appendBookmarkDetails(bookmark) {
        let bookmarkImgPath;
        if (bookmark.title.toLowerCase() === 'home') {
            bookmarkImgPath = bookmarkHomeImg;
        } else if (!bookmark.is_private) {
            bookmarkImgPath = bookmarkSharedImg;
        } else {
            bookmarkImgPath = bookmarkBlankImg;
        }

        const isSharedCheckboxState = !bookmark.is_private ? true : false;
        const areLayersIncludedState =
            bookmark.map_display !== '' && bookmark.map_display.split('|')[1] !== '' ? true : false;
        const isBasemapIncludedState =
            bookmark.map_display !== '' && bookmark.map_display.split('|')[0] !== '' ? true : false;

        //if the logged in user has the "createSharedBookmark" permission, only then add the shared checkbox
        const bookmarkBrief = this.bookmarkBriefTemplate({
            dialog: 'manage',
            icon: bookmarkImgPath,
            name: escape(bookmark.title)
        });

        this.form = new BookmarkForm({
            app: this.app,
            map: this.app.map,
            canCreateSharedBookmarks: this.canCreateSharedBookmarks,
            showBookmarkDetail: this.options.showBookmarkDetail,
            model: {
                myw_title: bookmark.title.substring(0, 100),
                lat: bookmark.lat,
                lng: bookmark.lng,
                zoom: bookmark.zoom,
                includeBasemap: isBasemapIncludedState,
                includeLayers: areLayersIncludedState,
                is_private: isSharedCheckboxState
            },
            onZoomRequest: () => {
                this.app.map.useBookmark(this.options.details);
            },
            onCurrentCoordsRequest: form => {
                const center = this.app.map.getCenter();
                form.setValue('lat', center.lat.toFixed(7));
                form.setValue('lng', center.lng.toFixed(7));
                form.setValue('zoom', this.app.map.getZoom());
            },
            onChange: (name, value, form) => {
                this.isCoordValid(form, 'lat');
                this.isCoordValid(form, 'lng');
            }
        });

        const bookmarkActions = this.bookmarkActionsTemplate();
        const editForm = $('<div>', {
            class: 'ui-form edit-form hidden'
        });

        editForm.append(this.form.$el).append(bookmarkActions);
        this.$el.append(bookmarkBrief).append(editForm);
        this.translate(this.$el);
    }

    isCoordValid(form, field) {
        const coord = form.getValue(field);

        if (!coord.match(/^\d+(\.\d+)?$/)) {
            form.getField(field).renderError();
            return false;
        }

        form.getField(field).clearError();
        return true;
    }

    showEditView(event) {
        this.owner.selectedBookmark = this.options.details;
        const prev = this.$el.parent().find('.selectedBookmark');
        prev.removeClass('selectedBookmark');
        prev.find('.listBookmarkName').removeClass('hidden');
        this.$el.find('.listBookmarkName').addClass('hidden');
        prev.find('.edit-form').addClass('hidden');

        this.$el.addClass('selectedBookmark');
        this.$el.find('.edit-form').removeClass('hidden');
        if (this.$el.hasClass('selectedBookmark')) return;

        // Scrolltop animation for touch devices, to prevent the soft keyborad from affecting the visibility of the selected element
        if (myw.isTouchDevice) {
            const container = this.$el.parent().parent(),
                scrollTo = this.$el;
            container.animate(
                {
                    scrollTop:
                        scrollTo.offset().top - container.offset().top + container.scrollTop()
                },
                1000
            );
        }
    }

    deleteBookmark() {
        const bookmarkId = this.options.details.id;
        this.system.deleteBookmark(bookmarkId).then(
            () => {
                this.message(this.messageContainer, this.msg('was_deleted'));
                setTimeout(() => {
                    // display the success message for a second before unselecting the
                    this.$el.remove();
                    if (this.owner.list.children().length === 0) {
                        this.owner.populateWithEmptyMsg();
                    }
                }, 1000);
                // Remove it from the cached bookmarks list
                this.owner.bookmarks = this.owner.bookmarks.filter(
                    bookmark => bookmark !== this.owner.selectedBookmark
                );
                this.owner.owner.bookmarks = this.owner.bookmarks;
                this.owner.selectedBookmark = null;
            },
            () => {
                this.message(this.messageContainer, this.msg('unable_to_delete'), 'error');
            }
        );
    }

    handleReturnKeypress() {
        if (event.which == 13) {
            this.validate();
        }
    }

    validate() {
        const values = this.form.getValues();

        if (!values.myw_title.length) {
            this.message(this.messageContainer, this.msg('enter_name'), 'error');
            return;
        }

        const bookmarkList = this.owner.bookmarks.filter(
            bookmark => bookmark.id !== this.options.details.id
        );

        if (this.owner.owner.existsInList(values.myw_title, bookmarkList)) {
            this.message(
                this.messageContainer,
                this.msg('exists_title', { name: values.myw_title }),
                'error'
            );
            return;
        }

        this.saveBookmark();
    }

    saveBookmark() {
        const bookmarkId = this.options.details.id;

        if (!this.options.showBookmarkDetail) {
            const center = this.app.map.getCenter();
            this.form.setValue('lat', center.lat.toFixed(7));
            this.form.setValue('lng', center.lng.toFixed(7));
            this.form.setValue('zoom', this.app.map.getZoom());
        }
        const values = this.form.getValues();

        this.message(this.messageContainer, this.msg('saving'), 'alert');

        this.system.updateBookmark(bookmarkId, values).then(
            bookmark => {
                this.owner.owner.showSaveFailureDialog();

                this.message(this.messageContainer, this.msg('update_success'));
                setTimeout(() => {
                    // display the success message for a second before unselecting the
                    //highlight the currently saved bookmark and unselect it
                    this.$el.effect('highlight', { color: '#fdf5ce' }, 'slow');
                    this.owner.populateBookmarkList();
                }, 1000);
            },
            () => {
                this.message(this.messageContainer, this.msg('update_failed'), 'error');
            }
        );
    }
}

export default ManageBookmarkView;
