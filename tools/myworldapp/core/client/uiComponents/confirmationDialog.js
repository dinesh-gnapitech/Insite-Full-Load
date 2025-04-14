// Copyright: IQGeo Limited 2010-2023
import { Dialog } from 'myWorld/uiComponents/dialog';

export class ConfirmationDialog extends Dialog {
    static {
        this.mergeOptions({
            buttons: {
                Cancel: {
                    text: '{:cancel_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                },
                OK: {
                    text: '{:ok_btn}',
                    class: 'primary-btn',
                    click: async function () {
                        const options = this.options;
                        if (options.confirmCallback) {
                            //execute the callback for confirmation
                            try {
                                await options.confirmCallback();
                                this._resolve(true);
                            } catch (e) {
                                this._reject(e);
                            }
                        } else this._resolve(true);
                        this.destroy();
                    }
                }
            }
        });
        this.options = this.prototype.options; // so can be used in constructor before super call
    }

    /**
     * @class A dialog for the user to confirm or cancel an action.
     *        Provides a promise that will be resolved when the action has been performed or when the user chooses to cancel.
     * @param  {dialogOptions} options  Options for a dialog with the addition of:
     * @param  {string} options.msg  Message to include in dialog (alternative to contents)
     * @param  {function} options.confirmCallback Function to execute when the user confirms
     * @param  {string} options.okBtnText  Text for the confirmation button
     * @param  {string} options.cancelBtnText  Text for the cancelation button
     * @example
     *  myw.confirmationDialog({title: 'A title', msg: 'Are you sure?',
            confirmCallback: 
        });
     * @extends {Dialog}
     * @constructs
     */
    constructor(options) {
        const { msg = '' } = options;
        options.contents = msg.replace('\n', '<br/>');
        options = Object.assign({}, ConfirmationDialog.options, options);
        options.buttons = { ...options.buttons };
        options.buttons.OK = { ...options.buttons.OK };
        options.buttons.Cancel = { ...options.buttons.Cancel };
        if (options.okBtnText) options.buttons.OK.text = options.okBtnText;
        if (options.cancelBtnText) options.buttons.Cancel.text = options.cancelBtnText;

        super(options);

        /** Promise for the decision.
         * If the user cancels, resolves to false.
         * If the user confirms, will resolve to true after the confirmCallBack has been executed
         * @type {Promise<boolean>} */
        this.confirmPromise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    close() {
        this._resolve(false);
        this.destroy();
    }
}

/**
 * @typedef confirmDialogOptions
 * @property {string}     title               Title of the dialog
 * @property {string}     msg                 Body content of the dialog
 * @property {string}     [okBtnText]         Label for the OK button. Defaults to ok_btn message
 * @property {string}     [cancelBtnText]         Label for the Cancel button. Defaults to cancel_btn message
 * @property {method}     confirmCallback     Method to execute when the user confirms by pressing the OK button
 */

export const confirmationDialog = options => new ConfirmationDialog(options);

export default ConfirmationDialog;
