// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { MessagesPopover } from './messagesPopover';

export class OnMapMessagesPopover extends MessagesPopover {
    static {
        this.prototype.events = {
            'click .dismiss-btn': 'dismiss',
            'click .cancel-btn': 'hide'
        };
    }

    render() {
        this.$el.empty();
        this.archivedMessages = [];

        const header = $('<div>', { class: 'overlay-header' })
            .append($('<div>', { text: this.options.title }))
            .append($('<span>', { class: 'close-btn', title: this.owner.msg('close') }));

        this.list = $('<ul>', { class: 'status-list noStyleList' });

        const buttons = $(
            `<div class="overlay-buttons"><button class="primary-btn dismiss-btn">${this.msg(
                'dismiss'
            )}</button><button class="cancel-btn">${this.msg('cancel')}</button></div>`
        );

        this.container = $('<div>', { class: 'overlay-container' })
            .append(header)
            .append(this.list)
            .append(buttons);

        this.overlay = $('<div>', { class: 'overlay' });

        this.$el.append(this.overlay).append(this.container);
    }

    /*
     * Updates the connections status list in the popover
     */
    update(messageList) {
        //Removes any archived messages from the messageList
        messageList.forEach(message => {
            if (this._isArchivedMessage(message)) {
                messageList = messageList.filter(msg => msg !== message);
            }
        });

        this.messageList = messageList;
        this.refreshList(messageList);

        if (this.list.children().length === 0) this.hide();
    }

    /*
     * Find out if the message is archived by the user
     * @param  {object}     message   Message from the messageList
     * @return {Boolean}              True if the message exists in the archived list
     */
    _isArchivedMessage(message) {
        return this.archivedMessages.find(archivedMsg => archivedMsg === message);
    }

    show() {
        if (this.messageList.length === 0) return;
        this.$el.show();
        this.container.show('slide', { direction: 'down' });
        this.overlay.show('fade');
    }

    hide() {
        this.container.hide('slide', { direction: 'down' }, () => {
            this.$el.hide();
        });
        this.overlay.hide('fade');
    }

    dismiss() {
        this.owner.hide();
        this.hide();

        //Archive the dismissed messages
        this.archivedMessages = [...new Set([...this.archivedMessages, ...this.messageList])];
    }

    resetPosition() {}
    showHold() {}
    waitAndHide() {}
}

export default OnMapMessagesPopover;
