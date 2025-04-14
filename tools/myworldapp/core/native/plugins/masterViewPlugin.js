// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld-base';
import masterImg from 'images/toolbar/master.svg';
import masterActiveImg from 'images/toolbar/master-active.svg';

/**
 * @class Plugin to allow the user to switch between local (data from local database) and master mode (data from server) in the native app<br/>
 * @param  {Application} owner  The application
 * @extends {Plugin}
 */
export class MasterViewPlugin extends Plugin {
    static forOnlineApp = false;

    /**
     * Current native app mode - local or master
     * @return {string} 'local' or 'master'
     */
    getMode() {
        return this.app.getNativeAppMode();
    }

    /**
     * Toggles between local and master mode
     * @return {Promise}
     */
    toggleMode() {
        const mode = this.getMode() == 'master' ? 'local' : 'master';

        //clear current feature(s)
        this.app.setCurrentFeatureSet([]);

        return this.app.setNativeAppMode(mode);
    }
}

MasterViewPlugin.prototype.buttons = {
    toggle: class extends PluginButton {
        static {
            this.prototype.id = 'a-online-on';
            this.prototype.titleMsg = 'switch_to_master'; //for automated tests
            this.prototype.imgSrc = masterImg;
        }

        render() {
            if (this.owner.getMode() !== 'master') {
                this.titleMsg = 'switch_to_master';
                this.imgSrc = masterImg;
                this.$el.removeClass('active');
            } else {
                this.titleMsg = 'switch_to_local';
                this.imgSrc = masterActiveImg;
                this.$el.addClass('active');
            }
            this.setTitle(this.titleMsg);
            this.setImage(this.imgSrc);
        }

        action() {
            this.owner.toggleMode().then(this.render);
        }
    }
};
