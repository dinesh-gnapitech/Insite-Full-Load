// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import Dialog from 'myWorld/uiComponents/dialog';
import AttachmentsList from './attachmentsList';
import { renderReactNode } from 'myWorld/uiComponents/react';

export class AttachmentsDialog extends Dialog {
    static {
        this.mergeOptions({
            position: { my: 'center', at: 'top', of: window, collision: 'fit' },
            contents: $('<div>', {
                id: 'attachments-dialog-content',
                class: 'attachments-container antd-component'
            }),
            destroyOnClose: true,
            width: 600
        });
    }

    constructor(owner, options) {
        super(options);
        this.owner = owner;
        (this.options.title = this.options.fieldDD.external_name),
            //Set the action buttons
            (this.options.buttons = {
                Close: {
                    text: '{:cancel_btn}',
                    class: 'right',
                    click: () => {
                        this.cancelChanges();
                    }
                }
            });

        if (options.isEditor) {
            this.options.buttons.Ok = {
                text: '{:ok_btn}',
                class: 'primary-btn',
                click: () => {
                    this.close();
                }
            };
        }

        this.render();
        this.renderAttachmentContent(this.options.attachments);
    }

    renderAttachmentContent(attachments, updatedAttachmentProps = {}) {
        const { imageFieldDD, docFieldDD, filenameFieldDD, type, isEditor } = this.options;
        const container = document.querySelector('.attachments-container');
        renderReactNode(container, AttachmentsList, {
            owner: this.owner,
            attachments,
            docFieldName: docFieldDD?.internal_name,
            imageFieldName: imageFieldDD?.internal_name,
            filenameFieldName: filenameFieldDD?.internal_name,
            updatedAttachmentProps,
            type,
            isEditor
        });
    }

    cancelChanges() {
        if (this.options.isEditor) this.options.cancelChanges();
        this.close();
    }
}

export default AttachmentsDialog;
