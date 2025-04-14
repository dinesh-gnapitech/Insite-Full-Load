// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldViewer } from './fieldViewer';
import { getImageFormatFor } from 'myWorld/base/util';

/**
 * Displays an image field value by providing a link that opens a dialog displaying the image
 * @name ImageFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class ImageFieldViewer extends FieldViewer {
    static {
        this.prototype.className = 'imageLink';

        this.prototype.events = {
            click: 'showImage'
        };
    }

    render() {
        const feature = this.feature,
            displayValue = feature.displayValues[this.fieldName];
        const nully = !displayValue;

        if (nully && this.options.renderAll) {
            this.$el.html(`<i>${this.msg('no_reference')}`);
        } else if (!nully) {
            this.title = `${feature.getTitle()} - ${this.fieldDD.external_name}`;

            this.$el.attr('title', this.title).html(this.msg('image_size', { size: displayValue }));
        }

        if (this.options.inListView || nully) {
            this.$el.removeClass('imageLink');
            this.undelegateEvents();
        }
        //On window resize: Update the max size of the dialog containing the image
        $(window).on('resize', e => {
            if (this.imageContainer && e.target === window) {
                const widgetWidth = $(window).outerWidth() - 50;
                const widgetHeight = $(window).outerHeight() - 50;
                this.imageContainer.dialog('option', {
                    maxWidth: widgetWidth,
                    maxHeight: widgetHeight
                });
            }
        });
    }

    showImage() {
        const feature = this.feature,
            fieldName = this.fieldName;

        //first ensure the image data is available in the feature's properties
        feature.ensure('lobs').then(() => {
            const imageData = feature.properties[fieldName];
            const imageFormat = getImageFormatFor(imageData);
            let src = `data:image/${imageFormat};base64,${imageData}`;

            const img = $('<img/>', { src: src });
            this.imageContainer = this.app.layout.displayImage(this.title, img);
        });
    }
}

export default ImageFieldViewer;
