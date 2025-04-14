// Copyright: IQGeo Limited 2010-2023
import { Plugin, trace as mywTrace } from 'myWorld-client';

const trace = mywTrace('nativeNotifications');

/**
 * @class Plugin to schedule native notifications
 * Listens for 'native-notification' events on the Application object and schedules a native notification on the device
 * @extends {Plugin}
 */
export class NativeNotificationsPlugin extends Plugin {
    static forOnlineApp = false;

    /**
     *
     * @param  { Application } owner The application
     * @param  {object} options
     * @constructs
     *
     */
    constructor(owner, options) {
        super(owner, options);
        this.app.on('native-notification', this._onNativeNotification);
    }

    /**
     * Fired when a native notification is requested
     * @param {object} event
     * @param {string} event.title
     * @param {string} event.body
     * @param {object} event.schedule
     * @param {number} event.id
     * @returns {Promise<void>}
     */
    async _onNativeNotification({
        title,
        body,
        schedule = { at: new Date(new Date().getTime() + 1000) }, // 1 second from now
        id = Math.floor(Math.random() * 2147483648) // 32-bit integer max value (limited by Android)
    }) {
        const { localNotifications } = this.app.system.server.engines;

        const notification = {
            title,
            body,
            schedule,
            id
        };

        trace(5, 'Checking if user has granted permission to display notifications');
        let permission = await localNotifications.checkPermissions();

        if (permission?.display !== 'granted') {
            trace(5, 'Requesting permission to display notifications');
            permission = await localNotifications.requestPermissions();

            if (permission?.display !== 'granted') {
                console.warn('User has not granted permission to display notifications');
                return;
            }
        }

        trace(5, `Native notification scheduled: ${JSON.stringify(notification)}`);

        await localNotifications.schedule({
            notifications: [notification]
        });
    }
}
