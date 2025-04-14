// Copyright: IQGeo Limited 2010-2023
import { OnMapMessagesPopover } from './onMapMessagesPopover';
import { CurrentAlertView } from './currentAlertView';
import NotificationView from './notificationView';

export class OnMapNotificationView extends NotificationView {
    static {
        this.prototype.className = 'plugin-icon';
    }

    /*
     * This does not need any extra elements, just a div with the className provided
     */
    render() {}

    /*
     * Renders the notification view using the information supplied by the item object
     * @param  {notificationViewItem} item
     */
    renderFor(item) {
        this._updateHtml(item);
        this._updateEventHandlers(item.onClick);

        const hasClickEvent = !!item.onClick;
        if (!hasClickEvent && item.activeMessages)
            this._updateActiveMessagesPopover(OnMapMessagesPopover, item);

        const hasMessage = !!item.message;
        const active = item.active ?? hasMessage;

        if (!hasMessage && !active) {
            this.hide();
        } else {
            this.$el.show();
        }

        if (hasMessage) this.showCurrentAlert(item);
    }

    _updateHtml(item) {
        this.$el.html(item.icon);
    }

    showCurrentAlert(item) {
        //Show a popup with the current alert for 2 seconds and then disappear
        const currentAlert = item.message;

        if (currentAlert) {
            if (!this.currentAlertView) {
                this.currentAlertView = new CurrentAlertView();
            }
            if (currentAlert) this.currentAlertView.updateAndShow(currentAlert);
        }
    }

    toggleMessagesPopoverForList(ev) {
        //show all active messages
        if (this.messagesListPopover) this.messagesListPopover.show();
        ev.stopPropagation();
        return false;
    }
}
export default OnMapNotificationView;
