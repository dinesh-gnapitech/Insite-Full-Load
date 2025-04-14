// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Plugin } from 'myWorld-base';

/*
 */
export class TouchStylesPlugin extends Plugin {
    static {
        this.prototype.statePerApp = false;

        this.mergeOptions({
            active: undefined,
            alwaysShow: false
        });
    }

    /**
     * @class Displays a toggle button in the footer to disable/enable the touch styles
     * @param  {Application} owner The application
     * @param  {object}  [options]
     * @param  {number}[options.active=undefined]  If true, applies touch styles; if false, does not apply touch styles
     * @param  {boolean} [options.alwaysShow=false]  If true, the toggle button is displayed in the footer even for non touch devices
     * @constructs
     * @extends Plugin
     *
     */
    constructor(owner, options) {
        super(owner, options);
        if (owner.options.layoutName === 'print') return;

        const { active, alwaysShow } = this.options;
        //initialise, defaulting to true if it's a touch device
        this.active = active;
        const isEdgeBrowser = (navigator.appVersion || '').includes('Edge'); //ENH: use Browser (consider Edge legacy)

        let showMessage = false;
        if (this.active === undefined) {
            showMessage = true; // Notify with a message, the first time
            //Edge browsers sometimes claim themselves to be in touch mode even on non touch screens
            //For Edge browsers, turn the touch styles off by default
            this.active = myw.isTouchDevice && !isEdgeBrowser && !this.app._isRunningSelenium();
        }

        if (myw.isTouchDevice) this.app.useTouchStyles = this.active;

        this.app.ready.then(() => {
            if (alwaysShow || myw.isTouchDevice) {
                this.createFooterBtn(showMessage);
            }
        });
    }

    toggleState() {
        this.active = !this.active;
        this.app.useTouchStyles = this.active;
        this.createFooterBtn(true);
    }

    /**
     * Adds a button to the footer using the notifications mechanism
     */
    createFooterBtn(showMessage = false) {
        const { active } = this;
        let iconClass = 'touch-styles-toggle';
        if (!active) iconClass = iconClass + ' inactive';

        let notifyOptions = {
            plugin: this,
            icon: $('<span>', { class: iconClass }),
            onClick: this.toggleState.bind(this)
        };

        if (showMessage) {
            const stateStr = active ? 'enabled' : 'disabled';
            notifyOptions['message'] = this.msg('state_input_popup', { state: stateStr });
        }

        this.app.notifyUser(notifyOptions);
    }

    /**
     * Returns object with current softKeboardInput mode to be saved in the local state
     */
    getState() {
        return { active: this.active };
    }
}

export default TouchStylesPlugin;
