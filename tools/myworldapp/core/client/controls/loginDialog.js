// Copyright: IQGeo Limited 2010-2023
import { MywClass, AuthenticationError, NetworkError } from 'myWorld-base';
import $ from 'jquery';
import loginDialogHtml from 'text!html/loginDialog.html';
import 'jquery-ui';
import 'jquery-ui-touch-punch';
import { CredentialsComponent } from 'myWorld/controls/credentialsComponent';

export class LoginDialog extends MywClass {
    static {
        this.prototype.messageGroup = 'LoginDialog';
    }

    /**
     * @class Handles UI for logging into a datasource or server
     *
     * @param  {ILoginEngine} loginEngine Engine providing methods to do the actual logging in (typically a datasource or server object)
     * @param  {object}    options  Options for the dialog
     * Options:
     *   convertErrorToMessage {boolean} When login fails: if this option is false the login promise
     *                                   is rejected with an error; if true, with a string.
     *                                   Defaults to true.
     *
     * @constructs
     */
    constructor(loginEngine, options) {
        super();
        this._loginEngine = loginEngine;
        this.setOptions(options);
    }

    /**
     * Show the login dialog and wait for the user to log in
     * @return {Promise}       Promise will resolve on successful login or fail with an error or 'cancelled' if the user cancels the dialog
     */
    login(username = null, options = {}) {
        return new Promise((resolve, reject) => {
            // ENH: Can this be done is a way that doesn't require
            // storing resolve and reject?
            this._resolve = resolve;
            this._reject = reject;
            this._showDialog();
            this._loginEngine
                .getAuthOptions()
                .then(authOptions => {
                    if (username !== null) {
                        authOptions.user = username;
                    }

                    this._credentialsComponent.setAuthFields(authOptions);
                    this._credentialsComponent.setBaseUrl(this._loginEngine.baseUrl); //for actions

                    // TODO: Set reason from somewhere?
                    let reason;
                    let message = '';
                    if (reason) {
                        message = this.msg(reason);
                    }
                    this._setMessage(message);
                    const buttons = this._dialogElement.dialog('widget').find('button');
                    buttons.button('enable').hide().show(0); //TBR: hide&show is workaround for iOS14.5 behaviour

                    if (authOptions.isSSOAuth) {
                        //if SSO, hide the OK button until the user has selected a login method
                        buttons.last().hide();
                    }
                })
                .catch(this._handleFailure.bind(this));
        }).finally(this._close.bind(this));
    }

    /**
     * Put the dialog on the screen
     * @private
     */
    _showDialog() {
        this._buildHtml();
        this._setMessage(this.msg('contacting_server'));

        const buttons = [];
        buttons.push({
            text: this.msg('cancel_button_label'),
            click: this._handleCancel.bind(this)
        });
        buttons.push({
            disabled: true,
            text: this.msg('ok_button_label'),
            click: this._handleOK.bind(this)
        });

        this._dialogElement.dialog({
            modal: true,
            position: { my: 'top', at: 'top+20', of: window },
            resizable: false,
            autoOpen: true,
            title: this.msg('dialog_title'),
            buttons: buttons,
            classes: { 'ui-dialog': 'no-close-button' }
        });
        this._dialogElement.on('keypress', event => {
            if (event.which == 13) {
                this._handleOK();
            }
        });
    }

    /**
     * Construct the html for the dialog
     * @private
     */
    _buildHtml() {
        this._dialogElement = $(loginDialogHtml);
        this._credentialsComponent = new CredentialsComponent(this, this._loginEngine);
        const componentElement = this._credentialsComponent.buildHtml();
        this._dialogElement.append(componentElement);
    }

    /**
     * Set the message on the dialog
     * @param  {string}  message
     * @private
     */
    _setMessage(message) {
        this._dialogElement.find('#login-message').text(message);
    }

    /*
     * Callback for the OK button
     */
    async _handleOK() {
        const credentials = this._credentialsComponent.getCredentials();
        this._setMessage(this.msg('logging_in'));
        try {
            const res = await this._login(credentials);
            this._resolve(res);
        } catch (error) {
            if (error instanceof AuthenticationError) {
                const message = this.msg('invalid_credentials');
                this._setMessage(message);
            } else if (error.code === 401) {
                const message = this.msg('invalid_credentials');
                this._setMessage(message);
            } else {
                return this._handleFailure(error);
            }
        }
    }

    /*
     * Callback for the Cancel button
     */
    _handleCancel() {
        this._reject('cancelled');
    }

    /*
     * Failure handler
     */
    _handleFailure(error) {
        let rejectionError = error;
        if (this.options.convertErrorToMessage !== false) {
            // Option defaults to true
            rejectionError = this._messageForError(error);
        }
        this._reject(rejectionError);
    }

    _messageForError(error) {
        let message;
        if (error instanceof NetworkError) {
            message = this.msg('network_error');
        } else {
            console.log(error);
            if (error.stack) {
                console.log(error.stack);
            }
            message = this.msg('unexpected_error', { error: error.message });
        }
        return message;
    }

    /**
     * Logs in to the server
     * @return {Promise}
     * @private
     */
    _login(credentials) {
        return this._loginEngine.login(credentials);
    }

    /*
     * Remove the dialog from the UI
     */
    _close() {
        this._dialogElement.dialog('destroy');
    }
}

/**
 * Login engine used by {@link LoginDialog} <br/>
 * This should be an object which has the following methods:
 * - getAuthOptions()
 * - login(credentials)
 * @typedef ILoginEngine
 */

/**
 * Describes an auth field required by the server when logging in
 * @typedef authField
 * @property {string}      id       Identifier of
 * @property {string}      label    Id of the message to use as a label
 * @property {string}      type     (html) type for the input field
 */

export default LoginDialog;
