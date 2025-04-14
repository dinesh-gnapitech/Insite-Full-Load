// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import Webcam from 'webcamjs';

export class WebcamDialog extends Control {
    static {
        this.prototype.events = {
            'click #take_photo': 'takeSnapshot',
            'click #retake_photo': 'retakeSnapshot',
            'click #select_photo': 'selectSnapshot'
        };
    }

    /**
     * @class Dialog to view the webcam data and capture a snapshot
     * @param  {callback}   callback         Callback to the method that takes the data_uri of the snapshot once it is selected by the user
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        this.callback = options.callback;
        this.takePhotoFunction = options.takePhotoFunction;
        this.takePhotoFunctionInterval = null;
        this.testPhotoFunction = this.testFunctionCallback.bind(this);
        this.webcamActive = false;

        this.render();
    }

    render() {
        this.webcamViewer = $('<div id="webcam_viewer"></div>');
        this.$el.append(this.webcamViewer).dialog({
            modal: true,
            autoOpen: false,
            width: 'auto',
            resizable: false,
            position: { my: 'center', at: 'top+160', of: window },
            title: 'Webcam',
            close: () => {
                this.close();
            }
        });

        if (!this.takePhotoFunction) {
            this.takePhotoBtn = $(
                `<div id="take_photo" title="${this.msg('take_photo')}"></div>`
            ).appendTo(this.$el);
        }

        this.previewActions = $('<div id="preview_actions"></div>')
            .hide()
            .appendTo(this.$el)
            .append(`<span id="retake_photo" title="${this.msg('retake_photo')}"></span>`)
            .append(`<span id="select_photo" title="${this.msg('select_photo')}"></span>`);
    }

    open() {
        //Calculate the size of the webcam viewer (either 640x480 or 480x360) restricting it within the window bounds
        const windowHeight = $(window).height() - 150,
            windowWidth = $(window).width() - 50,
            maxWidth = 640 < windowWidth && 480 < windowHeight ? 640 : 480,
            maxHeight = (maxWidth * 3) / 4;

        Webcam.set({
            width: maxWidth,
            height: maxHeight,
            image_format: 'jpeg',
            jpeg_quality: 90
        });
        Webcam.attach(this.$el.find('#webcam_viewer')[0]);
        this.retakeSnapshot();
        this.$el.dialog('open');
    }

    close() {
        if (this.takePhotoFunction) {
            //  Stop the auto-capture
            clearInterval(this.takePhotoFunctionInterval);
            Webcam.off('live', this.testPhotoFunction);
        }
        Webcam.reset(); // shut down camera, stop capturing
        this.webcamActive = false;
    }

    takeSnapshot() {
        Webcam.freeze();
        this.takePhotoBtn?.hide();
        this.previewActions.show();
    }

    retakeSnapshot() {
        Webcam.unfreeze();
        this.takePhotoBtn?.show();
        this.previewActions.hide();

        if (this.takePhotoFunction) {
            if (this.webcamActive) {
                this.testPhotoFunction();
            } else {
                Webcam.on('live', this.testPhotoFunction);
            }
        }
    }

    /**
     * Takes a snapshot and sends the resulting data_url to the callback method
     */
    selectSnapshot() {
        Webcam.snap(data_uri => {
            this.$el.dialog('close');
            this.callback(data_uri);
        });
    }

    testFunctionCallback() {
        this.webcamActive = true;
        this.takePhotoFunctionInterval = setInterval(() => {
            Webcam.snap(async data_uri => {
                const capture = await this.takePhotoFunction(data_uri);
                if (capture) {
                    this.takeSnapshot();
                    clearInterval(this.takePhotoFunctionInterval);
                    Webcam.off('live', this.testPhotoFunction);
                }
            });
        }, 250);
    }
}

export default WebcamDialog;
