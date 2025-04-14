// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { escape, matcher } from 'underscore';
import { Plugin } from 'myWorld-base';

export class InternetStatusPlugin extends Plugin {
    static {
        this.mergeOptions({
            showLabel: false //if true shows a label alongside the notification icon
        });
    }

    /**
     * @class Provides the user (and the application) with information about the internet and the datasource connection status.<br/>
     * Adds a background "process" that checks that status. <br/>
     * Adds an image and label to the status bar which will switch colour depending on the internet connection status.
     * Informs the application about any changes in status which will then trigger the internetStatus-changed event.
     * @param  {Application} owner                       The application
     * @param  {object} [options]
     * @param  {object} [options.showLabel=false]            When true, a label will be shown alongside the symbol
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        //ensure the regular check for internet status is on
        this.app.options.internetStatusIntervalCheck = true;
        this._problems = [];

        //handler for when a datasource's status changes
        this.app.database.on('datasourceState-changed', this.handleDatasourceStateChange, this);

        //handler for when the online-status changes
        this.app.on('internetStatus-changed', () => {
            this.handleNetworkChange();
        });
    }

    /**
     * Handles a change to internet/network state
     */
    handleNetworkChange() {
        const noInternetMsg = this.msg('no_internet');
        const noInternetErrorPresent = this._problems.find(p => p.title === noInternetMsg);

        if (!this.app.hasInternetAccess) {
            this.currentProblem = noInternetMsg;

            if (!noInternetErrorPresent) {
                this._problems.push({ title: noInternetMsg });
            }
        } else {
            this.currentProblem = undefined;
            if (noInternetErrorPresent) {
                this._problems = this._problems.filter(problem => problem.title != noInternetMsg);
            }
        }
        this.fireUserNotification();
    }

    /**
     * Handles a change to the state of a datasource, updating the internal state and refreshing the UI
     * Called when a datasource's state changes
     * @param  {object}     event     The object supplied with the event that has the info about the datasource state
     */
    handleDatasourceStateChange(event) {
        const isOk = (this.isCurrentEventStateOK = event.state === 'ok'),
            problem = !isOk && event,
            dsName = event.datasource.getExternalName(),
            isNewProblem = problem && !this._isExistingProblem(event);

        if (isOk || isNewProblem) {
            //new problem or a problem has been fixed. Updates the UI (icon/label and the list)

            //Clear problems for this datasource
            this._problems = this._problems.filter(error => error.title != dsName);
            //Only add it back if its an error
            let item = event;
            if (problem) {
                item = this._createProblemObj(event);

                this._problems.push(item);
                this.currentProblem = item;
            } else {
                this.currentProblem = undefined;
            }

            this.fireUserNotification();
        }
    }

    /**
     * Creates a problem object to be sent to the notification control using the information from the event
     * @param  {object}      event  The object supplied with the event that has the info about the datasource state
     * @return {problemObj}
     * @private
     */
    _createProblemObj(event) {
        const title = event.datasource.getExternalName(),
            desc = event.reason.message ? event.reason.message : escape(event.reason);
        return {
            title: title,
            description: `${this.msg('error')}: ${desc}`
        };
    }

    /**
     * Find out if the event is already registered in this._problems
     * @param  {object}     event     The object supplied with the event that has the info about the datasource state
     * @return {Boolean}              True if the problem already exists in this._problems
     * @private
     */
    _isExistingProblem(event) {
        const problemObj = this._createProblemObj(event);
        return this._problems.find(matcher(problemObj));
    }

    /**
     * Updates the 'traffic light' icon and label and sends it along with this._problems
     */
    fireUserNotification() {
        let iconClass, label;
        if (this.app.hasInternetAccess) {
            iconClass = this._problems.length ? 'datasource_error' : 'online';
            label = 'internet';
        } else {
            iconClass = 'offline';
            label = 'no_internet';
        }

        const stateIcon = $('<span>', { class: iconClass, id: 'internet_status_icon' });
        const stateLabel = this.msg(label);

        this.notifyUser(stateIcon, stateLabel);
    }

    notifyUser(icon, stateLabel) {
        let activeMessages;
        if (!this.currentProblem && this._problems.length === 0) {
            activeMessages = [this.msg('no_issue_detected')];
        } else {
            activeMessages = this._problems;
        }
        const notificationObj = {
            plugin: this,
            icon: icon,
            stateLabel: this.options.showLabel ? stateLabel : '',
            message: this.currentProblem,
            activeMessages: activeMessages,
            title: this.msg('connection_issues')
        };
        this.app.notifyUser(notificationObj);
    }
}

/**
 * Problem object that will be sent to the notification control
 * @typedef problemObj
 * @property {string}  title        Name of the datasource that triggered the problem event
 * @property {string}  description  Describes the problem
 */

export default InternetStatusPlugin;
