// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Util, Browser } from 'myWorld-base';
import View from 'myWorld/base/view';

const { android, isTouchDevice } = Browser;
export class Dialog extends View {
    static {
        this.mergeOptions({
            modal: true,
            autoOpen: true,
            noContainerPadding: false,
            width: 'auto',
            resizable: false,
            destroyOnClose: false,
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    click() {
                        this.close();
                    }
                }
            }
        });
    }

    /**
     * @class A UI dialog.
     *        Mixes behaviour of {@link View} with jQuery dialog providing all its configuration capabilities.
     *        For the jQuery dialog's buttons option, the context of the callback is the Dialog instance.
     *        Supports use of messages in configuration. See example below
     *        With default options, dialog is modal and includes a close button.
     *        To be used directly or subclassed.
     *        Can also be used as a factory
     * @example
     *  new Dialog({title: '{:a_message_id}', contents: 'Some information or html'})
     * @example
     * myw.dialog({
     *     title: '{:a_message_id}', contents: 'Some information or html',
     *     buttons: {
     *        OK: {
     *            text : '{:ok_btn}',
     *            class: "primary-btn",
     *            click : function() { someContext.doSomething();}
     *        },
     *        Cancel: {
     *            text  : '{:cancel_btn}',
     *            class : "right",
     *            click : function() { this.close();}
     *        }
     *     }
     *  })
     * @param  {dialogOptions} options
     * @extends {View}
     * @constructs
     */
    constructor(options) {
        super(options);
        this.app = options?.app ?? myw.app;

        this._handleButtonOptions();

        if (!this.options.position && this.app?.isHandheld) {
            this.options.position = { my: 'center', at: 'bottom', of: window, collision: 'fit' };
        }

        this.options.close = () => {
            this.close();
        };

        if (this.options.autoOpen) {
            //Waits for the child's constructor to finish before rendering and opening the dialog
            Util.delay(0).then(async () => {
                await this.render();
                this.open();
            });
        }

        if (this.options.noContainerPadding) {
            this.options.dialogClass = 'no-container-padding';
        }
        $(window).resize(() => {
            this.rePosition();
        });
    }

    /**
     * Makes the dialog visible
     */
    open() {
        if (this.$el.is(':ui-dialog')) this.$el.dialog('open');
        else throw new Error('Dialog not yet initialized. Call render() before opening');
        this.rePosition();
    }

    /**
     * Resize and reposition the dialog
     * @returns {boolean} False if dialog wasn't open
     */
    rePosition() {
        if (!this.$el.is(':ui-dialog')) return false;
        let panelTopPos = this.$el.dialog('widget').offset().top;
        if (panelTopPos < 0) {
            //When the dialog goes off the top edge of the screen
            panelTopPos = 0;
            this.$el.dialog('widget').css({
                top: 0
            });
        }
        this.$el.css({
            'max-height': $(window).height() - panelTopPos - 110,
            'overflow-y': 'auto',
            'overflow-x': 'hidden'
        });
        return true;
    }

    /**
     * Sets a new content for the dialog and renders it
     */
    async setContent(contents) {
        this.options.contents = contents;
        await this.render();
        this.rePosition();
    }

    /**
     * Creates the dialog according to the instance options and applies localisation
     */
    render() {
        //override the autoOpen options as we will deal with it ourselves
        const jQueryDialogOptions = Object.assign({}, this.options, { autoOpen: false });
        this.$el.html(this.options.contents).dialog(jQueryDialogOptions);

        const dialogWidget = this.$el.dialog('widget');
        dialogWidget.find('.ui-dialog-title').addClass('noselect'); //So the title does not get selected on long press on iOS touch devices
        if (isTouchDevice && android) {
            //Allows 'x' (in the draggable titlebar) click to work on android touch devices
            dialogWidget.find('.ui-dialog-titlebar-close').mousedown(() => {
                this.close();
            });
        }
        myw.translate(this, this.$el.dialog('widget'));
    }

    /**
     * Hides the dialog
     * @param {object} options
     * @param {boolean} options.forceDestroy If set, forces the dialog whether to be destroyed or not
     */
    close(options = {}) {
        const { forceDestroy } = options;
        let destroy = this.options.destroyOnClose;
        if (forceDestroy !== undefined) destroy = forceDestroy;
        if (destroy) {
            this.destroy();
        } else {
            this.$el.dialog('close');
        }
    }

    /**
     * Removes the dialog from the DOM
     */
    destroy() {
        this.$el.dialog('destroy');
        this.remove();
    }

    /**
     * Updates the buttons used in the dialog box
     * @param {object} buttons The buttons to show
     */
    setButtons(buttons) {
        this.options.buttons = buttons;
        this._handleButtonOptions();
    }

    //binds button handlers. ensures each instance has it's own copy of options and buttons option
    _handleButtonOptions() {
        if (!Object.prototype.hasOwnProperty.call(this, 'options'))
            this.options = { ...this.options };
        const options = this.options;
        options.buttons = { ...options.buttons };
        const buttons = options.buttons;
        for (const buttonName in options.buttons) {
            buttons[buttonName] = { ...buttons[buttonName] };
            const button = buttons[buttonName];
            for (const propName in button) {
                const value = button[propName];
                if (typeof value == 'function') {
                    button[propName] = value.bind(this);
                }
            }
        }
    }
}

/**
 * Options for {@link Dialog}
 * Extends the options for {@link http://api.jqueryui.com/dialog/} and {@link http://backbonejs.org/#View-constructor} with:
 * For the buttons option, the context of the callback is the Dialog instance.
 * @typedef dialogOptions
 * @property {html}     contents         Dialog body
 */

myw.dialog = options => new Dialog(options);

export default Dialog;
