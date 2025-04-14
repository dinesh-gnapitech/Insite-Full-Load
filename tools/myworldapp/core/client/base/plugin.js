// Copyright: IQGeo Limited 2010-2023
import Backbone from 'backbone';
import MywClass from './class';

export * from './pluginButton';

/**
 * @class  Use as superclass when creating new (optional) components to include with an application
 * @extends MywClass
 */
export class Plugin extends MywClass {
    static {
        this.include(Backbone.Events);
    }

    /**
     * Defaults to true. Override in subclasses to prevent the plugin from being instantiated when running in myWorld Connected environment.
     * @type {Boolean}
     * @memberof Plugin
     * @static
     */
    static forOnlineApp = true;
    /**
     * Defaults to true. Override in subclasses to prevent the plugin from being instantiated when running in myWorld Anywhere environment.
     * @type {Boolean}
     * @memberof Plugin
     * @static
     */
    static forNativeApp = true;

    /**
     * @param  {Application}     owner   The application
     * @param  {Object}                         options  Options for the plugin configuration
     * @constructs
     */
    constructor(owner, options) {
        super();

        /** The owner component of the plugin, usually an application object but can be another plugin
         * @type {Application|Plugin} */
        this.owner = owner;

        /** The toplevel component - the application object
         * @type {Application} */
        this.app = owner?.app;

        /** Options for the plugin @type {Object} */
        this.setOptions(options);
        /** Alias for the options property @type {Object} */
        this.params = options;
    }

    /**
     * Called when the user acts to go back to the home page. <br/>
     * Override this method in order to do some teardown or state checking before the browser redirects the page. <br/>
     * Returning false to prevent the user from going to the home page.
     * @return {boolean|Promise<boolean>} Whether the application can be closed or it should be prevented
     */
    applicationClosing() {
        return true;
    }

    /**
     * This method is called when the application closes. <br/>
     * Override it to return the plugin's state, which will be saved for a future session. <br/>
     * On the following session, the previously saved state will be passed to the plugin's initialize
     * method in the options argument (merged with options supplied in the application definition)
     * @return {object}
     */
    getState() {
        return undefined;
    }

    /**
     * Called when the application is generating a url with state information <br/>
     * Override in order to include plugin's state in generated urls. <br/>
     * In this case the plugin should also implement setStateFromAppLink
     * @return {string}
     */
    getStateForAppLink() {
        return '';
    }

    /**
     * Called during appplication startup, if there is a parameter for self
     * Called after plugins have been instantiated<br/>
     * Override to set plugin's state from information in a map link<br/>
     * @param  {string}     state
     */
    setStateFromAppLink(state) {}
}
