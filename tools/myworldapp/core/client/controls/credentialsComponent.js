// Copyright: IQGeo Limited 2010-2023
import myw, { MywClass, msg } from 'myWorld-base';
import { template } from 'underscore';
import $ from 'jquery';
import credentialsComponentFieldHtml from 'text!html/credentialsComponentField.html';
import 'jquery-ui';
import 'jquery-ui-touch-punch';

const credentialsComponentFieldTemplate = template(credentialsComponentFieldHtml);

/**
 * @class Handles UI for getting login credentials
 * for a datasource or server
 *
 */
export class CredentialsComponent extends MywClass {
    constructor(dialog, loginEngine) {
        super();
        this._dialog = dialog;
        this._loginEngine = loginEngine;
    }

    //creates inputs and buttons for the given auth info
    setAuthFields(authOptions) {
        const { user, isSSOAuth, user_readonly, auth_fields } = authOptions;
        let auth_controls = authOptions.auth_controls || [];

        if (user && user_readonly && isSSOAuth) {
            //(native app) dialog for reauthenticating a user who registered via SSO
            //ENH: simplify this, merge with remanining code
            this.setAuthenticatedUsername(user);
            this._addAuthControls(auth_controls || []);
            return;
        }

        if (user && user_readonly && isSSOAuth === false) {
            //(native app) dialog for reauthentication a user who registered without SSO
            //exclude SSO buttons
            auth_controls = [];
        }

        this.empty();
        this._addAuthFields(auth_fields || []);
        this._addAuthControls(auth_controls);
        this._clearFields(user, user_readonly);
        if (user) {
            this._setFocusOnFirstFieldNotUsername();
        }
    }

    //creates an input showing the currently authenticate user name
    setAuthenticatedUsername(username) {
        this.empty();
        this._addAuthFields([
            {
                id: 'user',
                label: 'username',
                type: 'text'
            }
        ]);
        const inputElement = this._elementForId('user');
        inputElement.val(username);
        inputElement.prop('disabled', true);
    }

    /**
     * Sets base url to be used with actions
     * @param {string} url
     */
    setBaseUrl(url) {
        this._baseUrl = url;
    }

    /**
     * Construct the html for the component
     */
    buildHtml() {
        this._componentElement = $('<div/>', {
            id: 'credentials-component'
        });
        return this._componentElement;
    }

    /**
     * Remove all the fields from the component
     */
    empty() {
        this._componentElement.empty();
    }

    /**
     * Returns the credentials set in the component
     */
    getCredentials() {
        const credentials = {};
        this._authFieldIds.forEach(id => {
            const inputElement = this._elementForId(id);
            credentials[id] = inputElement.val();
        });
        return credentials;
    }

    /*
     * Add UI for the user to enter the required credentials
     * @param  {Array<authField>}  authfields  List of auth fields retrieved from server
     */
    _addAuthFields(authFields = []) {
        this._authFieldIds = [];
        authFields.forEach(this._addAuthField.bind(this));
    }

    /*
     * Add UI for a single auth field
     * @param  {authField}  authfield   An auth field
     */
    _addAuthField(authField) {
        const fieldHtml = credentialsComponentFieldTemplate({
            id: authField.id,
            // We get messages for labels from the 'login' message group,
            // not from this class's message group
            label: msg('login', authField.label),
            type: authField.type
        });
        this._componentElement.append(fieldHtml);
        this._authFieldIds.push(authField.id);
    }

    /*
     * Add UI for the user to enter the required credentials
     * @param  {Array<authField>}  authfields  List of auth fields retrieved from server
     */
    _addAuthControls(authControls = []) {
        if (authControls.length) this._componentElement.append($('<br>'));
        for (const authControlSpec of authControls) {
            const { label, type, action, id } = authControlSpec;

            let [labelMessageGroup, labelMessage] = label.split('.');
            if (!labelMessage) {
                labelMessage = labelMessageGroup;
                labelMessageGroup = 'login';
            }
            const translatedLabel = msg(labelMessageGroup, labelMessage);
            const button = $(`
                <div id="login-${label}-control">
                  <input id="login-${id}" class="ui-button" type="${type}" autocapitalize="none" name="${id}" value="${translatedLabel}">
                </div>`);
            button.on('click', async () => {
                let url = this._baseUrl + action;
                url += url.includes('?') ? '&' : '?';
                url += 'bustCache=' + Date.now();

                if (myw.isNativeApp) {
                    const nativeRestServer = this._loginEngine.server;
                    await nativeRestServer.openAuthWindow(url);
                    this._dialog._resolve?.();
                } else {
                    window.open(url);
                }
            });
            this._componentElement.append($(button));
        }
    }

    /*
     * Clear the fields in the dialog. If the 'user' field exists, set its value to
     * the specified user name and set the field editable (or not) based on the
     * specified readonly flag
     * @param  {string}  username   Initial username
     * @param  {boolean} readonly   If true, set the username to be read only
     */
    _clearFields(username, readonly) {
        this._authFieldIds.forEach(id => {
            let value = '';
            const inputElement = this._elementForId(id);
            if (id == 'user') {
                value = username;
                inputElement.attr('disabled', readonly === true);
            }
            inputElement.val(value);
        });
    }

    /*
     * Get the input element corresponding to the specified id
     * @param  {string}  id  Field ID
     */
    _elementForId(id) {
        const inputElementId = `#credentials-${id}`;
        return this._componentElement.find(inputElementId);
    }

    /*
     * Set the focus on the first field which isn't the 'user' field
     */
    _setFocusOnFirstFieldNotUsername() {
        const idRequiringFocus = this._authFieldIds.find(id => id != 'user');
        if (idRequiringFocus) {
            const inputElement = this._elementForId(idRequiringFocus);
            inputElement.focus();
        }
        // else no fields or only username field
    }
}

export default CredentialsComponent;
