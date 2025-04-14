// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld/base';
import UserLocation from '../userLocation/userLocation';
import locateImg from 'images/toolbar/locate.svg';

export class UserLocationPlugin extends Plugin {
    static {
        this.mergeOptions(UserLocation.options);
    }

    /**
     * @class Provides location tracking functionality <br/>
     * Adds a button to the toolbar which activates the location tracking and adds a marker to the map
     * @param  {Application} owner                       The application
     * @param  {userLocationOptions} options These options will be merged with thise set in the 'core.plugin.userLocation' database setting
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.setOptions(this.app.system.settings['core.plugin.userLocation']);

        this.app.userLocation.init(this.options);

        this.app.userLocation.on('tracking-changed', () => this.trigger('change'));
    }
}

UserLocationPlugin.prototype.buttons = {
    locate: class extends PluginButton {
        static {
            this.prototype.messageGroup = 'UserLocationPlugin';
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = locateImg;
            this.prototype.id = 'userLocationButton';
        }

        async action() {
            this.app.recordFunctionalityAccess('core.toolbar.user_location');
            const wasTracking = this.app.userLocation.isTracking;
            const success = await this.app.userLocation.toggleTracking();
            if (!wasTracking && !success) this.app.message(this.msg('unavailable'));
            this.render();
        }

        render() {
            const { isTracking } = this.app.userLocation;
            this.setTitle(isTracking ? 'stop_tracking' : 'toolbar_msg');
            this.$el.toggleClass('active', isTracking);
        }
    }
};

export default UserLocationPlugin;
