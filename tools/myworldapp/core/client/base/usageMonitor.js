// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { trace as mywTrace } from 'myWorld/base/trace';
import EventsMixin from './eventsMixin';
import * as Browser from './browser';

const trace = mywTrace('usageMonitor');

/**
 * @class Provides an api to track client usage. </br>
 * Usage stats are collected for the life of the session (1 day) or logout before being reset. </br>
 * Stats are serialised/deserialised into localstorage between page refreshes and transmission. </br>
 * @extends {MywClass}
 */
export class UsageMonitor {
    static {
        Object.assign(this.prototype, EventsMixin);
    }

    /**
     * @param   {System}  system
     * @constructs
     */
    constructor(system) {
        this.name = 'usageMonitor';

        this.system = system;

        this.levels = { licence: 0, functionality: 1, data: 2 };

        this.config = null; //default config from server

        this.session = null; //current users usage session

        this.unsavedSessions = [];

        this.isDirty = false; //A flag for indicating if we have actions to send

        this.initialized = new Promise(resolve => {
            this._initResolve = resolve;
        });
    }

    /**
     * Initialise for usage monitoring
     * @returns {Promise} resolves when usage monitor is initialized
     */
    init() {
        return this._init(this.system)
            .then(() => this._initResolve(true))
            .catch(e => {
                console.log(`Usage Monitor Disabled: ${e.message}`);
                if (!['No current user', 'No config defined'].includes(e.message))
                    console.log(e.stack);
            });
    }

    /**
     * Record usage
     * @param  {string|number} level
     * @param  {string} action
     */
    async log(level, application, action) {
        const ready = await this.initialized.catch(() => false); //not initialized - ignore
        if (!ready) return; //not initialized - ignore

        if (Date.now() > this.session?.expiry) {
            trace(1, 'Session resolution expired');
            //start new session
            this._createNewSession();
        }

        const validLevel = this._getLevel(level);
        if (validLevel != null && validLevel <= this.config.level)
            this._appendAction(application, `${level}.${action}`);
        this.isDirty = true;
    }

    async _init(system) {
        if (!myw.currentUser) throw new Error('No current user');

        const state = (await this.system.getSavedSharedState()) ?? {};
        const { usageMonitor: usageMonitorState } = state;

        const config = await this._getUsageMonitorSettings(system, usageMonitorState);

        trace(1, 'Usage Monitor config:', JSON.stringify(config));
        //Get usageMonitor state from localstorage
        if (!config.active) {
            trace(1, 'Usage Monitor disabled by configuration');
            return;
        }

        if (!state) return;

        this.unsavedSessions = usageMonitorState?.unsavedSessions ?? [];

        //ENH: check expiry value from config
        if (Date.now() < usageMonitorState?.session?.expiry) {
            trace(1, `Using existing session ${JSON.stringify(usageMonitorState.session)}`);
            this.session = usageMonitorState.session;
        } else {
            this._createNewSession();
        }

        this._sendUsage();
        //Register timer to post data periodically
        this._registerHandlers();
        return true;
    }

    async _getUsageMonitorSettings(system, usageMonitorState) {
        let config;
        try {
            config = await system.getUsageMonitorSettings();
        } catch (error) {
            //use configuration saved in local storage
            config = usageMonitorState?.config ?? {
                active: true,
                level: 1,
                update_interval_mins: 5,
                resolution_hours: 24
            };
        }
        if (!config) throw new Error('No config defined');

        this.config = config; // note that config will be saved local storage, so that it can be used in future when offline (e.g. native app)
        return config;
    }

    _createNewSession() {
        if (this.session) {
            //store unsaved session
            this.unsavedSessions.push(this.session);
        }

        const now = new Date();
        const expiry = new Date();
        expiry.setSeconds(expiry.getSeconds() + this.config.resolution_hours * 60 * 60);

        const session = {
            created_at: now.getTime(),
            expiry: expiry.getTime(),
            client: this._getBrowser(),
            actions: {}
        };

        // include core license usage on the new session
        const licenseId = myw.isNativeApp ? 'licence.anywhere' : 'licence.core';
        if (myw.app) session.actions[myw.app.name] = { [licenseId]: 1 };

        trace(1, `Creating new session ${JSON.stringify(session)}`);
        this.isDirty = true;
        this.session = session;
    }

    async _sendUsage() {
        if (!this.isDirty) return;

        const { session } = this;

        if (Date.now() > session?.expiry) {
            trace(1, 'Session resolution expired');
            //start new session
            this._createNewSession();
        }

        try {
            for (const unsavedsession of this.unsavedSessions) {
                // eslint-disable-next-line no-await-in-loop
                await this._sendSessionUsage(unsavedsession);
                this.unsavedSessions.splice(0, 1);
            }
            await this._sendSessionUsage(session);

            this.isDirty = false;
            this.fire('usageMonitor-persist', true);
            trace(1, 'Post complete');
        } catch (e) {
            //send to server unavailable probably offline on Anywhere
            //save state to localstorage to avoid losing session info
            trace(6, 'Failed to send session usage to server:', e);
        }
    }

    async _sendSessionUsage(session) {
        trace(3, 'Posting actions to server:', JSON.stringify(session));
        if (session.id) return this.system.updateUsageMonitorSession(session.id, session.actions);

        //session not registered with server yet
        const result = await this.system.createUsageMonitorSession(session);

        trace(3, 'Obtained id for session:', JSON.stringify(result));
        session.id = result.id;
    }

    /**
     * Lookup a level by name or value
     * @param  {string|number} level
     * @return {number}
     */
    _getLevel(level) {
        if (isNaN(level)) {
            const selected = this.levels[level];
            if (null != selected) return selected;
            throw new Error('level not defined');
        }

        for (const current of Object.values(this.levels)) {
            if (current === parseInt(level)) return current;
        }

        throw new Error('usage level not defined');
    }

    /**
     * Called when application closes
     * @return {object}
     */
    getState() {
        const { session, unsavedSessions, config } = this;
        return { session, unsavedSessions, config };
    }

    _appendAction(applicationName, action) {
        let application = this.session.actions[applicationName] || {};
        let count = application[action] || 0;
        count++;
        application[action] = count;
        this.session.actions[applicationName] = application;

        const notification = { applicationName, action, count };
        this.fire('usageMonitor-log', notification);
        trace(1, 'new operation:', JSON.stringify(notification));
    }

    _registerHandlers() {
        this.sendTimer = setInterval(
            this._sendUsage.bind(this),
            this.config.update_interval_mins * 60000
        );

        if (window) {
            window.onbeforeunload = this._onBeforeUnload.bind(this);
        }
    }

    _onBeforeUnload() {
        this._sendUsage();
        //this handler should not return a value
    }

    _getBrowser() {
        if (myw.isNativeApp) {
            const platform = Browser.apple ? 'iOS' : Browser.android ? 'Android' : 'Electron';
            return `Anywhere ${platform}`;
        }
        if (Browser.edge) return 'Edge';
        if (Browser.chrome) return 'Chrome';
        if (Browser.safari) return 'Safari';
        if (Browser.gecko) return 'Firefox';
        return 'Unknown';
    }
}
