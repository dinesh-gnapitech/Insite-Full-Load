// Copyright: IQGeo Limited 2010-2023
import { result } from 'underscore';
import $ from 'jquery';
import 'jquery-ui';
import 'jquery-layout';
import myw from 'myWorld/base/core';
import { msg } from 'myWorld/base/localisation';
import Layout from './layout';
import { ViewManager } from './viewManager';
import desktopHtml from 'text!html/desktop.html';
import iqgeoLogoImg from 'images/logos/IQGeo_Logo_main.svg';

export class DesktopLayout extends Layout {
    static {
        this.mergeOptions({
            viewManagerMaxItemsVisible: 2,

            eastEnabled: false,
            eastClosed: true,
            eastResizable: true,
            eastPanelSize: 350,

            westClosed: false,
            westPanelMinimumSize: 305, //enough for the buttons on the details panel when displaying a feature
            //calculate west panel initial size: a fourth of screen width, with max of 350 (minimum is controlled separately)
            westPanelInitialSize() {
                return Math.min(Math.floor($(window).width() / 4), 350);
            }
        });
    }

    /**
     * @class Layout for a standard web browser client environment.
     * This includes desktop computers, laptops and tablets.
     * The registered controls will be instantiated when the layout is applied.
     * When layout sections are resized (either by a window resize or by collapsing/expanding sections), controls will be informed
     * via a call to method 'invalidateSize()' (if they implement it). This allows the controls to set sizes of internal elements (ie. for scrolling)
     * @param {desktopLayoutOptions} options
     * @extends {Layout}
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);
    }

    /**
     * Initializes the body layout, map, viewManager and footer
     * @return {Promise<GeoMapControl>}
     */
    initUI() {
        this.setTouchStyles(this.options.useTouchStyles);
        //load body html
        this.$el.html(desktopHtml);

        return myw.localisation.ready.then(() => {
            //we set the body layout early because the sizes of elements may be used by other
            //initializations (example: calculating the initial map bounds is dependent on the size
            //of the canvas element)
            this.setBodyLayout(this.app); //needs messages to be ready
            this.$('#logo').attr('title', this.msg('home_page'));

            this.addFooterAndTitleInfo(this); //needs messages to be ready

            //initialize the geographical map. Needs to happen after setBodyLayout()
            const map = new this.options.GeoMapControl(this.app, this.options.mapDivId);

            this.mapViewManager = new ViewManager(this.options.viewManagerMaxItemsVisible);
            this.mapViewManager.register('map', map, true);
            this.mapViewManager.show('map');

            return map;
        });
    }

    /**
     * Adds or removes the touch styles.
     * @param {boolean}  enabled
     */
    setTouchStyles(enabled) {
        // This is done by adding/removing 'touch-enabled' class
        this.$el.toggleClass('touch-enabled', enabled);
    }

    /**
     * Add the Application name, username and the logout link to the footer
     */
    addFooterAndTitleInfo() {
        window.document.title = `IQGeo ${this.app.externalName}`;
        //Adding the username of the logged-in user and logout link to the DOM
        this.$('#user').append(
            `<span id='username'>[${this.app.externalName}] ${myw.currentUser.username} </span>`
        );

        if (myw.currentUser.autoLogin !== true) {
            $('#user').append(
                `<a id="logout-link" href="logout?application=${this.app.name}"">${msg(
                    'Application',
                    'logout_footer'
                )}</a>`
            );
        }

        const builtByEl = this.$('#built_by_footer');
        builtByEl.html(msg('Application', 'built_by_footer'));
        this.$('img').attr('src', iqgeoLogoImg);
    }

    setBodyLayout(app) {
        const triggerOpened = (paneName, jqueryElement, state) => {
            const control = this._getControlOnPane(paneName);
            if (control) control.visibilityChanged(true);
        };
        const triggerClosed = (paneName, jqueryElement, state) => {
            const control = this._getControlOnPane(paneName);
            if (control) control.visibilityChanged(false);
        };
        const triggerResized = (paneName, jqueryElement, state) => {
            const control = this._getControlOnPane(paneName);
            if (control) control.invalidateSize();
        };

        this.layout = this.$el.layout({
            applyDefaultStyles: false,
            south: {
                enableCursorHotkey: false,
                resizable: false,
                size: 18,
                closable: false
            },
            north: {
                enableCursorHotkey: false,
                resizable: false,
                size: 70,
                closable: false
            },
            //The East panel is hidden or shown according to the option 'eastEnabled'
            east: {
                spacing_open: 3,
                spacing_closed: 1,
                size: this.options.eastPanelSize,
                initHidden: !this.options.eastEnabled,
                resizeWhileDragging: true,
                slidable: false,
                closable: true,
                initClosed: this.options.eastClosed,
                resizable: this.options.eastResizable,
                resizeWithWindow: false,
                enableCursorHotkey: false,
                togglerTip_open: this.msg('hide_panel'),
                togglerTip_closed: this.msg('show_panel'),
                resizerTip: this.msg('resize_panel'),
                onopen_end: triggerOpened,
                onclose_end: triggerClosed,
                onresize: triggerResized
            },
            west: {
                spacing_open: 3,
                spacing_closed: 1,
                minSize: this.options.westPanelMinimumSize,
                size: result(this.options, 'westPanelInitialSize'),
                resizeWhileDragging: true,
                slidable: false,
                closable: true,
                initClosed: this.options.westClosed,
                resizable: true,
                resizeWithWindow: false,
                enableCursorHotkey: false,
                togglerTip_open: this.msg('hide_panel'),
                togglerTip_closed: this.msg('show_panel'),
                resizerTip: this.msg('resize_panel'),
                onopen_end: (...args) => {
                    if (this.controls.featureBriefControl) this.controls.featureBriefControl.hide();
                    triggerOpened(...args);
                },
                onclose_end: (...args) => {
                    if (this.controls.featureBriefControl) this.controls.featureBriefControl.show();
                    triggerClosed(...args);
                },
                onresize: triggerResized
            }
        });

        this.centerLayout = this.$('#layout-map-view').layout({
            applyDefaultStyles: false,
            south: {
                spacing_open: 3,
                spacing_closed: 1,
                size: '50%',
                initHidden: true,
                resizeWhileDragging: true,
                slidable: false,
                closable: true,
                resizable: true,
                resizeWithWindow: false,
                enableCursorHotkey: false,
                togglerTip_open: this.msg('hide_panel'),
                togglerTip_closed: this.msg('show_panel'),
                onopen_end: triggerOpened,
                onclose_end: triggerClosed,
                onresize: triggerResized
            },
            center: {
                onopen_end: triggerOpened,
                onclose_end: triggerClosed,
                onresize: (...args) => {
                    //inform the map that the size may have changed
                    if (app.map) app.map.invalidateSize();
                    //Resizes the visible map views
                    this.mapViewManager.invalidateSize();
                    triggerResized(...args);
                }
            }
        });

        this.state = this.layout.state;

        // For mobile devices:
        if (myw.isTouchDevice) {
            // Increase the focus area of panel hide/show buttons for easy usability
            $('.ui-layout-toggler').append("<div class='increase-toggler-focus-area'></div>");
        }
    }

    /**
     * Initializes the handlers for user events (mouse clicks, etc...)
     */
    initUserEventHandlers() {
        //setup handler for clicking the logo
        //when the logo's clicked execute the (only) action immediately
        $('#logo').click(() => {
            this.app.logoAction.action();
        });
    }

    /**
     * Opens the left panel and switches to the details tab
     */
    displayCurrentFeatureDetails() {
        this.layout.open('west');
        this.controls.tabControl.switchToTab('details');
    }

    _getControlOnPane(paneName) {
        const layout = paneName == 'south' ? this.centerLayout : this.layout,
            divId = layout[paneName].pane.attr('id');
        return Object.values(this.controls).find(control => control.options.divId === divId);
    }

    /**
     * Opens the specified pane by delegating to the appropriate JQuery UI Layout object
     * @param  {string} paneName
     */
    open(paneName) {
        //get which jquery layout to use
        const layout = paneName == 'south' ? this.centerLayout : this.layout;
        //pass on the request
        layout.open(...arguments);
    }

    /**
     * Closes the specified pane by delegating to the appropriate JQuery UI Layout object
     * @param  {string} paneName
     */
    close(paneName) {
        //get which jquery layout to use
        let layout;
        if (paneName == 'south') {
            layout = this.centerLayout;
            layout.hide('south');
        } else {
            layout = this.layout;
        }
        //pass on the request
        layout.close(...arguments);
    }

    getState() {
        return {
            eastClosed: this.layout.state.east.isClosed,
            westClosed: this.layout.state.west.isClosed,
            controlsState: this.getChildrenState()
        };
    }
}

/**
 * Options to specify when creating a DesktopLayout
 * @typedef desktopLayoutOptions
 * @property {string}                       mapDivId                   Id of the div where the main map should be created
 * @property {boolean}                      eastEnabled=false          Whether a panel on the east should be added or not
 * @property {boolean}                      eastClosed=true            Whether the east panel should start closed(collapsed) or not
 * @property {boolean}                      eastResizable=true         Whether the east panel can be resized by the user or not
 * @property {number}                     eastPanelSize=350          Size in pixels of east panel
 * @property {boolean}                      westClose=false            Whether the west panel should start closed(collapsed) or not
 * @property {number    }                  westPanelMinimumSize=305   Minimum width in pixels for the west panel. Default is 305
 * @property {number|function}             westPanelInitialSize       Initial width of west panel in pixels. Can be a function that returns the value. <br/>
 *                                                                     Default is a function that returns a fourth of the page width, with minimum of 275 and maximum of 350
 * @property {Object<controlDefinition>}    controls   Control definitions, keyed on control name
 */

export default DesktopLayout;
