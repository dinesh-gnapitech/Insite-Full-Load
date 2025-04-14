// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';

export class CurrentAlertView extends Control {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'overlay-container notification-popup';
    }

    /*
     * @class Alert that pop's up at the bottom of the page
     *        Used in the phone layout
     * @constructs
     * @extends {Control}
     */
    constructor(options) {
        super(options);
        this.render();
    }

    render() {
        this.datasourceView = $('<span>', { class: 'notification-title' });
        this.errorReasonView = $('<span>', { class: 'notification-desc' });

        this.$el.append(this.datasourceView).append(this.errorReasonView).appendTo('body').hide();
    }

    updateAndShow(alert) {
        const title = alert.title ? alert.title : '';
        const notification = alert.description ? alert.description : alert;
        this.datasourceView.html(title);
        this.errorReasonView.html(notification);
        this.$el.show();
        this.waitAndHide();
    }

    /*
     * After waiting for 1 second, hide the alert
     */
    waitAndHide() {
        this.$el.delay(3000).fadeOut(1000);
    }
}
export default CurrentAlertView;
