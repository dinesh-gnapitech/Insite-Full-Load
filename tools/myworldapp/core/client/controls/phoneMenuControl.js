// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import Backbone from 'backbone';
import myw from 'myWorld/base/core';
import { Control } from 'myWorld/base/control';
import { PluginButton } from 'myWorld/base/pluginButton';
import 'jquery-touchswipe';
import basemapImg from 'images/toolbar/basemap.svg';
import homeImg from 'images/toolbar/home.svg';

export class PhoneMenuControl extends Control {
    static {
        this.prototype.events = {
            'click .button-list li:not(.inactive)': 'hide',
            'click #map-inactive-overlay, .close-btn': 'hide'
        };
    }

    /**
     * Completes initialization of the plugin by adding click event listeners to the toolbar buttons.
     * Initializes listeners for bus events
     * @class  A control to hold Toolbar buttons. <br/>
     *  Application plugins can add their own buttons by registering the corresponding {@link buttonId} in the 'buttons' option
     * @param  {Application|Control}    owner       Owner - application or another control
     * @param  {object}              options
     * @param  {string}              options.divId       Id of the div where self should be created
     * @param  {Array<buttonId>}     options.buttons     List of buttons to display in the toolbar
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        this.owner = owner;

        myw.appReady.then(() => {
            this.render();
        });
    }

    render() {
        this.menu = this.$el.find('#menu');
        this.overlay = this.$el.find('#map-inactive-overlay');

        const menuHeader = new MenuHeader({ owner: this });
        this.menu.append(menuHeader.$el);

        const menuBody = $('<div>', { class: 'menu-body' }).appendTo(this.menu),
            buttonList = $('<ul>', { class: 'button-list noStyleList' }),
            menuFooter = $('<div>', { class: 'menu-footer', text: `myWorld ${myw.version}` });

        menuBody.append(buttonList).append(menuFooter);

        this.addButtons(buttonList, this.options.buttons, { mode: 'menu' });
        this.initSwipeEventHandlers();
    }

    /**
     * Handles hinding the menu with the swipe right action using jquery-touchswipe
     */
    initSwipeEventHandlers() {
        this.$el.swipe({
            swipeRight: (event, direction, distance, duration, fingerCount) => {
                this.hide();
            },
            //The number of pixels that the user must move their finger by before it is considered a swipe.
            //Default is 75
            threshold: 30
        });
    }

    show() {
        this.isMenuVisible = false;
        this.menu.show('slide', {
            direction: 'right',
            complete: () => {
                this.isMenuVisible = true;
            }
        });
        this.$('.close-btn').show('fadeIn');
        this.overlay.show();
    }

    hide() {
        this.menu.hide('slide', {
            direction: 'right',
            complete: () => {
                this.isMenuVisible = false;
            }
        });
        this.$('.close-btn').hide('fadeOut');
        this.overlay.hide();
    }
}

class MenuHeader extends Backbone.View {
    static {
        this.prototype.className = 'menu-header';

        this.prototype.events = {
            'click #logo': 'goToHomePage'
        };
    }

    constructor(options) {
        super(options);
        this.owner = options.owner;
        this.render();
    }

    render() {
        const logo = $(
                `<div class="logo-large right" id="logo" title="${this.owner.msg(
                    'home_page'
                )}"></div>`
            ),
            logoutLink = $(
                `<a id="logout-link" class="logout-link text-highlight" href="logout?application=${
                    this.owner.app.name
                }">${this.owner.msg('logout')}</a>`
            );

        this.$el.append(logo);

        if (myw.currentUser.autoLogin !== true) {
            this.$el.append(logoutLink);
        }
    }

    goToHomePage() {
        if (this.owner.isMenuVisible) this.owner.app.home();
    }
}

class HomeButton extends PluginButton {
    static {
        this.prototype.titleMsg = 'home_bookmark';
        this.prototype.imgSrc = homeImg;
    }

    action() {
        this.app.homeView();
    }
}

class BasemapButton extends PluginButton {
    static {
        this.prototype.titleMsg = 'basemap';
        this.prototype.imgSrc = basemapImg;
    }

    action() {
        this.app.layout.pages.basemaps.toggle(true);
    }
}

PhoneMenuControl.prototype.buttons = {
    home: HomeButton,
    basemap: BasemapButton
};

export default PhoneMenuControl;
