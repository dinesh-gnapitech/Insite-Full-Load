// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import { ControlOwnerMixin } from 'myWorld/base/controlOwnerMixin';
import { GeoMapControl } from 'myWorld/map/geoMapControl';

export class Layout extends Control {
    static {
        this.include(ControlOwnerMixin);

        this.mergeOptions({
            GeoMapControl: GeoMapControl,
            v: 2 //options format version
        });
    }

    /**
     * @class Layout for a standard web browser client environment.
     * This includes desktop computers, laptops and tablets.
     * The registered controls will be instantiated when the layout is applied.
     * When layout sections are resized (either by a window resize or by collapsing/expanding sections), controls will be informed
     * via a call to method 'invalidateSize()' (if they implement it). This allows the controls to set sizes of internal elements (ie. for scrolling)
     * @param {desktopLayoutOptions} options
     * @constructs
     * @mixes {ControlOwnerMixin}
     */
    constructor(owner, options) {
        super(owner, options);

        this.controls = {};

        this.initialized = this.initUI();
    }

    /**
     * Initializes the layout's UI components
     * @return {Promise<GeoMapControl>}
     */
    initUI() {
        const map = new this.options.GeoMapControl(this.app, this.el);
        return Promise.resolve(map);
    }

    /**
     * Instantiates the controls and setups user event handlers
     * @return {Promise} To be resolve when all the controls have been instantiated and initialized
     */
    initControls() {
        const controlsState = this.options.controlsState;

        //instantiate the controls
        Object.entries(this.options.controls).forEach(([key, controlDef]) => {
            if (controlDef) {
                /* jshint newcap: false */
                const controlClass = controlDef[0];

                let options = controlDef[1];
                const savedState = controlsState?.[key];

                options = Object.assign(options, savedState);
                this.controls[key] = new controlClass(this.app, options);
            }
        });

        //wait for controls to be initialized before continuing
        return Promise.all(Object.values(this.controls).map(c => c.initialized)).then(() => {
            // //convert all divs identified with button class into jquery buttons,
            // //all html should have been loaded before this executed
            // //ENH: each control should handle buttons themselves, making this unnecessary
            // $(".button").button();

            this.initUserEventHandlers();
            this.initAppEventHandlers();

            this.app.map.invalidateSize(); //is this still necessary?
        });
    }

    /**
     * Displays an image in a pop-up dialog
     * @param  {string}         title        Title for the dialog
     * @param  {jqueryElement}  imgElement   Element for the image to be displayed
     */
    displayImage(title, imgElement) {
        const widgetWidth = $(window).outerWidth() - 50;
        const widgetHeight = $(window).outerHeight() - 50;

        const imageContainer = $('<div/>', { class: 'photo-container' }).append(imgElement);

        imageContainer.find('img').on('load', () => {
            imageContainer.dialog({
                title: title,
                width: 'auto',
                maxHeight: widgetHeight,
                maxWidth: widgetWidth
            });
        });
        return imageContainer;
    }

    getState() {
        return {
            controlsState: this.getChildrenState(),
            v: 2
        };
    }

    //upgrades options from pre 4.2 to the 4.2 format
    upgradeOptionsToV2(options) {
        //note: upgraded databases might still have state saved in older formats so this method need to be kept
        //pre 4.2 sub controls state was saved in hierarchy (tabControl had state of sub-ontrols).
        //From 4.2 all controls are saved at top-level
        const ctlsState = options.controlsState;
        if (ctlsState?.tabControl) {
            Object.assign(ctlsState, ctlsState.tabControl.tabsState);
            delete options.controlsState.tabControl;
        }
        return options;
    }

    /**
     * Initializes the handlers for user events (mouse clicks, etc...)
     * override in subclasses
     */
    initUserEventHandlers() {}

    /**
     * Initializes the handlers for application events (current feature changes, etc...)
     * override in subclasses
     */
    initAppEventHandlers() {}

    //overridden to  sub-elements
    remove() {
        this.app.map.remove();
        const controls = this.app.layout.getChildControls();
        for (let control of Object.values(controls)) {
            control.remove();
        }
        super.remove();
    }
}

/**
 * Options to specify when creating a Layout
 * @typedef layoutOptions
 * @property {string}                       mapDivId   Id of the div where the main map should be created
 * @property {Object<controlDefinition>}    controls   Control definitions, keyed on control name
 */

export default Layout;
