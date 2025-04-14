// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { layoutConfiguration } from './layoutConfiguration';
import { resizeDialogToFit } from './resizeDialogToFit';
import { DialogPositionRetainer } from './dialogPositionRetainer';

const _displayErrorAlert = (title, messages, onClose, closeButtonText) => {
    let dialog = $('#error-alert-dialog');
    if (dialog.length === 0) {
        // We need to add the HTML for the dialog
        dialog = $('body').append(
            "<div id='error-alert-dialog' style='word-wrap: break-word;'></div>"
        );
    }

    // Ensure messages containing line breaks are shown with line breaks
    for (let index = 0; index < messages.length; index++) {
        messages[index] = messages[index].replace(/\n/g, '</p><p>');
    }

    const message = `<p>${messages.join('</p><p>')}</p>`;

    let buttons = null;
    if (closeButtonText) {
        buttons = [
            {
                text: closeButtonText,
                click() {
                    $(this).dialog('close');
                }
            }
        ];
    }
    const verticalPos = layoutConfiguration.dialogVerticalPosition();
    const $error = $('#error-alert-dialog');
    $error.html(message);
    new DialogPositionRetainer($error);
    $error.dialog({
        modal: true,
        resizable: false,
        autoOpen: true,
        position: { my: 'center', at: verticalPos, of: window },
        title,
        open() {
            resizeDialogToFit(this);
        },
        close: onClose,
        buttons
    });
};

/* Display an alert to the user
 * Returns a promise which resolves when the user closes the dialog
 * @param  {String}   title     The dialog title
 * @param  {[String]} messages  An array of messages
 * @param  {String}   closeButtonText (optional) Close button label
 * @return {Promise}
 *
 * Each message in the message list will be put in <p> tags
 * If the closeButtonText is null, the dialog will only be closeable via the
 * top-right 'x' button.
 */
const displayErrorAlert = (title, messages, closeButtonText) =>
    new Promise((resolve, reject) => {
        _displayErrorAlert(title, messages, resolve, closeButtonText);
    });

export { displayErrorAlert };
