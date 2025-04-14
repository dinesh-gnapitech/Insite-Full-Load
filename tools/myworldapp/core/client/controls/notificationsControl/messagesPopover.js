// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';

export class MessagesPopover extends Control {
    static {
        this.prototype.className = 'notification-messages-container';

        this.prototype.genericEvents = {
            'click .close-btn': 'hide',
            'click .error-desc.expandable': 'toggleSelected',
            mouseenter: 'showHold',
            mouseleave: 'waitAndHide'
        };
    }

    /*
     * @class  Responsible for rendering a popover display that lists the plugin's notification messages
     * @param  {NotificationView}     owner            Owner of self
     * @param  {object}                   options
     * @param  {string}                   options.title    Title for the popover
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        const events = Object.assign(this.events || {}, this.genericEvents);

        this.options = options;
        this.owner = owner;
        this.ownerElement = owner.$el;
        this.render();

        this.$el.appendTo('body');
        this.resetPosition();
        $(window).resize(this.resetPosition.bind(this));

        this.delegateEvents(events);
    }

    render() {
        this.$el.empty();

        if (this.options.title) {
            $('<div>', { class: 'status-header', text: this.options.title })
                .append($('<button>', { class: 'close-btn', title: this.msg('close') }))
                .appendTo(this.$el);
        }

        this.list = $('<ul>', { class: 'status-list noStyleList' });
        this.arrow = $('<div>', { class: 'arrow' });

        this.$el.append(this.list).append(this.arrow);
    }

    /*
     * Updates the connections status list in the popover
     * If there are messages to show, shows the popover for 3 seconds
     * @param  {Array<notificationMessage>}  messageList       - List of currently active messages to show the user in the messagesPopover
     */
    update(messageList) {
        this.refreshList(messageList);

        if (this.list.children().length === 0) this.hide();
    }

    /*
     * Repopulates the list with the messages in the supplied messageList
     * @param  {Array<notificationMessage>}  messageList  List of messages to add to the messagesPopover
     */
    refreshList(messageList) {
        this.list.empty();
        //Populate the list
        messageList.forEach(msg => {
            const messageView = $('<li>', { title: msg.description });
            //If its a string, don't add the error-desc class so it doesn't show the alert icon
            const errorTitle =
                typeof msg === 'string'
                    ? msg
                    : $('<div>', { class: 'error-desc', text: msg.title });

            messageView.append(errorTitle).appendTo(this.list);

            if (msg.description) {
                const errorDesc = $('<div>', { class: 'error-reason', text: msg.description });
                messageView.append(errorDesc);
                errorTitle.addClass('expandable');
            }
        });
    }

    /*
     * Keep the popover visible and cancel any queued events
     */
    showHold() {
        this.$el.clearQueue().stop().fadeTo(200, 1);
        this.show();
    }

    /*
     * After waiting for 1 second, hide the popover
     */
    waitAndHide() {
        this.$el.delay(1000).fadeOut(1000);
    }

    /*
     * Shows the popup and fades it out after 3 seconds
     */
    showPopup() {
        this.show();
        this.$el.delay(3000).fadeOut(1000); //hide after 3 seconds when its first updated
    }

    /*
     * Resets the position and width of the popover so  its bottom edge is just above the footer
     * and its right edge is aligned with the owner element's icon
     */
    resetPosition() {
        this.$el.css({
            right: $(window).width() - this.ownerElement.offset().left - 30,
            top: this.ownerElement.offset().top - this.$el.height() - 24,
            'min-width': this.ownerElement.outerWidth() + 10
        });
        //Resets the position of the bottom arrow so it always points to the round state indicator icon
        this.arrow.css('right', 10);
    }

    /*
     * hides/shows the popover
     */
    toggleDisplay() {
        this.resetPosition();
        this.$el.toggle();

        //If the pop over is toggled to show, wait a bit and then fade out
        if (this.$el.is(':visible')) this.waitAndHide();
        this.list.scrollTop(0);
    }

    show() {
        this.app.ready.then(() => {
            this.resetPosition();
            this.$el.show();
        });
    }

    hide() {
        this.$el.hide();
    }

    /*
     * Expands/collapses the list items to show/hide the raeson of the connection failure
     */
    toggleSelected(ev) {
        const row = $(ev.currentTarget).parent();
        if (!row.hasClass('selected')) {
            this.$el.find('.selected').removeClass('selected');
        }
        row.toggleClass('selected');
        this.resetPosition();
    }
}
export default MessagesPopover;
