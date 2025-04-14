// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld/base';
import { Control } from 'myWorld/base/control';
import { PluginButton } from 'myWorld/base/pluginButton';
import homeImg from 'images/toolbar/home.svg';

export class ToolbarControl extends Control {
    static {
        this.prototype.messageGroup = 'ToolbarControl';
    }

    /**
     * Completes initialization of the plugin by adding click event listeners to the toolbar buttons.
     * Initializes listeners for bus events
     * @class  A control to hold Toolbar buttons. <br/>
     *  Application plugins can add their own buttons by registering the corresponding {@link buttonId} in the 'buttons' option
     * @param  {Application|Control}    owner       Owner - application or another control
     * @param  {object}                              options
     * @param  {string}                              options.divId       Id of the div where self should be created
     * @param  {Array<buttonId|buttonPullDownObj>}   options.buttons     List of buttons to display in the toolbar
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);

        myw.appReady.then(() => {
            this.addButtons();
        });

        $(window).resize(() => {
            this.addButtons();
        });
    }

    addButtons() {
        const searchControl = this.app.layout.controls.search;
        const searchBarWidth = searchControl?.$el
            ? this.app.layout.controls.search.$el.outerWidth()
            : 0;
        const availableWidth = $(window).width() - searchBarWidth - $('#logo').outerWidth() - 32;

        super.addButtons(this.$el, this.options.buttons, {}, availableWidth, 46);
    }
}

class HomeButton extends PluginButton {
    static {
        this.prototype.titleMsg = 'home_bookmark';
        this.prototype.imgSrc = homeImg;
    }

    action() {
        this.app.recordFunctionalityAccess('core.toolbar.home');
        this.app.homeView();
    }
}

ToolbarControl.prototype.buttons = {
    home: HomeButton
};

/**
 * Object that denotes a button pull down showing a list of buttons.
 * This ui component on click displays the list of buttons denoted by the supplied buttonIds
 * @typedef buttonPullDownObj
 * @property {string}           imgSrc               Path to the image to be used for the buttons pull down
 * @property {string}           titleMsg             Title message for the pull down element
 * @property {Array<buttonId>}  pullDownButtonIds    List of buttons in the pull down
 */
export default ToolbarControl;
