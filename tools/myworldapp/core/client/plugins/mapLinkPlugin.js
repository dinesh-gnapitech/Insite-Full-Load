// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import { Plugin, PluginButton } from 'myWorld-base';
import { android, isTouchDevice } from 'myWorld/base/browser';
import { Control } from 'myWorld/controls';
import mapLinkHtml from 'text!html/mapLink.html';
import bwip from 'bwip-js';
import linkImg from 'images/toolbar/link.svg';

const generateQRData = function (url) {
    const canvas = document.createElement('canvas');
    bwip.toCanvas(canvas, {
        bcid: 'qrcode',
        text: url,
        scale: 2
    });
    return canvas.toDataURL('data/png');
};

export class MapLinkPlugin extends Plugin {
    static {
        this.mergeOptions({
            generateNativeAppLink: false, //Used by the 'Copy link' button
            displayCoreLink: true,
            displayNativeAppLink: false,
            displayTextQRToggle: true,
            displayMode: 'text',
            useShare: true
        });
    }

    /**
     * @class Functionality to generate/send links with the current state of the application<br/>
     * Adds a button to the toolbar to access a dialog which allows the user copy or send a link with the current state of the map/application
     * @param  {Application} owner    The application
     * @param  {mapLinkOptions}  options
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
    }

    /**
     * Shows the map link window.
     */
    showDialog() {
        this.coreLink = this.app.getAppLink();
        this.nativeAppLink = this.app.getAppLink(true);

        if (this.app.isHandheld) {
            const overlay = this.app.layout.pages.mapLink.show();
            overlay.on('click', '.email_link_btn', () => {
                this._shareLinks();
            });
            this._updateHandheldLayoutQRCodes(overlay);
        } else {
            if (!this.linkDialog) {
                //Add the html for the maplink dialogue
                this.linkDialog = new MapLinkDialog(this, {
                    displayCoreLink: this.options.displayCoreLink,
                    generateNativeAppLink: this.options.generateNativeAppLink,
                    displayNativeAppLink: this.options.displayNativeAppLink,
                    displayTextQRToggle: this.options.displayTextQRToggle,
                    displayMode: this.options.displayMode
                });
            }
            this.linkDialog.open(this.coreLink, this.nativeAppLink);
        }
    }

    getState() {
        return {
            displayMode: this.linkDialog ? this.linkDialog.options.displayMode : 'text'
        };
    }

    supportsShare() {
        return this.options.useShare && typeof navigator.share == 'function';
    }

    /**
     * Creates a message message with the configured links and then shares it
     * Share is either done via navigator.share if supported or via mailto: protocol
     * Closes the dialog
     * @private
     */
    async _shareLinks() {
        const emailSubject = this.msg('email_subject');
        let emailBody;

        if (!this.options.generateNativeAppLink) {
            emailBody = this.msg('email_body', { url: this.coreLink.replace(/ /g, '%20') });
        } else if (!this.options.displayCoreLink) {
            emailBody = this.msg('email_body', { url: this.nativeAppLink.replace(/ /g, '%20') });
        } else {
            const coreLinkMsg = this.msg('core_link_msg') + this.coreLink.replace(/ /g, '%20');
            const nativeAppLinkMsg =
                this.msg('native_app_link_msg') + this.nativeAppLink.replace(/ /g, '%20');
            emailBody = `${this.msg('email_msg')}
${coreLinkMsg}
${nativeAppLinkMsg}`;
        }

        if (this.supportsShare()) {
            await navigator.share({ text: emailBody });
        } else {
            //open email
            window.location.href = `mailto:someone@example.com?subject=${encodeURIComponent(
                emailSubject
            )}&body=${encodeURIComponent(emailBody)}`;
        }
        this.close();
    }

    _updateHandheldLayoutQRCodes(overlay) {
        const body = overlay.find('.overlay-body');
        body.empty();

        const container = $('<span class="map-link-phone-container"/>');
        body.append(container);

        if (this.options.displayCoreLink) {
            //  Core
            const core = new MapLinkBox({ owner: this, app_type: 'core', mode: 'qr' });
            container.append(core.$el);
            core.updateLink(this.coreLink);
        }

        if (this.options.displayNativeAppLink) {
            //  Native
            const native = new MapLinkBox({ owner: this, app_type: 'native', mode: 'qr' });
            container.append(native.$el);
            native.updateLink(this.nativeAppLink);
        }

        if (!this.options.displayCoreLink || !this.options.displayNativeAppLink) {
            container.find('.map-link-header').hide();
        }
    }

    /**
     * Close the map link UI
     */
    close() {
        if (this.app.isHandheld) this.app.layout.pages.mapLink.close();
        else this.linkDialog.close();
    }
}

class MapLinkDialog extends Control {
    static {
        this.prototype.id = 'link-panel';
        this.prototype.className = 'panel';
    }

    /*
     * @class Creates a dialog with the link provided and adds it to the HTML body
     * @param  {object}            options
     * @param  {MapLinkPlugin} options.owner           The application
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(owner, options) {
        super(owner, options);
        this.owner = owner;
        // this.options = options;
        this.render();
    }

    render() {
        //Add the html for the maplink dialogue
        this.$el.appendTo('body');

        const shareButtonMsgId = this.owner.supportsShare() ? 'share_btn' : 'email_btn';
        const buttons = {
            Close: {
                text: this.owner.msg('close_btn'),
                click: function () {
                    $(this).dialog('close');
                }
            }
        };

        if (this.options.displayTextQRToggle) {
            buttons['Toggle'] = {
                text: this._buttonText(),
                click: e => {
                    this._onModeSwapClick();
                }
            };
        }

        buttons['Copy'] = {
            text: this.owner.msg('copy_link'),
            class: 'copy_link_btn',
            click: e => {
                this.copyLinkToClipboard(e);
            }
        };

        buttons['Share'] = {
            text: this.owner.msg(shareButtonMsgId),
            class: 'email_link_btn primary-btn',
            click: () => {
                this.owner._shareLinks();
            }
        };

        if (this.options.displayCoreLink && !this.coreLinkBox) {
            this.coreLinkBox = new MapLinkBox({
                owner: this.owner,
                app_type: 'core',
                mode: this.options.displayMode
            });
            this.$el.append(this.coreLinkBox.$el);
        }
        if (this.options.displayNativeAppLink && !this.nativeAppLinkBox) {
            this.nativeAppLinkBox = new MapLinkBox({
                owner: this.owner,
                app_type: 'native',
                mode: this.options.displayMode
            });
            this.$el.append(this.nativeAppLinkBox.$el);
        }

        if (!this.options.displayNativeAppLink || !this.options.displayCoreLink) {
            this.$('.map-link-header').hide();
        }

        this.$el.dialog({
            modal: true,
            autoOpen: false,
            minWidth: 480,
            position: { my: 'center', at: 'top+193', of: window },
            title: this.owner.msg('maplink_title'),
            closeText: this.owner.msg('close_tooltip'),
            buttons
        });

        if (isTouchDevice && android) {
            //Allows 'x' (in the draggable titlebar) click to work on android touch devices
            this.$el
                .dialog('widget')
                .find('.ui-dialog-titlebar-close')
                .mousedown(() => {
                    this.$el.dialog('close');
                });
        }
    }

    /*
     * Opens the dialog and updates the textarea with the link supplied
     */
    open(coreLink, nativeAppLink) {
        this.$el.dialog('open');
        this.coreLink = coreLink;
        this.nativeAppLink = nativeAppLink;

        this.coreLinkBox?.updateLink(coreLink);
        this.nativeAppLinkBox?.updateLink(nativeAppLink);
    }

    close() {
        this.$el.dialog('close');
    }

    /*
     * Adds the links(based on the configured options) to a temporary div and selects them (so they can be copied to clipboard)
     */
    _selectLink() {
        if (window.getSelection) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(this.tempDiv[0]);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    /*
     * Copies the link in the textarea to the clipboard
     */
    copyLinkToClipboard(e) {
        e.preventDefault();

        this.tempDiv = $('<div>', { class: 'all-links' }).appendTo(this.$el);
        this.tempDiv.html(`<a href=${this.coreLink}>${this.coreLink}</a>`);

        if (this.options.generateNativeAppLink) {
            this.tempDiv.prepend(this.owner.msg('core_link_msg'));
            this.tempDiv.append(
                `</br>${this.owner.msg('native_app_link_msg')}<a href=${this.nativeAppLink}>${
                    this.nativeAppLink
                }</a>`
            );
        }
        // Select the links
        this._selectLink();
        document.execCommand('copy');
        this.tempDiv.remove();
    }

    _onModeSwapClick() {
        this.options.displayMode = this.options.displayMode == 'text' ? 'qr' : 'text';
        this.coreLinkBox?.updateMode(this.options.displayMode);
        this.nativeAppLinkBox?.updateMode(this.options.displayMode);
        //  Update button text
        const buttons = this.$el.dialog('option', 'buttons');
        buttons['Toggle'].text = this._buttonText();
        this.$el.dialog('option', 'buttons', buttons);
    }

    _buttonText() {
        if (this.options.displayMode == 'text') return this.owner.msg('show_qr_btn');
        else return this.owner.msg('show_text_btn');
    }
}

class MapLinkBox extends Backbone.View {
    static {
        this.prototype.template = template($(mapLinkHtml).filter('#map-link-box-template').html());

        this.prototype.events = {
            'click textarea': 'selectLink'
        };
    }

    /*
     * @class Creates a box with a textarea to house the map link
     * @param  {object}        options
     * @param  {MapLinkDialog} options.owner
     * @param  {string}        options.app_link   Either 'core' or 'native'
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        this.options = options;
        this.owner = this.options.owner;
        this.mode = this.options.mode;
        this.render();
    }

    render() {
        this.$el.html(
            this.template({
                app_type: this.owner.msg(this.options.app_type)
            })
        );
        this.updateMode(this.mode);
    }

    /*
     * Event handler for when the users clicks the texarea that has the link
     */
    selectLink() {
        this.$('textarea').select();
    }

    updateMode(mode) {
        this.mode = mode;
        if (this.mode == 'qr') {
            this.$el.find('.core-map-link').hide();
            this.$el.find('.map-link-qr').show();
        } else {
            this.$el.find('.core-map-link').show();
            this.$el.find('.map-link-qr').hide();
        }
    }

    updateLink(url) {
        this.$('textarea').val(url).blur();
        const data = generateQRData(url);
        this.$el.find('.map-link-qr').attr('src', data);
    }
}

MapLinkPlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-mapLink';
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = linkImg;
        }

        action() {
            this.app.recordFunctionalityAccess('core.toolbar.maplink');
            this.owner.showDialog();
        }
    }
};

/**
 * Options to configure the map link functionality
 * @typedef mapLinkOptions
 * @property {boolean}    generateNativeAppLink   Whether to add a link to myWorld native app to the 'email'/'copy to clipboard' option
 * @property {boolean}    displayCoreLink         Whether to show a textbox with the link to the myWorld core application
 * @property {boolean}    displayNativeAppLink    Whether to show a textbox with the link to the myWorld native app
 * @property {boolean}    displayTextQRToggle     Whether to show a button to toggle between showing text or QR codes
 * @property {string}     displayMode      Which display method to default to. Can be either 'text' or 'qr'
 * @property {boolean}    [useShare=true]  If set to false, Web Share API will not be used even if the device supports it. A mailto: url will be used instead. Tip: Could be set to Browser.mobile so that the Web Share API is only used on mobile browsers.
 */

export default MapLinkPlugin;
