// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Dialog } from 'myWorld/uiComponents/';

import { StringFieldEditor } from './stringFieldEditor';
import { ImageToString } from './barcodeFieldUtilities';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library/esm';
import folderImg from 'images/folder.svg';

let selectedDeviceId; // library variable instead of a property instance so choice is kept across instances

/**
 * Field Editor for string fields which can capture data from barcodes, include 2D barcode such as QR code<br/>
 * It can scan the barcodes either via the device's camera or by selecting a file with the barcode image
 * @name BarcodeFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class BarcodeFieldEditor extends StringFieldEditor {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'image-input';

        this.prototype.events = {
            'click .field-edit-btn': 'browseFiles'
        };

        this.mergeOptions({ videoWidth: 600, videoHeight: 600 });
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this.fileInput = $('<input/>', { type: 'file', accept: 'image/*' }).appendTo(this.$el); //hidden via css
        this.photoButton = $('<button/>', {
            class: 'field-edit-btn capture-code-btn'
        })
            .button()
            .appendTo(this.$el);

        $('<div>', { class: 'code-editor' })
            .append(this.control.$el, this.fileInput, this.photoButton)
            .appendTo(this.$el);

        //Initially assume readonly and hide capture button, setReadOnly will be called later
        this._isReadonly = true;
        this.control.$el.prop('disabled', true).toggleClass('disabled-input');
        this.photoButton.css('display', 'none');

        this.fileInput.change(event => {
            // Get a reference to the taken picture or chosen image
            const files = event.target.files;
            if (files?.length > 0) {
                this.readFileData(files[0]);
            }
        });
    }

    /**
     * Passes on the click event to the file input element to launch the file browser/camera
     */
    async browseFiles() {
        if (navigator.mediaDevices) {
            if (!this.scanDialog) await this.createScanDialog();
            this.scanDialog.open();
        } else {
            //non-secure website - show file input options
            console.warn('Camera access requires secure website');
            this.fileInput.click();
        }
    }

    /*
     * Creates a dialog with a scanner and an option to add an image file
     */
    async createScanDialog() {
        this.scanDialog = new Dialog({
            modal: true,
            autoOpen: true,
            width: 'auto',
            resizable: false,
            position: { my: 'center', at: 'top+160', of: window },
            title: this.msg('scanning_barcode'),
            buttons: {
                Cancel: {
                    text: this.msg('cancel'),
                    class: 'cancel-btn',
                    click: function () {
                        this.close();
                    }
                }
            },
            open: () => {
                this.startScanner();
                //So the focus is always on the cancel button and not on the sourceSelectBox
                this.scanDialog.$el.dialog('widget').find('.cancel-btn').focus();
            },
            close: () => {
                this.codeReader?.reset();
            },
            classes: {
                'ui-dialog-content': 'barcode-scan-dialog'
            }
        });

        const videoEl = $('<video>', {
            id: 'video',
            width: this.options.videoWidth,
            height: this.options.videoHeight
        });
        videoEl[0].width = this.options.videoWidth;
        videoEl[0].height = this.options.videoHeight;

        this.sourceSelectBox = $('<select>', { class: 'source-select text' });
        this.sourceSelectBox.append(
            $(`<option value="">${this.msg('default_video_source')}</option>`)
        );
        const selectLabel = $('<label>', { text: `${this.msg('change_video_source')}: ` }).append(
            this.sourceSelectBox
        );
        this.sourceSelectPanel = $('<div>', { class: 'source-select-panel hidden' }).append(
            selectLabel
        );

        this.scanDialog.$el.append(videoEl).append(this.sourceSelectPanel);

        $(`<div><img src="${folderImg}"/></div>`)
            .append(this.msg('files'))
            .on('click', () => {
                this.fileInput.click(); // click the input[type=file] to launch the file browser
                this.scanDialog.close();
            })
            .appendTo(this.scanDialog.$el);

        this.codeReader = new BrowserMultiFormatReader();
        this.codeReader.timeBetweenDecodingAttempts = 100; // limit to 10 scans a second to reduce possibility of hogging device
        const videoInputDevices = await this.codeReader.listVideoInputDevices();

        if (videoInputDevices.length >= 2) {
            videoInputDevices.forEach(element => {
                const sourceOption = document.createElement('option');
                sourceOption.text = element.label;
                sourceOption.value = element.deviceId;
                this.sourceSelectBox.append(sourceOption);
            });
            if (selectedDeviceId) this.sourceSelectBox.val(selectedDeviceId);

            this.sourceSelectBox.on('change', () => {
                selectedDeviceId = this.sourceSelectBox.val();
                this.codeReader.reset();
                this.startScanner();
            });
            this.sourceSelectPanel.show();
        }
    }

    /*
     * Start scanning using the video camera
     */
    async startScanner() {
        await this.codeReader.decodeFromVideoDevice(selectedDeviceId, 'video', (result, err) => {
            if (result) {
                this.control.setValue(result.text);
                this.scanDialog.close();
            }
            if (err && !(err instanceof NotFoundException)) {
                this.scanDialog.close();
                console.warn(err);
            }
        });
    }

    /**
     * Reads the browsed image file as dataURL
     * @param  {object} file File object from the browser's file api
     */
    async readFileData(file) {
        const img = new Image();
        this.photoButton.addClass('loading').attr('disabled', true);
        img.onload = async () => {
            try {
                const value = await ImageToString(null, null, img);
                this.control.setValue(value);
            } catch (error) {
                this.app.message(this.msg('error_msg_no_barcode'));
            } finally {
                //  Free up memory by revoking the object URL
                URL.revokeObjectURL(img.src);
                this.photoButton.removeClass('loading').attr('disabled', false);
            }
        };
        img.onerror = e => {
            console.log('Unable to load image');
        };
        //  Create a URL for the file, is much lighter than getting the base 64
        img.src = URL.createObjectURL(file);
    }

    /**
     * Over-riding the super since that does not disable the capture button in this editor.
     * The super looks for button within this.control to disable, where as the photButton is a sibling of this.control
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        super.setReadonly(readonly);
        if (!readonly) {
            //Note: We don't hide the button is subsequent calls to avoid confusing users
            this.photoButton.css('display', 'block').attr('title', this.msg('add_image'));
        } else this.photoButton.removeAttr('title'); //Remove the tooltip
        //Update disabled status and make the button appear lighter when disabled
        this.photoButton.prop('disabled', readonly).css('opacity', readonly ? 0.5 : 1);
    }

    /**
     * When the editor is closed, remove() will be called
     * This method ensures that the scanning dialog is removed
     */
    remove() {
        if (this.scanDialog) this.scanDialog.$el.remove();
    }
}

export default BarcodeFieldEditor;
