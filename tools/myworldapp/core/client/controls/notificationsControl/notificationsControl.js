// Copyright: IQGeo Limited 2010-2023
import { matcher, sortBy } from 'underscore';
import { Control } from 'myWorld/base/control';
import { NotificationView } from './notificationView';
import { OnMapNotificationView } from './onMapNotificationView';

export class NotificationsControl extends Control {
    /**
     * @class  A control to present notifications to the user.
     *         Listens for {@link user-notification} events and displays them
     * @param  {Application|Control}   owner                       Owner - application or another control
     * @param  {object}                        options
     * @param  {string}                        options.divId               Id of the div where the notification view should be displayed
     * @param  {string[]}                      options.pluginDisplayOrder  Array of plugin names that dictates the order
     *                                                                     in which the notification views are displayed
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        this.notifications = {};
        this.notificationViews = {};

        this.app.on('user-notification', this.registerPluginEvent, this);

        window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
    }

    registerPluginEvent(event) {
        this.notifications[event.pluginName] = event;
        this.updateNotifications(event);
    }

    handleOrientationChange() {
        // Show labels only in the landscape mode (#10508)
        const isPortrait = window.orientation != '90' && window.orientation != '-90';
        Object.values(this.notificationViews).forEach(view => {
            const label = !isPortrait ? view.stateLabel : '';
            if (view.stateLabel) view.$el.find('.plugin-message').text(label);
        }, this);
    }

    updateNotifications(item) {
        const pluginName =
            Object.keys(this.app.plugins).find(
                plugin => this.app.plugins[plugin] === item.plugin
            ) || item.pluginName;

        let notificationView;

        if (!this.notificationViews[pluginName]) {
            //Create an area for the icons and notification
            if (this.app.isHandheld) {
                notificationView = new OnMapNotificationView(this);
            } else {
                notificationView = new NotificationView(this);
            }
            //Add a displayOrder property to track the order in which the notification should be displayed in the control's container
            notificationView['displayOrder'] = this.options.pluginDisplayOrder.indexOf(pluginName);

            //Add it to the list of notification that already exist
            this.notificationViews[pluginName] = notificationView;

            //Sort this.notificationViews based on their displayOrder and find the index where the notificationView needs to be inserted
            const insertIndex = sortBy(this.notificationViews, 'displayOrder').findIndex(
                matcher(notificationView)
            );

            //Add the notification view in the correct order
            if (
                this.options.pluginDisplayOrder &&
                insertIndex > 0 &&
                Object.keys(this.notificationViews).length
            ) {
                const previousNotification = this.$el.children()[insertIndex - 1];
                this.$(previousNotification).after(notificationView.el);
            } else {
                this.$el.prepend(notificationView.el);
            }
        }
        //Update the existing notification view for the plugin
        this.notificationViews[pluginName].renderFor(item);

        //When a new notification view is created,
        //the other notification views are displaced, so we need to reset the position
        //of the popups associated with them
        Object.values(this.notificationViews).forEach(view => {
            view.resetMessagePopupPosition();
        });
    }

    remove() {
        for (let view of Object.values(this.notificationViews)) {
            view.remove();
        }
        super.remove();
    }
}

export default NotificationsControl;
