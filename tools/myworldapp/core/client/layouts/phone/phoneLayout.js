// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Layout from 'myWorld/layouts/layout';
import phoneHtml from 'text!html/phone/phone.html';
import 'jquery-ui';
import 'jquery-layout';
import 'jquery-touchswipe';
import { PhoneLayoutPage } from './phoneLayoutPage';
import { PhoneLayoutDialog } from './phoneLayoutDialog';
import { PhoneLayoutFeatureInfo } from './phoneLayoutFeatureInfo';
import { PhoneLayoutMapLinkPage } from './phoneLayoutMapLinkPage';
import { PhoneLayoutCreateObjectPage } from './phoneLayoutCreateObjectPage';
import { PhoneLayoutStreetviewPage } from './phoneLayoutStreetviewPage';
import { PhoneLayoutBasemapsPage } from './phoneLayoutBasemapsPage';
import { PhoneLayoutResultsListPage } from './phoneLayoutResultsListPage';
import { PhoneLayoutFeatureSetItemInfo } from './phoneLayoutFeatureSetItemInfo';
import { PhoneLayoutFeatureSetInfo } from './phoneLayoutFeatureSetInfo';
import { PhoneLayoutFeatureLoadingView } from './phoneLayoutFeatureLoadingView';
import { PhoneLayoutFeatureEditor } from './phoneLayoutFeatureEditor';

const templatesHtml = $(phoneHtml),
    layoutHtml = templatesHtml.filter('#layout-template').html();

export class PhoneLayout extends Layout {
    static {
        this.prototype.innerTemplate = template(layoutHtml);

        this.prototype.events = {
            // Menu and Search buttons
            'click .menu-btn': 'showMenu',
            'click #text-search-btn': function () {
                this.toggleSearch(true);
            }
        };
    }

    /**
     * @class Layout for a handheld browser client environment.
     * Including iphones and android phones.
     * @param {phoneLayoutOptions} options
     * @extends {Layout}
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        /** Pages that can be shown by the layout. Keyed on name
         * @type {Object<PhoneLayoutPage>} */
        this.pages = {};

        this.scroller = null;
        this.currentPage = null;

        //set let the rest of the app know that we are in handheld mode
        this.app.isHandheld = true;
        this.currentSelectionOrigin = null;

        this.prevButton = new this.app.buttons['prevResult'](this.owner);
        this.nextButton = new this.app.buttons['nextResult'](this.owner);
    }

    /*
     * Initializes the layout's UI components
     * @return {Promise<GeoMapControl>}
     */
    initUI() {
        this.$el.html(this.innerTemplate());
        this.$el.addClass('touch-enabled');
        const map = new this.options.GeoMapControl(this.app, this.options.mapDivId);
        return Promise.resolve(map);
    }

    /*
     * Instantiates the controls and setups user event handlers
     */
    initControls() {
        this._initPages(); //needs to run after initUI has resolved with the map otherwise pages don't get a reference to the map
        this._initExtraPages();
        this.translate(this.$el);

        return super.initControls();
    }

    _initPages() {
        const pages = this.pages;
        // Adding the html needed for the controls used
        pages.basemaps = new PhoneLayoutBasemapsPage(this, {
            divId: 'basemaps-list',
            title: '{:basemaps_title}',
            withMap: true
        });
        pages.streetview = new PhoneLayoutStreetviewPage(this);
        pages.mapLink = new PhoneLayoutMapLinkPage();
        pages.edit = new PhoneLayoutFeatureEditor({ owner: this });

        const notificationControlContainer = $('<div>', { id: 'notifications-container' });

        this.$el
            .append(pages.basemaps.el)
            .append(pages.streetview.el)
            .append(pages.edit.el)
            .append(pages.mapLink.el)
            .append(notificationControlContainer);
    }

    _initExtraPages() {
        const pages = this.pages;
        if (!this.options.extraPages) return;

        for (const [key, pageDef] of Object.entries(this.options.extraPages)) {
            const { pageClass: PageClass = PhoneLayoutPage, ...pageOptions } = pageDef;
            pages[key] = new PageClass(this, pageOptions);
            this.$el.append(pages[key].el);
        }
    }

    /*
     * Initializes the handlers for application events
     */
    initAppEventHandlers() {
        const app = this.app;

        app.on('selection-started', data => {
            this.currentSelectionOrigin = data.origin;
            //a selection has started, so activate the 'loading...' panel
            this.showLoadingPanel();
        });

        app.on('selection-cleared', data => {
            this.currentSelectionOrigin = 'clear_results';
        });

        app.on('query-started', data => {
            this.currentSelectionOrigin = 'query';
            this.showLoadingPanel();
        });

        //when currentFeatureSet-changed event is fired, show the feature set brief
        app.on('currentFeatureSet-changed', () => {
            if (app.currentFeature !== null) return;
            if (this.currentPage == 'page-details') {
                this.showPage('page-map');
            }
            this.showHandheldFeatureSetBrief();
        });

        //when currentFeature-changed event is fired, show the feature brief
        app.on('currentFeature-changed', () => {
            if (app.currentFeature === null) {
                this.showPage('page-map');
                this.showHandheldFeatureSetBrief();
                return;
            } else if (app.currentFeature.isNew) {
                this.showHandheldFeatureDetails();
            } else if (this.currentPage == 'page-edit') {
                this._updateFeatureBrief(app.currentFeature); //In the case of newly added/updated features refreshes the feature info on the map page
                this.detailsPage.setMode('view'); //leaves 'edit' mode if necessary
            } else if (this.currentPage == 'page-street-view') {
                //Click on feature title - return to details page
                this.showPage('page-details');
            } else {
                this.showHandheldFeatureBrief(app.currentFeature);
            }
        });
    }

    /*
     * Method that displays or hides the correct html div (called a page, here) for the handheld app
     * @param  {string} page String of the div id to be shown
     */
    showPage(page) {
        if (!$(`#${page}`).hasClass('current')) {
            this.$(`#${page}`).show();
            this.$('.current').hide().removeClass('current');
            this.$(`#${page}`).addClass('current');
        }
        if (page == 'page-map') this.app.map.invalidateSize();
        this.currentPage = page;
    }

    /*
     * Shows the menu created by the PhoneMenuControl
     */
    showMenu(e) {
        this.controls['menu'].show();
    }

    /*
     * Toggles between the search input bar and the search button
     * Search bar being the expanded version and the button being the collapsed version
     *
     * @param  {boolean} expand  If true: The search bar slides in and the search button fades out
     *                           If false:The search bar slides out and the search button fades in
     */
    toggleSearch(expand) {
        this.controls.search?.$el[expand ? 'show' : 'hide']('slide', { direction: 'left' });
        this.$('#text-search-btn')[expand ? 'hide' : 'show']('fade');
        if (expand) this.controls.search.$el.find('input').focus();
    }

    /*
     * Displays the loading gif in the bottom panel
     */
    showLoadingPanel() {
        if (!this.featureLoadingView) this.featureLoadingView = new PhoneLayoutFeatureLoadingView();

        const bottomPane = this.$('.bottom');
        bottomPane.html(this.featureLoadingView.$el).show('slide', { direction: 'down' });
        this.translate(bottomPane);
    }

    /*
     *
     * Displays the number of results returned along with the number of results currently displayed on the map
     */
    showHandheldFeatureSetBrief() {
        const bottomPane = this.$('.bottom');
        bottomPane.show('slide', { direction: 'down' });

        this.toggleSearch(false); //replaces the search bar with the search button

        if (!this.featureSetInfoView)
            this.featureSetInfoView = new PhoneLayoutFeatureSetInfo({ owner: this });
        if (!this.featureSetInfoView) this.featureSetInfoView = new PhoneLayoutFeatureSetInfo(this);

        bottomPane.html(this.featureSetInfoView.$el);
        this.featureSetInfoView.render();

        this.translate(bottomPane);
    }

    /*
     * Displays some basic information about the selected feature if the selection returned no features, inform the user.
     * @param  {Feature}  feature  If there is a myWorld feature pass that, if no feature was found with the select pass false
     */
    showHandheldFeatureBrief(feature) {
        this.$('.bottom').show('slide', { direction: 'down' });
        this.toggleSearch(false); //replace the search bar with the search button

        this._updateFeatureBrief(feature);
        this.showPage('page-map');
    }

    _updateFeatureBrief(feature) {
        const bottomPane = this.$('.bottom');
        if (this.app.currentFeatureSet?.size() > 1) {
            // Its an item selected from a list
            if (!this.featureSetItemInfoView)
                this.featureSetItemInfoView = new PhoneLayoutFeatureSetItemInfo({
                    owner: this
                });

            bottomPane.html(this.featureSetItemInfoView.$el);
            this.featureSetItemInfoView.render();
        } else {
            //Its a single feature
            if (!this.featureInfoView)
                this.featureInfoView = new PhoneLayoutFeatureInfo({ owner: this });

            bottomPane.html(this.featureInfoView.$el);
            this.featureInfoView.render();
        }

        this.translate(bottomPane);
    }

    /*
     * Show the details of the selected feature
     */
    showHandheldFeatureDetails() {
        if (!this.detailsPage) {
            this.detailsPage = this.controls.details;
            this.$el.append(this.detailsPage.el);
            this.translate(this.detailsPage.$el);
        }

        this.showPage('page-details');
        const detailsMode = this.app.currentFeature.isNew ? 'edit' : 'view';
        this.detailsPage.setMode(detailsMode);
    }

    /*
     * Shows the ResultsListPage that list the feature set items
     */
    showResultsList() {
        if (!this.resultsListPage) {
            this.resultsListPage = new PhoneLayoutResultsListPage(this);
            this.$el.append(this.resultsListPage.el);
        }
        this.showPage('page-results-list');
        this.resultsListPage.render();
    }

    /*
     * Shows the streetview page
     */
    showStreetview() {
        this.pages.streetview.render();
        this.showPage('page-street-view');
    }

    /*
     * Shows the create object page that lists the list of editable features
     * @param  {string|jqueryElement} contents  Html object for the list of editable features
     *                                           If no editable features found, then return a message
     */
    showCreateObjectPage(contents) {
        if (!this.createObjectPage) {
            this.createObjectPage = new PhoneLayoutCreateObjectPage(this, {
                divId: 'feature-list-container',
                title: '{:create_feature_title}'
            });
            this.$el.append(this.createObjectPage.el);
            this.translate(this.createObjectPage.$el);
        }
        this.createObjectPage.update(contents);
        this.createObjectPage.toggle(true);
    }

    _ensureDialog() {
        if (!this.dialog) {
            this.dialog = new PhoneLayoutDialog(this, {
                divId: 'dialog-container'
            });
            this.$el.append(this.dialog.el);
        }
    }

    showDialog(title, contents, buttons) {
        this.controls.menu.hide();
        this.dialog.update(title, contents, buttons);
        this.dialog.toggle(true);
    }

    displayConfirmationDialog(options) {
        this._ensureDialog();
        return new Promise((resolve, reject) => {
            const buttons = [
                {
                    text: options.okBtnText || this.msg('ok_btn'),
                    click: async function () {
                        if (options.confirmCallback) {
                            //execute the callback for confirmation
                            try {
                                await options.confirmCallback();
                                resolve(true);
                            } catch (e) {
                                reject(e);
                            }
                        } else resolve(true);
                        this.dialog.toggle(false);
                    }
                },
                {
                    text: options.cancelBtnText || this.msg('cancel_btn'),
                    click: () => {
                        resolve(false);
                        this.dialog.toggle(false);
                    }
                }
            ];
            this.showDialog(options.title, [options.msg], buttons);
        });
    }

    displayErrorAlert(title, contents, closeButtonText) {
        this._ensureDialog();
        return new Promise((resolve, reject) => {
            const buttons = [
                {
                    text: closeButtonText,
                    click: () => {
                        this.dialog.toggle(false);
                        resolve();
                    }
                }
            ];
            this.showDialog(title, contents, buttons);
        });
    }

    /*
     * Show the specified overlay page. Overlay pages differ in that they keep the current page visible behind semi-transparent full-page div
     * @param  {string} page sting of the div id to be shown.
     */
    showOverlayPage(page) {
        $(`#${page},.overlay`).show();
    }

    /*
     * Hide specified overlay page
     * @param  {string} page String of the div id to be hidden
     * @return {boolean}
     */
    hideOverlayPage(page, e) {
        $('.overlay').hide('fade');
        $(`#${page}`).hide('slide', { direction: 'down' });
        e.stopPropagation();
        return false;
    }

    /*
     * Toggles the layouts header that contains the search and the phone menu controls
     */
    toggleHeader(show) {
        this.$('.header')[show ? 'show' : 'hide']();
    }
}

/**
 * Options to specify when creating a PhoneLayout
 * @typedef phoneLayoutOptions
 * @property {string}                       mapDivId   Id of the div where the main map should be created
 * @property {Object<controlDefinition>}    controls   Control definitions, keyed on control name
 * @property {Object<phoneLayoutPageOptions>} extraPages Additional, custom page definitions, keyed on page name.
 *                                                     You can also specify the class to use by including a property "pageClass"
 */

export default PhoneLayout;
