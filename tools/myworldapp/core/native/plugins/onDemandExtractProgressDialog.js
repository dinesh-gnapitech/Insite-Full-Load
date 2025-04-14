// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';

export class OnDemandExtractProgressDialog {
    constructor() {
        let dialog = $('#on-demand-extract-progress-dialog');
        if (dialog.length === 0) {
            // We need to add the HTML for the dialog
            dialog = $('body').append(
                "<div id='on-demand-extract-progress-dialog' style='word-wrap: break-word;'></div>"
            );
            dialog = $('#on-demand-extract-progress-dialog');
        }
        this._dialog = dialog;
    }

    show(title, messages) {
        const text = this._prepareMessages(messages);

        this._dialog.html(text).dialog({
            modal: true,
            resizable: false,
            autoOpen: true,
            title,
            dialogClass: 'no-close-button',
            closeOnEscape: false,
            buttons: []
        });
    }

    _prepareMessages(messages) {
        for (let index = 0; index < messages.length; index++) {
            messages[index] = messages[index].replace(/\n/g, '</p><p>');
        }

        return `<p>${messages.join('</p><p>')}</p>`;
    }

    showMessage(messages) {
        const text = this._prepareMessages(messages);
        this._dialog.html(text);
    }

    close() {
        this._dialog.dialog('close');
    }
}
