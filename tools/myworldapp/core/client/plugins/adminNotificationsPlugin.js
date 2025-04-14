// Copyright: IQGeo Limited 2010-2023
import { template } from 'underscore';
import $ from 'jquery';
import myw, { Plugin, Util } from 'myWorld-base';
import Backbone from 'backbone';
import adminNotificationHtml from 'text!html/adminNotifications.html';
import filterXSS from 'xss';
import { Dialog } from 'myWorld/uiComponents/dialog';

/*
 */
export class AdminNotificationsPlugin extends Plugin {
    static {
        this.prototype.statePerApp = false;

        this.mergeOptions({
            lastReadId: 0,
            lastReadLocalId: 0,
            localNotifications: [],
            autoCheckInterval: null // interval (in hours) between checking for notifications. A value of null or 0 means no automatic checking for notifications.
        });
    }

    /**
     * @class Displays the notifications created by the admin
     *        New notifications show up when the application is refreshed
     *        All existing notification can be accessed by clicking on the notifications launcher icon in the footer
     * @param {Application}            owner    The application
     * @param {adminNotificationsOptions}  options
     * @extends Plugin
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);
        if (owner.options.layoutName === 'print') return;

        this.owner = owner;
        this.system = this.app.system;

        this.lastReadId = this.options.lastReadId || 0; //Tracks the last Id of the notifications a user has read
        this.lastReadLocalId = this.options.lastReadLocalId || 0;
        this.localNotifications = this.options.localNotifications || [];

        this.app.on('local-notification', this.createLocalNotification.bind(this));

        this.startCheckingForNotifications(true);
    }

    /**
     * Gets the unread notifications and displays them in a dialog
     */
    showNewNotifications() {
        let preChecks = Promise.resolve();
        const ds = this.app.getDatasource('myworld');
        if (myw.isNativeApp) {
            preChecks = ds.masterDs.ensureLoggedIn();
        }

        return preChecks
            .then(() =>
                Promise.all([
                    this.system.getAdminNotifications(this.lastReadId),
                    this.getLocalNotifications(this.lastReadLocalId)
                ])
            )
            .then(unreadNotifications => {
                const [adminNotifications, localNotifications] = unreadNotifications;
                if (adminNotifications.length > 0 || localNotifications.length > 0)
                    this.displayNotifications(adminNotifications, false, localNotifications);
                const disableStatusBarIcon =
                    adminNotifications.length === 0 && localNotifications.length === 0;
                this.updateStatusBarIcon(disableStatusBarIcon);
            })
            .catch(() => {
                //try again when ds status changes
                ds.once('changed', this.showNewNotifications.bind(this));
            });
    }

    /**
     * Updates the status bar icon by firing a notifyUser event
     * @param  {boolean} disable  If true, shows the status bar icon as grey, otherwise orange
     */
    updateStatusBarIcon(disable) {
        this.app.ready.then(() => {
            const iconClassAddOn = disable ? ' no-notifications' : '';
            this.app.notifyUser({
                plugin: this,
                icon: $('<span>', { class: `admin-notifications-launcher${iconClassAddOn}` }),
                onClick: this.launchNotifications.bind(this)
            });
        });
    }

    /**
     * Asks the system for all notifications and displays them in a dialog
     */
    launchNotifications() {
        Promise.all([this.system.getAdminNotifications(), this.getLocalNotifications()]).then(
            notifications => {
                let [adminNotifications, localNotifications] = notifications;
                let allRead = true;
                //Mark the notifications as read or unread
                adminNotifications = adminNotifications.map(notification => {
                    notification['isUnread'] = notification.id > this.lastReadId;
                    if (notification.id > this.lastReadId) allRead = false; //set allRead flag if there are unread notifications
                    return notification;
                });

                localNotifications = localNotifications.map(notification => {
                    notification['isUnread'] = notification.id > this.lastReadLocalId;
                    if (notification.id > this.lastReadLocalId) allRead = false; //set allRead flag if there are unread notifications
                    return notification;
                });

                this.displayNotifications(adminNotifications, allRead, localNotifications);
            }
        );
    }

    /**
     * Fetches the list of local notifications
     * @param {number}sinceId  Fetches notifications where the ID is higher than or equal to this value
     */
    getLocalNotifications(sinceId) {
        sinceId = sinceId || 0;
        return this.options.localNotifications.slice(sinceId);
    }

    /**
     * Creates a local notification and shows the notifications box
     * @param {object} notification  Properties for the dialog box. Matches the fields in the database table, except for type, which should be named notification_type
     */
    createLocalNotification(notification) {
        this.options.localNotifications.push({
            created: new Date().toISOString(),
            details: notification.details,
            for_native_app: notification.for_native_app || true,
            for_online_app: notification.for_online_app || true,
            id: this.options.localNotifications.length + 1,
            subject: notification.subject,
            type: notification.notification_type || 'info'
        });
        this.showNewNotifications();
    }

    /**
     * Displays the unread notifications dialog
     * @param  {Array}  adminNotifications  Notifications to show in the dialog
     */
    displayNotifications(adminNotifications, allRead, localNotifications) {
        this.adminNotifications = adminNotifications;

        const notificationsList = this._createNotificationsListFor(
            adminNotifications,
            localNotifications
        );
        if (!this.dialog) {
            this.dialog = new AdminNotificationsDialog({
                owner: this,
                contents: notificationsList
            });
        } else {
            this.dialog.setContent(notificationsList);
            this.dialog.open();
        }

        //If no new notifications change dismiss button to close, and remove 'read later' button
        if (allRead) {
            $('.notifications-btn-left').remove();
            $('.notifications-btn-right').text(this.msg('close'));
        }
    }

    /*
     * Creates a list of notification views for the notfications supplied.
     * @param  {Array} notifications Notifications to be dislayed in the dialog
     * @return {jQueryElement}
     * @private
     */
    _createNotificationsListFor(adminNotifications, localNotifications) {
        const dialogContent = $('<div>', { class: 'admin-notification-container' });

        const notifications = adminNotifications
            .concat(localNotifications)
            .sort(notification => notification.created);
        //Creates a row for each notifictaion in the list
        notifications.forEach(notification => {
            const notificationRowView = new AdminNotificationView({
                notification: notification
            });
            dialogContent.append(notificationRowView.$el);
        });

        if (notifications.length === 0) {
            dialogContent.html(
                `<div class="admin-notification-row">${this.msg('no_notifications')}</div>`
            );
        }

        return dialogContent;
    }

    /**
     * Starts checking for updates on the interval specified in options
     * If an interval was not specified it does nothing
     * @param  {boolean} immediate Whether to do an immediate check or only after the elapsed time
     */
    startCheckingForNotifications(immediate) {
        this._timer = Util.timer({
            immediate: immediate || false,
            repeat: !!this.options.autoCheckInterval,
            interval: this.options.autoCheckInterval * 60 * 60 * 1000,
            handler: this.showNewNotifications.bind(this),
            logErrors: false
        });
    }

    stopShowingNotifications() {
        this._timer.stop();
    }

    /*
     * When a user dismisses the notifications
     * This method records the last notification index in the owner's lastReadId property and lastReadLocalId property
     * This index is then used to make sure that the user does not see the same notifications again on system refresh
     */
    dismissNotifications() {
        if (this.adminNotifications.length) {
            const notifications = this.adminNotifications;
            const maxId = notifications[notifications.length - 1].id;
            this.lastReadId = maxId;
        }
        if (this.options.localNotifications.length) {
            const notifications = this.options.localNotifications;
            const maxId = notifications[notifications.length - 1].id;
            this.lastReadLocalId = maxId;
        }
        this.updateStatusBarIcon(true);
    }

    /**
     * Called when application closes
     * @return {object}
     */
    getState() {
        return {
            lastReadId: this.lastReadId,
            lastReadLocalId: this.lastReadLocalId,
            localNotifications: this.options.localNotifications
        };
    }
}

export class AdminNotificationsDialog extends Dialog {
    static {
        this.mergeOptions({
            title: '{:notifications}',
            width: 700,
            buttons: {
                ReadLater: {
                    text: '{:read_later}',
                    class: 'notifications-btn-left',
                    click() {
                        this.$el.empty();
                        this.close();
                    }
                },
                Dismiss: {
                    text: '{:dismiss}',
                    class: 'notifications-btn-right right',
                    click() {
                        this.options.owner.dismissNotifications();
                        this.$el.empty();
                        this.close();
                    }
                }
            }
        });
    }

    /*
     * @class Displays the supplied notifications in a dialog
     * @param {AdminNotificationsPlugin} owner                  The adminNotifications plugin
     * @param {object}                   options
     * @param {Array}                    options.notifications  Notifications to be dislayed in the dialog
     * @extends {Dialog}
     * @constructs
     */

    open() {
        super.open();
        //Scroll to the bottom of the list since that is where newest notification is shown at the bottom of the list.
        this.el.scrollTop = this.el.scrollHeight;
        this.$el.dialog('widget').find('.primary-btn').focus();
    }

    render() {
        super.render();
        //Update the dialog's background color
        this.$el.dialog('widget').find('.ui-dialog-content').css('background', '#eee');
    }
}

const notificationHtml = $(adminNotificationHtml).filter('#admin-notification-template').html();

export class AdminNotificationView extends Backbone.View {
    static {
        this.prototype.notificationTemplate = template(notificationHtml);
        this.prototype.className = 'admin-notification-row';

        this.prototype.events = {
            'click .admin-notification-header': 'toggleDetails'
        };
    }

    /*
     * @class Creates a view for the notification supplied
     * @param {object} options
     * @param {object} options.notification Notification to be dislayed in the dialog
     * @extends {Backbone.View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.options = options;
        this.render();
    }

    render() {
        const notification = this.options.notification;
        const htmlFilterOptions = {
            whiteList: {
                a: ['title', 'href', 'target'], //removes attributes like onlick etc,
                i: [],
                b: [],
                strong: [],
                br: [],
                p: [],
                div: ['style'],
                span: ['style'],
                li: ['style'],
                ul: ['style']
            },
            stripIgnoreTagBody: ['script'] //Removes the content between script tags
        };

        this.$el.html(
            this.notificationTemplate({
                type: notification.type,
                subject: filterXSS(notification.subject, htmlFilterOptions),
                date: Util.formatDate(notification.created, true),
                details: filterXSS(notification.details, htmlFilterOptions),
                isUnread:
                    typeof notification.isUnread === 'undefined' ? true : notification.isUnread
            })
        );
    }

    /*
     * Shows/hides the details of the notification
     */
    toggleDetails() {
        this.$('.admin-notification-details').toggle();
        this.$('.admin-notification-title').toggleClass('collapsed');
    }
}

/**
 * Options for {@link AdminNotificationsPlugin}
 * @typedef adminNotificationsOptions
 * @property {number}lastReadId         Tracks the last Id of the notifications a user has read
 * @property {number}lastReadLocalId    Tracks the last Id of the local notifications a user has read
 * @property {float}   autoCheckInterval  Interval (in hours) between checking for notifications. A value of null or 0 means no automatic checking for notifications.
 */

export default AdminNotificationsPlugin;
