import { FieldViewer } from './fieldViewer';
import { StringToImage } from './barcodeFieldUtilities';

/**
 * Displays the value of a field as a barcode (or 2D barcodes such as QR codes).
 * Classes for specific format are available as subclasses:
 * 1D formats:
 *   Code 39: BarcodeCode39FieldViewer
 *   Code 93: BarcodeCode93FieldViewer
 *   Code 128: BarcodeCode128FieldViewer
 *   EAN-8: BarcodeEAN8FieldViewer
 *   EAN-13: BarcodeEAN13FieldViewer
 *   RSS-14: BarcodeRSS14FieldViewer
 *   ITF-14: BarcodeITF14FieldViewer
 * 2D formats:
 *   Aztec: BarcodeAztecFieldViewer
 *   Data Matrix: BarcodeDataMatrixFieldViewer
 *   PDF417: BarcodePDF417CodeFieldViewer
 *   QR: BarcodeQRCodeFieldViewer
 * @name BarcodeFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class BarcodeFieldViewer extends FieldViewer {
    static {
        this.prototype.className = 'barcodeFieldViewer';

        this.prototype.events = {
            'click img': 'showImage'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.render();
    }

    renderValue() {
        try {
            const image = StringToImage(
                this.fieldValue,
                this.options.imageType,
                this.options.imageSubType,
                25,
                25
            );
            this.$el.html(image);
        } catch (error) {
            this.$el.html(
                `<div><i>${this.msg('render_error', {
                    image_type: this.options.imageSubType,
                    error: error.message
                })}</i></div>`
            );
        }
    }

    showImage() {
        const image = StringToImage(
            this.fieldValue,
            this.options.imageType,
            this.options.imageSubType,
            300,
            300
        );
        this.imageContainer = this.app.layout.displayImage(this.fieldDD.external_name, image);
    }
}

const defineViewer = function (imageType, imageSubType, className) {
    class SubTypeBarcodeFieldViewer extends BarcodeFieldViewer {
        constructor(owner, feature, fieldDD, options) {
            super(owner, feature, fieldDD, {
                ...options,
                imageType,
                imageSubType
            });
        }
    }

    Object.defineProperty(SubTypeBarcodeFieldViewer, 'name', { value: className });
    return SubTypeBarcodeFieldViewer;
};

export const BarcodeCode39FieldViewer = defineViewer('1D', 'Code 39', 'BarcodeCode39FieldViewer');
export const BarcodeCode93FieldViewer = defineViewer('1D', 'Code 93', 'BarcodeCode93FieldViewer');
export const BarcodeCode128FieldViewer = defineViewer(
    '1D',
    'Code 128',
    'BarcodeCode128FieldViewer'
);
export const BarcodeEAN8FieldViewer = defineViewer('1D', 'EAN-8', 'BarcodeEAN8FieldViewer');
export const BarcodeEAN13FieldViewer = defineViewer('1D', 'EAN-13', 'BarcodeEAN13FieldViewer');
export const BarcodeRSS14FieldViewer = defineViewer('1D', 'RSS-14', 'BarcodeRSS14FieldViewer');
export const BarcodeITF14FieldViewer = defineViewer('1D', 'ITF-14', 'BarcodeITF14FieldViewer');

export const BarcodeAztecFieldViewer = defineViewer('2D', 'Aztec', 'BarcodeAztecFieldViewer');
export const BarcodeDataMatrixFieldViewer = defineViewer(
    '2D',
    'Data Matrix',
    'BarcodeDataMatrixFieldViewer'
);
export const BarcodePDF417CodeFieldViewer = defineViewer(
    '2D',
    'PDF417',
    'BarcodePDF417CodeFieldViewer'
);
export const BarcodeQRCodeFieldViewer = defineViewer('2D', 'QR', 'BarcodeQRCodeFieldViewer');
