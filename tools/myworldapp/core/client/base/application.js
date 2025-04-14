// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { mapObject, result } from 'underscore';
import myw, { baseUrl } from 'myWorld/base/core';
import { MywClass } from 'myWorld/base/class';
import { EventsMixin } from 'myWorld/base/eventsMixin';
import { getUrlParam } from 'myWorld/base/util';
import { NetworkError } from 'myWorld/base/errors';
import System from 'myWorld/base/system';
import Database from 'myWorld/base/database';
import { latLng } from 'myWorld/base/latLng.js';
import localisation from 'myWorld/base/localisation';
import { RestServer } from 'myWorld/base/restServer';
import { ObjectNotFoundError, UnauthorizedError } from 'myWorld/base/errors';
import { trace as mywTrace } from 'myWorld/base/trace';
import InternetStatusChecker from 'myWorld/base/internetStatusChecker';
import { SelectionMode } from 'myWorld/map/selectionMode';
import GeoMapControl from 'myWorld/map/geoMapControl';
import { FeatureSet } from 'myWorld/features/featureSet';
import { FeatureNavigation } from './featureNavigation';
import { CurrentAlertView } from 'myWorld/controls/notificationsControl/currentAlertView';
import UserLocation from '../userLocation/userLocation';
import { PluginButton } from 'myWorld/base/pluginButton';
import clearImg from 'images/actions/clear.svg';
import nextImg from 'images/actions/next.svg';
import prevImg from 'images/actions/prev.svg';
import { setUserProjection } from 'ol/proj';
import proj4 from 'proj4';
import { register as registerProjections } from 'ol/proj/proj4';

const trace = mywTrace('application');

/**
 * Holds the myWorld application definition. Set it to specify the application to use
 * @type {applicationOptions}
 */
myw.applicationDefinition = null;

const appReadyDefered = {};
myw.appReady = new Promise(resolve => {
    appReadyDefered.resolve = resolve;
});

myw.instantiateApplicationFromEnv = () => {
    const applicationName = $('body').data('myw-application');
    const externalName = $('body').data('myw-external-name');
    const languages = $('body').data('myw-languages').split(',');
    const layoutName =
        $('body').data('myw-layout') || ($(window).width() < 768 ? 'phone' : 'desktop');
    $('body').attr('data-myw-layout', layoutName);

    const user = $('body').data('myw-user');

    // Preserve the user information.
    myw.currentUser = {
        username: user || 'none',
        autoLogin: false
    };

    localisation.init(['myw.client'], { languages, baseUrl });

    myw.instantiateApplication({
        applicationName: applicationName,
        externalName: externalName,
        layoutName: layoutName
    }).catch(reason => {
        console.warn(reason);
        alert(reason);
    });
};

/**
 * Instantiates the application when prerequistes are completed
 *
 * To be redefined if the application to instantiate has other/more prerequisites
 * @param  {applicationOptions}     options  Additional options to be merged with applicationDefinition
 * @return {Promise} Promise that will be resolved once the application has been instantiated
 */
myw.instantiateApplication = options => {
    const appDef = myw.applicationDefinition;
    const ApplicationClass = appDef.Application || Application;
    const Server = appDef.Server || RestServer; //allows server class to be extended for extra controllers (core only)
    let system = options.system;
    let server, documentReadyPromise;

    if (myw.app) {
        //second or later instantiation
        myw.app.unmount();
        myw.appReady = new Promise(resolve => {
            appReadyDefered.resolve = resolve;
        });
    }

    options = { ...appDef, ...options };

    if (!system) {
        const { credentials, headers, maxConcurrentRequests } = options;
        server = new Server({ credentials, headers, maxConcurrentRequests });
        system = new System(server);
    }

    documentReadyPromise = new Promise(resolve => {
        //resolve when the DOM is ready.
        $(document).ready(() => {
            resolve();
        });
    });

    setUserProjection(appDef.userProjection ?? 'EPSG:4326');

    return Promise.all([documentReadyPromise, system.initialized]).then(() => {
        myw.app = new ApplicationClass(system, options);
        myw.app.ready.then(app => {
            appReadyDefered.resolve(app);
        });
        return myw.app;
    });
};

/**
 * Represents the myWorld client application.
 * Acts as an Event bus for communication between components.
 * @fires selection-started
 * @fires query-started
 * @fires currentFeatureSet-changed
 * @fires currentFeature-changed
 * @fires featureCollection-modified
 * @fires overlays-changed
 * @fires overlayState-changed
 * @fires currentFeature-deleted
 * @fires internetStatus-changed
 * @fires googleMapsApi-loaded
 * @fires new-map
 * @fires nativeAppMode-changed
 * @fires nativeApp-sync-complete
 * @fires user-notification
 * @fires application-mode-changed
 * @fires local-notification
 * @fires map-interaction-dialog-opened
 * @fires map-interaction-dialog-closed
 */
export class Application extends MywClass {
    static {
        this.include(EventsMixin);
        this.prototype.isHandheld = false;

        this.mergeOptions({
            GeoMapControl,
            homeLocation: 'index',
            internetStatusIntervalCheck: false
        });
    }

    /**
     * Creates an application instance based on an application definition and applies the layout to the DOM
     * @param  {System} system            To provide system services and configuration details
     * @param  {applicationOptions} options Definition of the application to instantiate
     * @constructs
     * @fires selection-started
     * @fires query-started
     * @fires currentFeatureSet-changed
     * @fires currentFeature-changed
     * @fires featureCollection-modified
     * @fires overlays-changed
     * @fires overlayState-changed
     * @fires currentFeature-deleted
     * @fires internetStatus-changed
     * @fires googleMapsApi-loaded
     * @fires new-map
     * @fires nativeAppMode-changed
     * @fires user-notification
     * @fires application-mode-changed
     * @fires local-notification
     */
    constructor(system, options) {
        super();
        this.setOptions(options);

        this.app = this;
        this.name = options.applicationName;

        /** Provides access to system information
         * @type {System} */
        this.system = system;

        /** Map control for the main map view
         * @type {GeoMapControl} */
        this.map = null;

        /** Current UI Layout of the application
         * @type {DesktopLayout|PhoneLayout} */
        this.layout = null;

        /** Provides access to datasources
         * @type {Database} */
        this.database = new Database(system, this.name);

        /** The currently selected feature
         * @type {Feature} */
        this.currentFeature = null;
        /** The current Feature Set of the application
         * @type {FeatureSet} */
        this.currentFeatureSet = new FeatureSet();

        /** Whether the application is connected to the internet or not
         * @type {boolean} */
        this.hasInternetAccess = undefined;

        /** If true, whenever the current feature is set, it will be opened in edit mode on the details control
         * @type {boolean} */
        this.editMode = false;

        /** If true, the softKeyboardInput will be used for the controls that enable it while using a touch (non iOS)
         * @type {boolean} */
        this.useSoftKeyboardInput = true;

        /** Application plugins. Keyed on plugin id
         * @type {object} */
        this.plugins = {};

        /** Provides access to user/device's location
         * @type {UserLocation}
         */
        this.userLocation = new UserLocation(this);

        this.externalName = this.localise(options.externalName) || this.name;

        /** The number of days left until this replica expires (only used in native app)
         * @type {int} */
        this.timeUntilExpiry = 1000;

        this.featureNavigation = new FeatureNavigation(this);

        this.app.on('highlight-feature', e => {
            this.map.highlightFeature(e.feature);
        });

        this.app.on('unhighlight-feature', e => {
            this.map.unHighlightFeature(e.feature);
        });

        this._useTouchStyles = myw.isTouchDevice;

        // Used for status bar display
        this._tagStack = [];
        this._tagList = [];

        this.logoAction = options.logoAction || { label: 'Home', action: this.home.bind(this) }; //default actions is home

        this.system.registerErrorHandler(reason => {
            if (reason.code == 401) {
                this.message(this.msg('timeout_msg'), 3000);
                document.location.href = `login?message=${encodeURIComponent(
                    this.msg('timeout_msg')
                )}`;
            } else {
                throw reason;
            }
        });

        trace(1, 'initializing');

        //  Registers any additional required coordinate reference systems
        const additionalCRS = system.settings['core.additionalCRS'] ?? {};
        for (let [crsName, crsDef] of Object.entries(additionalCRS)) {
            proj4.defs(crsName, crsDef);
        }
        if (Object.keys(additionalCRS).length) registerProjections(proj4);

        /** Promise to be fullfilled when the application is ready -
         * Layout and its controls are ready and all plugins have been initialized <br/>
         * Resolves to self
         * @type {Promise<Application>} */
        this.ready = Promise.resolve(this._initializeAsync(options));
    }

    async _initializeAsync(options) {
        await this.loadInitialState();
        await this.initLayout(options.layoutName, options.layoutEl);
        this.registerUserEventHandlers();
        this.handleUrlParameters();
        await this.database.initialized;
        this.system.usageMonitor.init(); //don't need to wait on it calls on it wait themselves

        this._internetStatusChecker = new InternetStatusChecker(this);

        //register for unload only after everything is ready to avoid saving state
        //when the application is still loading
        const saveStateOnUnload = !options.ignoreLocalState;
        if (saveStateOnUnload)
            $(window).on('unload', () => {
                this.saveState(false);
                this.map.setTarget(null);
            });

        trace(1, 'ready');
        this.system.consumeLicence(this.name, myw.isNativeApp ? 'anywhere' : 'core');
        return this;
    }

    /**
     * Determines if touch styles should be used, assuming device has touch capabilites
     * @type {boolean}
     */
    get useTouchStyles() {
        return myw.isTouchDevice && this._useTouchStyles;
    }

    set useTouchStyles(enabled) {
        this._useTouchStyles = enabled;
        this.map?.toggleZoomSlider(this.map?.getDivElement(), !enabled);
        this.layout.setTouchStyles?.(enabled);
    }

    /**
     * Initializes the layout, plugins and controls
     * @param  {string} layoutName
     * @param  {string} [layoutEl]  Element to render the layout on. Defaults to body of the page
     * @return {Promise}            Resolved when initializations are finished
     */
    async initLayout(layoutName, layoutEl) {
        const layoutDefinition = this.options.layouts[layoutName],
            Layout = layoutDefinition.layoutClass,
            layoutOptions = Object.assign(layoutDefinition, this.getInitialState('layout'), {
                el: layoutEl || 'body',
                GeoMapControl: this.options.GeoMapControl,
                useTouchStyles: this._useTouchStyles
            });

        this.layout = new Layout(this, layoutOptions);

        const map = await this.layout.initialized;
        trace(2, 'layout initialized');
        this.setMap(map);
        //ensure localization is ready before proceeding with plugins and controls
        //ENH: for performance, this should be done in each component that needs it...
        await myw.localisation.ready;
        trace(2, 'localisation ready');
        await this.database.initialized;
        await this.initPlugins();
        trace(2, 'plugins ready');
        await this.setInitialMapView();
        trace(2, 'initial map view set');

        // initialize controls, which may depend on plugins (ex: to include buttons from plugins)
        await this.layout.initControls();
        trace(2, 'controls ready');
    }

    /**
     * Instantiates plugins specified in self's application definition. </br>
     * A plugin can define the 'ready' property to be a promise to resolve when the plugin is
     *     ready for the app initialization to proceed
     * @return {Promise}            Resolved when plugins are ready to proceed
     */
    initPlugins() {
        const plugins = this.options.plugins;
        const readyPromises = [];
        const pluginsState = this.getInitialState('plugins');
        const errorHandler = (pluginName, reason) => {
            console.warn(`Plugin '${pluginName}' failed to become ready:`, reason);
        };
        for (const [key, pluginDef] of Object.entries(plugins)) {
            try {
                const pluginState = pluginsState?.[key];
                const plugin = this.initPlugin(pluginDef, pluginState, myw.isNativeApp);
                if (!plugin) continue;
                let pluginReady = plugin.ready;
                if (pluginReady) {
                    pluginReady = pluginReady.catch(errorHandler.bind(null, key));
                    readyPromises.push(pluginReady);
                }
                this.plugins[key] = plugin;
            } catch (e) {
                console.warn(`Error initializing plugin '${key}':${e.stack}`);
            }
        }
        return Promise.all(readyPromises);
    }

    /**
     * Instantiates a plugin
     * @param {Class|Array} pluginDef The plugin class or an array where the first element is the plugin class and the second is the options for the plugin
     * @param {object} pluginState    Options to be used with the plugin for example the last saved state of the plugin
     * @param {boolean} isNativeApp
     * @returns {Plugin}
     */
    initPlugin(pluginDef, pluginState, isNativeApp) {
        const isOnlineApp = !isNativeApp;
        const settings = this.system.settings;
        let PluginClass;
        let args = [this];

        if (pluginDef instanceof Array) {
            PluginClass = pluginDef[0];
            //extract options object and execute function values passing in db settings
            const options = mapObject(pluginDef[1], val =>
                typeof val == 'function' ? val(settings) : val
            );
            args.push(options, ...pluginDef.slice(2));
        } else {
            PluginClass = pluginDef;
        }

        if (!PluginClass) return; //code only in nativeApp

        const useInOnlineApp = PluginClass.forOnlineApp !== false;
        const useInNativeApp = PluginClass.forNativeApp !== false;
        //check if plugin should be instantiated in this environment (either online or native app)
        if ((isNativeApp && !useInNativeApp) || (isOnlineApp && !useInOnlineApp)) return;

        if (pluginState) {
            let options = args[1] || {};
            options = Object.assign(options, pluginState); //state overrides application defined options
            args[1] = options;
        }

        //get a constructor that already includes the arguments
        const plugin = new PluginClass(...args);
        return plugin;
    }

    localise(text, missing_language_text) {
        return this.system.localise(text, missing_language_text);
    }

    /*
     * for backwards compatibility
     */
    unmount() {
        return this.remove();
    }

    /**
     * remove the application and clear event listeners
     */
    remove() {
        this._internetStatusChecker?.stopInternetStatusCheck();
        this.app.layout.remove();
        for (let plugin of Object.values(this.plugins)) {
            if (typeof plugin.remove == 'function') plugin.remove();
        }
        delete this.app;
    }

    /**
     * Sets the main map of the application
     * Fires 'new-map'
     * @param {GeoMapControl} map
     */
    setMap(map) {
        if (this.map !== map) {
            this.map = map;
            this.fire('new-map', { map, owner: this });
            this.fire('new-geo-map', { map });
        }
    }

    /**
     * Get all currently visible maps
     * @returns {Array<MapControl>}
     */
    getMaps() {
        let maps = [this.map];
        const internalMaps = this.plugins.internals?.getVisibleMaps() ?? [];
        maps.push(...internalMaps);
        return maps;
    }

    /**
     * Displays a message to the User
     * @param {string} html        HTML message to display
     * @param {number}displayTime in miliseconds
     * @param {number}fadeTime    in miliseconds
     */
    message(html, displayTime, fadeTime, panel) {
        if (this.isHandheld) {
            this.messageForPhoneLayout(html);
            return;
        }

        const _displayTime = displayTime || 2000;
        const _fadeTime = fadeTime || 2000;
        let messageId;
        let contentId;

        if (panel === 'layers') {
            messageId = '#layers_panel_message';
            contentId = '#left-content_layers_tab-space';
        } else if (panel === 'details') {
            messageId = '#details_panel_message';
            contentId = '#left-content_details_tab-space';
        } else if (panel === 'bookmark') {
            messageId = '#bookmark_dialog_message';
            contentId = '#bookmark-list';
        } else {
            messageId = '#message';
            contentId = '#right-content';
        }

        $(messageId)
            .html(html)
            .show()
            .css({
                filter: 'alpha(Opacity=85)',
                left: `${$(contentId).width() / 2 - $(messageId).width() / 2}px`,
                top: `${$(contentId).height() / 2 - $(messageId).height() / 2}px`
            });

        setTimeout(() => {
            $(messageId).fadeOut(_fadeTime);
        }, _displayTime);
    }

    /**
     * Show a popup with the supplied message for 2 seconds and then disappear
     * @param  {string} html  Message to show the user
     */
    messageForPhoneLayout(html) {
        if (!this.currentAlertView) {
            this.currentAlertView = new CurrentAlertView();
        }
        if (html) this.currentAlertView.updateAndShow(html);
    }

    /**
     * Called we are starting some work associated with a tag; put the provided HTML onto the command line.
     *
     * Note that there can be any number of 'statusBusy' calls with the same tag provided that they are matched with the
     * same number of statusDone calls. The provided HTML is also stored to redisplay if subsequent work has completed before
     * all of the work with this tag has been.
     *
     * This scheme below handles complex sequences of 'Busy' and 'Done' where work is done asynchronously and a number
     * of 'workers' might be doing the same task. For example, rendering of the map with vector layers - there may be multiple
     * layers being rendered and multiple queries being run asynchronously. Some layers might complete before others or be aborted
     * if the user moves the map. In this case, we want the user name restored when all vector rendering has completed and no sooner
     * regardless of how the user moves the map around.
     *
     * @param {String} tag  Tag to associate
     * @param {String} html  HTML to show
     */
    statusBusy(tag, html) {
        if (!this._tagList[tag]) {
            this._tagList[tag] = { html: html, cnt: 0 };
        }
        this._tagList[tag].cnt += 1;

        this._tagStack.push(tag);

        $('#user').html(`<span>${html}</span>`).show();
    }

    /**
     * Called when we have done some work associated with this tag.
     * @param {String} tag  Tag that we are done with.
     */
    statusDone(tag) {
        this._tagList[tag].cnt -= 1;

        // We are done with this tag so clear it out.
        if (this._tagList[tag].cnt === 0) {
            delete this._tagList[tag];
            this._tagStack = this._tagStack.filter(s => s != tag);

            if (this._tagStack.length > 0) {
                //  Restore the top of the stack to the status bar (this might be no change)
                tag = this._tagStack[this._tagStack.length - 1];
                const html = this._tagList[tag].html;

                $('#user').html(`<span>${html}</span>`).show();
            } else {
                // Otherwise put the user name/logout link back on
                $('#user').html('');
                this.layout?.addFooterInfo?.();
            }
        }
    }

    /**
     * alert the user with a dialog box containing an error message
     * @param  {string} html html containg the message itself
     */
    errorAlertMessageToUser(html, panel) {
        let messageId, contentId;

        if (panel === 'details') {
            messageId = '#details_panel_message';
            contentId = '#left-content_details_tab-space';
        } else {
            messageId = '#message';
            contentId = '#right-content';
        }

        // Display the provided HTML message
        $(messageId)
            .html(html)
            .show()
            .css({
                filter: 'alpha(Opacity=95)',
                left: `${$(contentId).width() / 2 - ($(messageId).width() / 2 + 20)}px`,
                top: `${$(contentId).height() / 2 - $(messageId).height() / 2}px`
            });

        $(messageId).append(
            `<div class='content-centered'><button class = 'button small' id = 'cancelAlert'>${this.msg(
                'ok_btn'
            )}</button></div>`
        );
        $('.button').button();

        $(document).on('click', '#cancelAlert', () => {
            $(messageId).fadeOut(500);
        });
    }

    /**
     * Get the url specified parameter with a given name
     * @param  {string} name name of the parameter
     * @return {string}      Parameter value
     */
    getUrlParam(name) {
        return getUrlParam(name);
    }

    /**
     * Processes the url parameters and acts accordingly <br/>
     * map view parameters are handled in setInitialMapView
     */
    handleUrlParameters() {
        this.handleUrlParamForPlugins();
        this.handleSelectionFromParam();
        this.handleLayersFromParam();
        this.handleDeltaFromParam();
    }

    /**
     * Uses the feature from the URL and makes it the current feature
     */
    async handleSelectionFromParam() {
        const sParam = this.getUrlParam('s');
        if (sParam) {
            const urn = decodeURIComponent(sParam);
            this.fire('selection-started');
            await this.database.initialized;
            const feature = await this.database.getFeatureByUrn(urn).catch(reason => {
                this.setCurrentFeatureSet([]);
                this.message(this.msg('missing_feature', { id: urn }));
                console.warn(reason);
            });
            if (!feature) return;

            const internals = this.plugins.internals;
            if (internals)
                internals.handleUrlParameterForInternals(this.getUrlParam('internals'), feature);
            //ENH: Merge this with handleUrlParamForPlugins() method.
            //Doing that breaks the switch template behaviour, since the internals plugin isn't loaded when that code runs.
            this.setCurrentFeature(feature, { zoomTo: !this.getUrlParam('ll') });
        }
    }

    /**
     * If the URL contains a param related to a plugin, calls setStateFromAppLink() on the plugin.
     */
    handleUrlParamForPlugins() {
        //Looks through all the plugins to see if they have anything to add to the map link
        for (const [name, plugin] of Object.entries(this.app.plugins)) {
            const pluginParam = this.app.getUrlParam(name);
            if (pluginParam.length > 0) plugin.setStateFromAppLink?.(pluginParam);
        }
    }

    /**
     * Processes the layers url parameter, turning on the visibility for the specified layers
     */
    handleLayersFromParam() {
        if (this.getUrlParam('layers').length) {
            const layersString = this.getUrlParam('layers'),
                // Create an array of visible layers from the ',' delimited layerString
                visibleLayers = layersString.split(',');

            this.map.layerManager.setLayersVisibility(visibleLayers);
        }
    }

    /**
     * Processes the delta url parameter, setting the delta to the suppplied param if the application has the required plugin
     */
    handleDeltaFromParam() {
        if (this.getUrlParam('delta').length) {
            const delta = decodeURIComponent(this.getUrlParam('delta'));
            //Set delta
            this.setDelta(delta);
        }
    }

    /**
     * Registers application-wide user event handlers:         */
    registerUserEventHandlers() {
        this.map.setInteractionMode(new SelectionMode(this.map));
    }

    /**
     * Obtain definitions of layers available to self
     * @return {Promise<Array<layerDefinition>>} Promise for the layer definitions
     */
    getLayersDefs() {
        //database caches the request
        return this.system.getStartupInfo(this.name).then(results => results.layers);
    }

    /**
     * Sets the current feature of the application
     * currentFeatureSet will also be changed unless the keepFeatureSet parameter is used
     * @param {Feature} feature              The feature to set as the current
     * @param {object}  options              The feature to set as the current
     * @param {boolean} [options.zoomTo=false]          Whether to zoom to the feature or not
     * @param {boolean} [options.keepFeatureSet=false]  Whether currentFeatureSet should be kept (or should become [theFeature]).
     * @param {boolean} [options.edit]       If given, the feature will be displayed in corresponding (view or edit) mode. If missing, app's edit mode will be considered
     * @fires currentFeature-changed
     */
    setCurrentFeature(feature = null, options = {}) {
        if (options !== undefined && typeof options !== 'object')
            throw new Error(`Invalid arguments to setCurrentFeature. Check 6.0 release notes`);
        const { zoomTo = false, keepFeatureSet = false, edit } = options;

        if (keepFeatureSet) {
            return this._setCurrentFeature(feature, { zoomTo, notify: true, edit });
        } else {
            const featureSet = feature ? [feature] : [];
            return this.setCurrentFeatureSet(featureSet, { currentFeature: feature, zoomTo, edit });
        }
    }

    /**
     * Sets the current feature set to be FEATURES
     * @param {Array<Feature>|FeatureSet} features   list of features to use as the new current set
     * @param {object}   [options]
     * @param {Feature}  [options.currentFeature]  Feature to set as the new current feature. If provided should be an element of FEATURES
     * @param {boolean}  [options.zoomTo=false]    Whether to zoom to the new currentFeature
     * @param {boolean}  [options.edit]            If given, the feature will be displayed in corresponding (view or edit) mode. If missing, app's edit mode will be considered
     * @param {object}   [options.queryDetails]    Object containing current query details. To be used by FeatureNavigation
     * @returns {Promise}
     * @fires currentFeature-changed
     * @fires currentFeatureSet-changed
     */
    async setCurrentFeatureSet(features, options = {}) {
        //clear current set first.
        const { currentFeature, queryDetails, zoomTo = false, edit } = options;
        //handle overloading of features argument
        const featureSet = Array.isArray(features) ? new FeatureSet(features) : features;
        if (!Array.isArray(features)) features = featureSet.items;

        this.currentFeatureSet = featureSet;
        this._currentQueryDetails = queryDetails;

        if (features.length > 0) {
            if (currentFeature) {
                await this._setCurrentFeature(currentFeature, { notify: true, zoomTo, edit });
            } else {
                await this._setCurrentFeature(null);
                this.fire('currentFeatureSet-changed');
            }
        } else {
            await this._setCurrentFeature(null, { notify: true });
        }
    }

    /**
     * Sets the current filtered feature set
     * @param {Array<urns>}    List of filtered urns
     */
    setCurrentFeatureSetFilter(urns) {
        this.currentFeatureSet.setFilteredItems(urns);
        this.fire('currentFeatureSet-filtered');
    }

    /**
     * Sets the current feature
     * @param {Feature} feature      The feature to set as the current
     * @param {object}   [options]
     * @param {boolean}  [options.notify=false]  Whether a notification should be sent
     * @param {boolean}  [options.zoomTo=false]  Whether to zoom to the feature or not. Defaults to false
     * @param {boolean}  [options.edit]          If given, the feature will be displayed in corresponding (view or edit) mode. If missing, app's edit mode will be considered
     * @returns {Promise}
     * @private
     */
    _setCurrentFeature(feature, options = {}) {
        const { notify = false, zoomTo = false, edit } = options;
        this.prevCurrentFeature = this.currentFeature;
        this.currentFeature = feature;

        if (feature && !feature.isNew) {
            // don't create a feature rep for a new feature
            // Load all of the display properties for the feature
            return feature
                .ensure(['simple', 'display_values', 'calculated'], true)
                .then(() => {
                    if (this.currentFeature !== feature) return null; //can happen if a subsequent call has resolved first

                    if (notify) this.fire('currentFeature-changed', { feature, zoomTo, edit });

                    return null;
                })
                .catch(error => {
                    if (error instanceof ObjectNotFoundError || error instanceof UnauthorizedError)
                        return this.message(this.msg('missing_object_error'));
                    //unexpected
                    throw error;
                });
        } else {
            //this is fired even if the feature hasn't really changed so that listeners
            // can know that the operation has finished
            if (notify) this.fire('currentFeature-changed', { feature, zoomTo, edit });
            return Promise.resolve();
        }
    }

    /**
     * Clears any currently selected features
     */
    clearResults() {
        this.fire('selection-cleared');
        this.app.setCurrentFeatureSet([]);
    }

    /**
     * Returns the map feature representation of the currentFeature
     */
    getCurrentFeatureRep() {
        if (this.currentFeature) {
            return this.map.getFeatureRepFor(this.currentFeature);
        }
    }

    /**
     * Check feature editability conditions implemented by plugins for this application
     *
     * These plugins have to be previously registered with the application and need to then <br/>
     * implement the following method: <br/>
     * <b>isFeatureEditable: (featureType, feature) => {...}  </b><br/>
     *
     * @param {string} featureType  feature type
     * @param {Feature} feature     (Optional) Feature being evaluted
     * @returns {boolean}
     */

    isFeatureEditable(featureType, feature) {
        let outcome = true;
        for (const plugin of Object.values(this.plugins)) {
            if (plugin.isFeatureEditable) {
                outcome = outcome && plugin.isFeatureEditable(featureType, feature);
            }
            if (!outcome) return outcome;
        }
        return outcome;
    }

    /**
     * Check if the current user has permission, in the application, for a given right
     * @param  {string} right           Name of the right to check for
     * @param  {string} appName         Name of the application
     * @return {Promise<boolean>}       Promise for whether the current user has permission or not
     */
    userHasPermission(right) {
        return this.system.userHasPermission(right, this.name);
    }

    /**
     * Sets the current online status (ie. is connected to the internet) of the application
     * @param  {boolean} hasInternetAccess Whether the application should think it's online or not
     */
    setInternetStatus(hasInternetAccess) {
        if (this.hasInternetAccess !== hasInternetAccess) {
            const hadInternetAccess = this.hasInternetAccess;
            this.hasInternetAccess = hasInternetAccess;
            this.fire('internetStatus-changed', {
                hasInternetAccess: hasInternetAccess,
                hadInternetAccess: hadInternetAccess
            });
        }
    }

    /**
     * Gets the delta on the myworld datasource if possible
     * @returns {string} name of the delta
     */
    getDelta() {
        const ds = this.getDatasource('myworld');
        return ds ? ds.getDelta() : '';
    }

    /**
     * Sets the database to use a view for the given delta
     * @param {string} delta name of the delta
     * @returns {Promise<boolean>} true if succeeded
     */
    async setDelta(delta) {
        const ds = this.database.getDatasource('myworld');
        await ds.initialized;
        if (ds.delta === delta) return false;

        let owner;
        if (delta) {
            //ensure delta owner exists
            owner = await ds.getFeatureByUrn(delta).catch(reason => {
                console.warn(
                    `Failed to set delta to '${delta}' due to missing owner (${reason.message})`
                );
            });
            if (!owner) return false;
        }

        trace(2, `Setting delta to '${delta}'`);

        ds.delta = delta;

        this.fire('database-view-changed', { delta, owner });
        return true;
    }

    /**
     * Returns datasource to perform geocoding operations
     * Datasource can be specified via 'addressDatasource' setting, otherwise, the datasource
     * for the current basemap will be used
     * @returns {IGeocoder} */
    getGeocoder() {
        const dsName = this.system.settings['core.addressDatasource'];
        let ds;
        if (dsName) ds = this.getDatasource(dsName);
        else {
            const basemap = this.map.getCurrentBaseMap();
            ds = basemap?.datasource;
        }

        if (!ds || !ds.geocode) return undefined;

        return ds;
    }

    /**
     * Performs an address search by calling geocode method on the geocoder plugin
     * The results will be processed by the handleAddressSearchResults callback
     * @param  {string|autoCompleteResult} searchTextOrAcSuggestion The address text or an autocomplete result. Will be passed on to the geocoder
     */
    async doAddressSearch(searchTextOrAcSuggestion) {
        const geocodeBounds = this.map.getBounds();
        const geocoder = this.getGeocoder();
        if (!geocoder) return;

        this.fire('query-started');

        if (typeof searchTextOrAcSuggestion == 'string') {
            searchTextOrAcSuggestion = searchTextOrAcSuggestion.replace(/&/, 'and');
        }

        const features = await geocoder
            .geocode(searchTextOrAcSuggestion, geocodeBounds)
            .catch(reason => {
                console.warn('Geocode request failed with: ', reason);
                this.app.message(this.msg('address_search_error', { msg: reason.message }));
                return [];
            });
        this.handleAddressSearchResults(features);
    }

    /**
     * Handles the result of an address search, setting the results as the current feature set with appropriate
     * mouse event handlers
     * @param  {Array<GeocodeFeature>} features
     */
    handleAddressSearchResults(features) {
        this.setCurrentFeatureSet(features);

        // if there is one feature, zoom to it, if there are multiple choices include all of them in the map bounds
        if (features.length === 1) {
            this.map.zoomTo(features[0]);
        } else {
            this.map.fitBoundsToFeatures(features);
        }
    }

    /**
     * Returns an external datasource instance
     * @param  {object}     name    Name of datasource
     * @return {IDatasource}
     */
    getDatasource(name) {
        return this.database.getDatasource(name);
    }

    /**
     * Obtains the mode used by nativeApp. Either 'local' or 'master'.
     *   Only used in NativeApp enviroment
     * @return {string}
     */
    getNativeAppMode() {
        return this.database.nativeAppMode;
    }

    /**
     * Switches native app mode.
     * Will ask the user for login credentials if necessary
     * @param {string} mode 'local' or 'master'
     */
    setNativeAppMode(mode) {
        if (mode === this.getNativeAppMode()) return; //no change

        return this.database
            .setNativeAppMode(mode)
            .then(() => {
                //success, inform other components (layers)
                this.fire('nativeAppMode-changed');
            })
            .catch(reason => {
                //some datasource is not logged in
                console.warn(reason);
                if (reason == 'cancelled') {
                    //user cancelled login, do nothing
                } else if (reason instanceof NetworkError) {
                    this.message(this.msg('login_network_error'));
                } else {
                    this.message(reason);
                }
            });
    }

    /**
     * Returns a URL to access the application at its current state. <br/>
     * This state includes zoom, center, current feature and active layers. <br/>
     * It also includes state returned by plugins that implement the getStateForAppLink method. <br/>
     * Plugins that want to include information in generated URLs should implement the getStateForAppLink
     * @param {boolean} forNativeApp  If true, the url will have the myworld protocol so it can be opened
     *                                by the native app if installed on the device opening the url
     * @return {string} Url with the current state of the application
     */
    getAppLink(forNativeApp) {
        let url;
        let queryString = this.getUrlQueryString();

        if (forNativeApp) {
            url = `myworld://${this.name}`;
            queryString = `base64Params=${btoa(unescape(encodeURIComponent(queryString)))}`;
        } else {
            url = this.getUrl();
        }

        if (queryString) url += `?${queryString}`;

        return url;
    }

    /**
     * Returns the current state of the application as a query string component of a URL<br/>
     * See getAppLink for further details
     * @return {string}
     */
    getUrlQueryString() {
        const center = this.map.getCenter();
        const basemap = this.map.getCurrentBaseMapName();
        const currentFeature = this.currentFeature;
        const delta = this.getDelta();
        const params = {
            ll: `${center.lat.toFixed(7)},${center.lng.toFixed(7)}`,
            z: this.map.getZoom(),
            s: currentFeature?.getUrn(),
            layers: this.map.getCurrentLayerIds().join(','),
            basemap,
            delta
        };

        //Looks through all the plugins to see if they have anything to add to the map link
        Object.entries(this.plugins).forEach(([name, plugin]) => {
            try {
                const state = plugin.getStateForAppLink();
                if (state) params[name] = state;
            } catch (e) {
                console.warn(`Error getting Link parameter from plugin '${name}'`, e.stack);
            }
        });

        return new URLSearchParams(
            Object.entries(params).filter(([key, val]) => Boolean(val))
        ).toString();
    }

    /**
     * Sets initial map view with the details returned by 'getInitialMapView'
     */
    setInitialMapView() {
        return this.getInitialMapView().then(mapView => {
            //set the base map before setting the view, as it will trigger callbacks that may use this property
            this.map.initialBaseMapName = mapView.basemapName;
            //this should make the map ready (triggering a call to map's whenReady callbacks)
            this.map.setView(latLng(mapView.center), mapView.zoom);

            return null;
        });
    }

    /**
     * Returns the map state with which to initiate a myWorld session <br/>
     * Can be from: url parameters,  previously state saved or from the saved home bookmark
     * @return {Promise<mapState>}
     */
    async getInitialMapView() {
        const llParam = this.getUrlParam('ll');
        const savedMapState = this.getInitialState('map');

        //start with view from url params
        const params = {
            center: llParam && latLng(llParam.split(',')[0], llParam.split(',')[1]),
            zoom: parseInt(this.getUrlParam('z'), 10),
            basemapName: decodeURIComponent(this.getUrlParam('basemap'))
        };
        const valid = coord => coord?.lat && coord.lng;

        if (!(valid(params.center) && params.zoom && params.basemapName)) {
            //some of the view definition is missing
            //try filling values in from saved state
            if (savedMapState) {
                for (const [key, value] of Object.entries(params)) {
                    if (savedMapState[key] && !value) {
                        params[key] = savedMapState[key];
                    }
                }
            }
        }
        if (!(valid(params.center) && params.zoom && params.basemapName)) {
            //some of the view definition still missing
            //fill in from home bookmark
            const bookmark = await this.getHomeBookmark();
            if (!valid(params.center)) params.center = latLng(bookmark);
            if (!params.zoom) params.zoom = bookmark.zoom;
            if (!params.basemapName) params.basemapName = bookmark.map_display.split('|')[0];
        }
        return params;
    }

    /**
     * Record functionality usage
     * @param  {string} operation
     */
    recordFunctionalityAccess(operation) {
        this.system.recordFunctionalityAccess(this.name, operation);
    }

    /**
     * Record data usage
     * @param  {string} operation
     */
    recordDataAccess(operation) {
        this.system.recordDataAccess(this.name, operation);
    }

    /**
     * @returns {bookmark} the home bookmark or a default one
     */
    getHomeBookmark() {
        //ENH: cache the bookmark we get?
        return this.system.getBookmarkByTitle('home').then(
            bookmark => bookmark,
            error => {
                if (error.name !== 'ObjectNotFoundError') {
                    console.warn(error);
                }

                //no home bookmark, return one that shows the whole world
                return {
                    lat: 0.17578097424708533,
                    lng: 10.986328125,
                    zoom: 3,
                    map_display: ''
                };
            }
        );
    }

    /**
     * Sets the main map view back to the initial center and zoom level
     */
    homeView() {
        const map = this.map;
        this.getHomeBookmark().then(bookmark => {
            map.useBookmark(bookmark);
        });
    }

    /**
     * Directs the browser to the myWorld home page
     */
    async home() {
        if (this.map.isGeomDrawMode()) {
            //if user has selected a feature want to display confirmation close message
            const featureTitle =
                this.app.currentFeature._myw.title ||
                this.app.currentFeature.featureDD.external_name;
            const confirmed = await this.confirmCloseDialog(featureTitle);
            if (!confirmed) return;
        }

        const canClose = await this.confirmClose();
        if (canClose) {
            //options.homeLocation can also be a function, which may do the redirection by itself
            let homeLocation = result(this.options, 'homeLocation');
            if (homeLocation) {
                const lang = this.getUrlParam('lang');
                if (lang) homeLocation += `?lang=${lang}`;
                window.location.href = homeLocation;
            }
        }
    }

    /**
     * When logo is clicked whilst feature is selected, open dialog to confirm closing
     */
    confirmCloseDialog(featureTitle) {
        return new Promise(resolve => {
            myw.dialog({
                title: this.msg('close_title'),
                contents: this.msg('close_content', {
                    featureTitle
                }),
                buttons: {
                    Cancel: {
                        text: '{:cancel_btn}',
                        click: function () {
                            this.close();
                            resolve(false);
                        }
                    },
                    OK: {
                        text: '{:ok_btn}',
                        class: 'primary-btn',
                        click: function () {
                            this.close();
                            resolve(true);
                        }
                    }
                }
            });
        });
    }

    /**
     * Closes the application by directing the browser to the home page. <br/>
     * Informs plugins that the application is closing by invoking 'teardown'. <br/>
     * Plugins can prevent the closing by returning false
     */
    confirmClose() {
        let promise = Promise.resolve(true);

        //call plugin.applicationClosing() sequentially to avoid potentially raising multiple messages to the user
        Object.values(this.plugins).forEach(plugin => {
            promise = promise.then(confirmed => {
                if (!confirmed) return false;
                else return plugin.applicationClosing();
            });
        });
        return promise.catch(reason => {
            console.warn(`Close prevented with rejection:${reason}`);
            return false;
        });
    }

    /**
     * Stores the details of the current query
     * The current query is the last query to have been executed
     * @param  {queryDefinition}        queryDef
     * @param  {queryOptions}           options
     * @param  {Array<DDFeature>}   result
     */
    saveCurrentQueryDetails(queryDef, options, result) {
        if (queryDef) {
            this._currentQueryDetails = {
                def: queryDef,
                options: options,
                result: result,
                limit: queryDef.limit,
                count: result.length,
                totalCount: result.totalCount,
                offset: result.offset
            };
        } else {
            this._currentQueryDetails = null;
        }
    }

    /**
     * Obtains the details of the current query (latest to execute)
     * @return {queryDetails}
     */
    getCurrentQueryDetails() {
        return this._currentQueryDetails;
    }

    /**
     * Sets the mode the application to be the given Plugin
     * If there is an current mode disable() is called on corresponding plugin
     * @param  {Plugin} plugin
     * @fires  application-mode-changed
     */
    setApplicationMode(plugin) {
        if (this.applicationMode && this.applicationMode !== plugin) {
            this.applicationMode.disable();
            this.fire('application-mode-changed', { plugin });
        }
        this.applicationMode = plugin;
    }

    /**
     * Sets if edit mode should be used when the current feature changes
     * If there is a current feature it will be shown in the new mode
     * @param {boolean}       enabled
     * @param {Array<string>} [featureTypes=null]  List of feature type names to which edit mode will apply
     *                                             If the list is blank, edit mode will not apply on any features
     *                                             If the featureTypes arg is not sent, edit mode will apply on all features
     */
    setEditMode(enabled, featureTypes = null) {
        this.editMode = enabled;
        this.editModeFeatures = featureTypes;
        //force editor to refresh so it uses the new mode
        if (this.currentFeature) this.setCurrentFeature(this.currentFeature);
    }

    /**
     * Returns the default display mode for the given feature type
     * @param {string} featureType
     * @returns {string} 'edit' or 'view'
     */
    displayModeFor(featureType) {
        const { editMode, editModeFeatures } = this;

        if (!editMode || !featureType) return 'view';
        else if (!editModeFeatures) return 'edit';
        else if (editModeFeatures.length === 0) return 'view';
        else if (editModeFeatures.includes(featureType)) return 'edit';
        else return 'view';
    }

    /**
     * Sets if the softKeyboardInput should be used or not
     * @param {boolean}  enabled
     */
    setSoftKeyboardInputMode(enabled) {
        this.useSoftKeyboardInput = enabled;
    }

    /**
     * Invoked when the application is being closed (browser closes page or goes to a different one) <br/>
     * Saves application state (in localStorage or equivalent) so it can be restored in the next session
     * @param  {boolean} [persist=false]     Whether state should persist for use in other machines/browsers
     * @param  {boolean} [asDefault=false]   Whether the state should be saved as a system default(for all users)
     *                                       It's only relevant when persist is true
     * @return {Promise}
     */
    saveState(persist = false, asDefault = false) {
        const state = {};

        //save map state
        state.map = this.map.getState();

        if (!state.map) return Promise.reject(new Error(`Invalid or incomplete map state`)); // Leave so we don't override any existing saved state

        //save layout's state
        if (this.layout.getState) state.layout = this.layout.getState();

        //save plugins state
        const pluginsState = this.getInitialState('plugins'); //initialise to original state so we don't lose info if a plugin failed to initialise
        const sharedPluginsState = {};
        Object.entries(this.plugins).forEach(([key, plugin]) => {
            let state;
            try {
                state = plugin.getState();
            } catch (error) {
                console.warn(`Error getting state from plugin '${key}: `, error);
            }
            if (!state) return;

            if (plugin.statePerApp !== false) pluginsState[key] = state;
            else {
                //state for this plugin is shared across applications. only save in sharedPluginsState
                sharedPluginsState[key] = state;
                delete pluginsState[key];
            }
        });
        state.plugins = pluginsState;

        return Promise.all([
            this.system.saveSharedState({
                plugins: sharedPluginsState,
                timeUntilExpiry: this.timeUntilExpiry
            }),
            this.system.saveApplicationState(this.name, state, persist, asDefault)
        ]);
    }

    /**
     * Loads saved state for this (user,application) from browser's local storage or database
     * State can then be obtained by subsequent calls to getInitialState()
     * @return {Promise}
     */
    loadInitialState() {
        const ignoreBrowserSavedState =
            this.getUrlParam('localstate') == 'false' || this.options.ignoreLocalState;
        return this.getSavedState(ignoreBrowserSavedState).then(applicationState => {
            this._initialState = applicationState || {};
            trace(3, 'initial state loaded');
        });
    }

    /**
     * Loads saved state for this (user,application) from browser's local storage or database
     * State can then be obtained by subsequent calls to getInitialState()
     * @return {Promise<state>} Promise for the application's state
     */
    getSavedState(ignoreBrowserSavedState, ignoreCache) {
        const cachePropName = ignoreBrowserSavedState ? '_savedDbState' : '_savedState';

        if (!this[cachePropName] || ignoreCache) {
            this[cachePropName] = Promise.all([
                this.system.getSavedApplicationState(this.name, ignoreBrowserSavedState),
                this.system.getSavedSharedState(ignoreBrowserSavedState)
            ]).then(([appState, sharedState]) => {
                appState.plugins = { ...appState.plugins, ...sharedState.plugins };
                this.timeUntilExpiry = sharedState.timeUntilExpiry || 1000;
                return appState;
            });
        }

        return this[cachePropName];
    }

    /**
     * Obtains the saved state for a given control
     * @return {Promise<object>} Promise for the control's state
     */
    getSavedStateFor(control, ignoreBrowserSavedState, ignoreCache) {
        const findControl = (controlToFind, controls, states) => {
            if (!states) return;

            for (const [controlKey, aControl] of Object.entries(controls)) {
                const aControlState = states[controlKey];

                if (control == aControl) return aControlState;

                const childControls = aControl.getChildControls?.();
                if (childControls) {
                    const found = findControl(controlToFind, childControls, states);
                    if (found) return found;
                }
            }
        };
        return this.getSavedState(ignoreBrowserSavedState, ignoreCache).then(appState => {
            const controlsState = appState.layout?.controlsState;
            return findControl(control, this.layout.getChildControls(), controlsState);
        });
    }

    /**
     * Returns the initial state to use for a given key
     * @param  {string} key
     * @return {object}
     */
    getInitialState(key) {
        return this._initialState[key];
    }

    /**
     * Url that provides access to self (current application)
     * @return {string} Ex: http://cam2gismw6/myworld/standard.html
     */
    getUrl() {
        return window.location.href.split('?', 2)[0];
    }

    /**
     * Fires 'user-notification'
     * @param  {notification} notification Notification object with the state info and messages from a plugin/control
     */
    notifyUser(notification) {
        this.fire('user-notification', notification);
    }

    /**
     * Fires 'local-notification'
     */
    localNotification(notification) {
        this.fire('local-notification', notification);
    }

    /**
     * Fires 'native-notification'
     * @param {object} notification
     * @param {string} notification.title
     * @param {string} notification.body
     */
    nativeNotification(notification) {
        this.fire('native-notification', notification);
    }

    /**
     * Used by tast framework to determine if broswe is running selenium - if so return true else return false
     * @private
     */
    _isRunningSelenium() {
        if (window.localStorage.getItem('test_suite') === 'selenium') return true;
        else return false;
    }

    /**
     *  Used by tests to update the user projection.
     *  @param {ProjectionLike} projection The user projection.
     */
    setUserProjection(projection) {
        setUserProjection(projection);
    }
}

class ClearResultsButton extends PluginButton {
    static {
        this.prototype.id = 'clear-results';
        this.prototype.className = 'clear-results';
        this.prototype.imgSrc = clearImg;
        this.prototype.titleMsg = 'clear_button_title';
    }

    action() {
        this.app.recordFunctionalityAccess('core.details_tab.clear');
        this.app.clearResults();
    }
}

class NavButton extends PluginButton {
    constructor(...args) {
        super(...args);
        this.nav = this.app.featureNavigation;
        //setup handlers for application events
        this.app.on(
            'currentFeature-changed currentFeatureSet-changed currentFeature-deleted nativeAppMode-changed',
            this.setButtonState.bind(this)
        );

        this.setButtonState();
    }
}

class PrevResult extends NavButton {
    static {
        this.prototype.id = 'results-back';
        this.prototype.className = 'inactive';
        this.prototype.imgSrc = prevImg;
        this.prototype.inactiveImgSrc = prevImg;
        this.prototype.titleMsg = 'go_back';
    }

    action() {
        if (this.$el.hasClass('inactive')) return;
        this.nav.updateResults('previous');
        this.app.recordFunctionalityAccess('core.details_tab.previous');
        this.setButtonState();
    }

    /* Updates the state/style of the button */
    setButtonState() {
        this.setActive(this.nav.queryStack.hasUnDo());
    }
}

class NextResult extends NavButton {
    static {
        this.prototype.id = 'results-forward';
        this.prototype.className = 'inactive';
        this.prototype.imgSrc = nextImg;
        this.prototype.inactiveImgSrc = nextImg;
        this.prototype.titleMsg = 'go_forward';
    }

    action() {
        if (this.$el.hasClass('inactive')) return;
        this.app.recordFunctionalityAccess('core.details_tab.next');
        this.nav.updateResults('next');
        this.setButtonState();
    }

    /* Updates the state/style of the button */
    setButtonState() {
        this.setActive(this.nav.queryStack.hasReDo());
    }
}

Application.prototype.buttons = {
    clearCurrentSet: ClearResultsButton,
    prevResult: PrevResult,
    nextResult: NextResult
};

// Describe events

/**
 * Fired when a selection request has been initiated so the UI can update
 * @event selection-started
 */

/**
 * Fired when a query request has been initiated so the UI can update
 * @event query-started
 */

/**
 * Fired when the features in currentFeatureSet have changed. Not fired if the currentFeature has changed as well
 * @event currentFeatureSet-changed
 */

/**
 * Fired when the current feature of the application has changed
 * @event currentFeature-changed
 */

/**
 * Fired when the current feature has been deleted
 * @event currentFeature-deleted
 */

/**
 * Fired when features have been inserted/deleted.
 * @event featureCollection-modified
 * @property changeType:    {string} One of: 'insert', 'update', 'delete'
 * @property featureType:   {string} feature type
 * @property feature:       {DDFeature} Feature which has been modified
 */

/**
 * Fired when one or several layers have changed state (checked, visible, enabled)
 * @event overlayState-changed
 */

/**
 * Fired when the list of available overlays has changed (layers added or removed from list)
 * @event overlays-changed
 * @property layer: {Layer} feature type
 */

/**
 * Fired when the application has detected a change in the ability to access the internet. Requires internetAccess plugin
 * @event internetStatus-changed
 * @property hasInternetAccess: {boolean} Whether there is access to the internet or not
 */

/**
 * For the situation where the application without internet access, this is fired when the google maps api becomes available
 * @event googleMapsApi-loaded
 */

/**
 * Fired when the main map is recreated. Happens during initialization and when switching templates in the Print Layout
 * @event new-geo-map
 * @property map: {GeoMapControl}
 */

/**
 * Fired when a map is (re)created. Happens during initialization, when switching templates in the Print Layout and when internal maps are created
 * @event new-map
 * @property map: {MapControl}
 */

/**
 * Fired (from SyncDownloadPlugin) when a background sync has completed
 * @event nativeApp-sync-complete
 */

/**
 * Fired from plugins (ex internet status) when they want to notify the user about a change in their state
 * Other components can then listen on these and create context appropriate UI's to inform the user
 * @event user-notification
 * @type {notification}
 */

/**
 * Fired when the application mode is changed by a plugin
 * @event application-mode-changed
 */

/**
 * Fired when a dialog (ex FeatureSetSelectionDialog) opens and needs to interact with the map
 * @event map-interaction-dialog-opened
 * @property force: {boolean} Whether to force the hiding regardless of the editor width
 */

/**
 * Fired when a dialog (ex FeatureSetSelectionDialog) is closed and does not need map interation anymore
 * @event map-interaction-dialog-closed
 */

/**
 * Specifies the components of the application
 * @typedef applicationOptions
 * @property {string} applicationName       Name of the application
 * @property {string} externalName          External name of the application
 * @property {string} layoutName            Name of the layout to apply
 * @property {Object<string,layoutDefinition>} layouts          Layout instances keyed on layout name ("desktop", "phone" and "print")
 * @property {Object<string,pluginDefinition>} [plugins]          Plugin classes/definitions keyed on plugin name
 * @property {string}             [layoutEl]            Element to render the layout on. Defaults to body of the page
 * @property {Class}              [Application]      {@link Application} or a subclass
 * @property {Class}              [Server=RestServer] A class that implements IServer
 * @property {Class}              [GeoMapControl]    {@link GeoMapControl} or a subclass
 * @property {System}         [system]          Pre created system instance to use instead of creating one
 * @property {object}             [credentials]   If supplied a login request will be sent as part of initialization
 * @property {action}             [logoAction]      Allow customization of the behaviour when the user clicks the logo
 * @property {boolean}            [internetStatusIntervalCheck=false]   Whether to do a regular check of internet connection status or not
 * @property {Array<string>}      [mapContextMenuActions]  List of actions to include in the map context menu (right click menu)
 *                                                              Three possible formats: '-' (separator), '<mapActionName>', '<pluginId>.<pluginActionName>'
 * @property {boolean}            [ignoreLocalState=false]  If true, the state saved in the browser/device will be ignored
 * @property {object}             [headers]    Headers to include in Ajax requests to the myWorld server. ex: for custom authentication engines
 * @property {number}             [maxConcurrentRequests]  Maximum number of concurrent requests to the server. Defaults to 5
 */

/**
 * Either the plugin class or an array where the first element is the class and the remaning elements are the parameters that will be passed on to the constructor
 * @typedef {Class|Array} pluginDefinition
 */

/**
 * An Action to be executed when handling a user event
 * @typedef action
 * @property {string}      label   Label to show the user (if there are several possible actions)
 * @property {Function}    action  Function to execute
 */

/**
 * Specifies a layout. <br/>
 * Additional properties will be passed on to the Layout constructor in the options parameter
 * @typedef layoutDefinition
 * @property {Class}                      layoutClass   Layout class to use. Should implement {@link ILayout}
 * @property {string}                     mapDivId      Id of dom element to place the map on
 * @property {Object<controlDefinition>}  controls      Controls to include in the layout
 */

/**
 * Interface that Layout classes have to implement. <br/>
 * @class ILayout
 * @param {Application} options.app             Application instance
 * @param {Class}           options.GeoMapControl   Class to use when instantiating the geographical map
 */
/**
 * @member {Promise<GeoMapControl>} ILayout#initialized   To be resolved with the map when the layout is ready
 */
/**
 * Instantiates the controls and setups user event handlers
 * @function
 * @name  ILayout#initControls
 * @return {Promise} To be resolve when all the controls have been instantiated and initialized
 */

/**
 * Either the Control class or an array where the first element is the class and the remaning elements are the parameters that will be passed on to the constructor
 * @typedef {Class|Array} controlDefinition
 */

/**
 * A search auto-complete suggestion
 * @typedef autoCompleteResult
 * @property {string}      label   Text of a suggestion to present to the user
 * @property {string}      value   Normalized text of the suggestion
 * @property {string}      type    One of: geocode, query, bookmark, feature_search, coordinate, feature
 * @property {object}      data    Suggestion details
 */

/**
 * Specifies the plugin state and notification messages that the plugin wants to communicate to the user
 * @typedef notification
 * @property {Plugin}           plugin           The plugin firing the event
 * @property {jqueryElement}        icon             Icon element to signify the state of the plugin
 * @property {string}               stateLabel       Label to signify the state of the plugin
 * @property {string}               [message]        Message to show to the user in a fading pop-up (for notificationType: 'alert')
 * @property {Array<notificationMessage|string>} [activeMessages] List of currently active messages to show the user in the messagesPopover (used by the internetStatus plugin to show datasource problems)
 * @property {string}               [title]          Title that represents the messages (Used by the notifications controller on the messages popover)
 * @property {string}               [onClick]        Event handler for the click action on the icon. Default event handler toggles the notifications popover.
 */

/**
 * Notification message which can either contain a title and description or can be just a string
 * If the message is an object with a title, an alert icon is displayed after the title.
 * @typedef notificationMessage
 * @property {string}    title         Message title to show in the messagesPopover
 * @property {string}    description   Message description to show in the messagesPopover when the message title is clicked
 */

export default Application;
