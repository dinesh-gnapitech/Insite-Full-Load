// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import { MessagesPopover } from './messagesPopover';

export class NotificationView extends Control {
    static {
        this.prototype.tagName = 'span';
    }

    /*
     * @class  Creates a view to show the plugin's state through an icon and a message
     * @param  {NotificationsControl} owner          Owner of self
     * @param  {object}                   options
     * @param  {notificationViewItem}     options.item
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        this.options = options;

        this.events = Object.assign({}, this.events); //Creates a copy of events that is specific to this instance
        this.render();
    }

    render() {
        //Create an area for the icons and notification
        this.pluginIcon = $('<span>', { class: 'plugin-icon' });
        this.pluginStateLabel = $('<span>', { class: 'plugin-message' });

        this.$el.append(this.pluginIcon).append(this.pluginStateLabel);
    }

    /*
     * Renders the notification view using the information supplied by the item object
     * Updates the two popovers:
     * - Message list popover to show the active messages when the user clicks on the notification view
     * - Message popover that shows up and then fades away when a message is sent with the event
     * @param  {notificationViewItem} item
     */
    renderFor(item) {
        this.stateLabel = item.stateLabel;
        this._updateHtml(item);
        this._updateEventHandlers(item.onClick);

        const hasClickEvent = !!item.onClick;
        if (!hasClickEvent && item.activeMessages)
            this._updateActiveMessagesPopover(MessagesPopover, item);
        if (item.message) this._updateMessagePopover(MessagesPopover, item);
    }

    /*
     * Updates the icon and label in the view
     * @param  {object} item Notification object
     */
    _updateHtml(item) {
        this.pluginIcon.html(item.icon);
        // don't show labels in portrait mode
        const stateLabel = window.innerHeight > window.innerWidth ? '' : item.stateLabel;
        this.pluginStateLabel.html(stateLabel);
    }

    /*
     * Updates the on click event handling
     * If the notification has an onClick method, use that otherwise toggleMessagesPopoverForList()
     * @param  {method} eventHandler onClick event handler
     */
    _updateEventHandlers(eventHandler) {
        //Update the onclick event handling
        eventHandler = eventHandler || this.toggleMessagesPopoverForList.bind(this);
        this.events['click'] = eventHandler;
        this.delegateEvents();
    }

    /*
     * Update the messages list popover with the current list of active messages
     * @param  {MessagesPopover} messagesViewClass Class that defines the view for the messages popover
     * @param  {object}              item              Notification object
     */
    _updateActiveMessagesPopover(messagesViewClass, item) {
        if (!this.messagesListPopover) {
            this.messagesListPopover = new messagesViewClass(this, { title: item.title });
        }
        const messageList = item.activeMessages || [];
        this.messagesListPopover.update(messageList);
    }

    /*
     * Update the message in the message popover
     * @param  {MessagesPopover} messagesViewClass Class that defines the view for the messages popover
     * @param  {object}              item              Notification object
     */
    _updateMessagePopover(messagesViewClass, item) {
        if (!this.messagesPopover) {
            this.messagesPopover = new messagesViewClass(this, { title: item.title });
        }
        this.messagesPopover.update([item.message]);
        this.messagesPopover.showPopup();
    }

    resetMessagePopupPosition() {
        if (this.messagesPopover) this.messagesPopover.resetPosition();
    }

    /*
     * Hides/shows the connections status list popover
     */
    toggleMessagesPopoverForList() {
        //show all active messages
        if (this.messagesListPopover) this.messagesListPopover.toggleDisplay();
    }

    remove() {
        if (this.messagesPopover) this.messagesPopover.remove();
        if (this.messagesListPopover) this.messagesListPopover.remove();
        super.remove();
    }

    hide() {
        this.$el.hide();
    }
}

/**
 * Object that contains the info to display the plugin's state and messages to show to the user
 * @typedef notificationViewItem
 * @property {string}      icon         Icon to display in the notification control that indicates the state of the plugin
 * @property {string}      stateLabel   Label to show with the icon
 * @property {Array}       messages     Messages to show the user
 * @property {string}      title        Title for the user messages that describes the messages
 */

export default NotificationView;
