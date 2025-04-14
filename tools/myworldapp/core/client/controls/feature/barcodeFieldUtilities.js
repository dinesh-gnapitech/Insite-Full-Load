import {
    BarcodeFormat,
    BrowserMultiFormatReader,
    BrowserQRCodeReader,
    BrowserBarcodeReader,
    BrowserDatamatrixCodeReader,
    BrowserAztecCodeReader,
    BrowserPDF417Reader,
    DecodeHintType
} from '@zxing/library/esm';
import bwip from 'bwip-js';
import { isNativeApp } from 'myWorld/base/core';
import { ipad, iphone } from 'myWorld/base/browser';

//  The iOS plugin we use for camera access has issues, so we override functionality here to help deal with it
const __awaiter =
    this?.__awaiter ||
    function (thisArg, _arguments, P, generator) {
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : new P(function (resolve) {
                          resolve(result.value);
                      }).then(fulfilled, rejected);
            }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };

BrowserMultiFormatReader.prototype.tryPlayVideo = function (videoElement) {
    if (isNativeApp && (ipad || iphone)) {
        this.isIOSNative = true;
        // the cordova plugin to that helps with video scannig is too cpu intensive on each decoding attempt as a jpg is generated in swift code and then passed to drawImageOnCanvas
        // limit the number of scans to about 3 frames per second
        this.timeBetweenDecodingAttempts = Math.max(this.timeBetweenDecodingAttempts, 300);
    }
    return __awaiter(this, void 0, void 0, function* () {
        if (this.isVideoPlaying(videoElement)) {
            console.warn('Trying to play video that is already playing.');
            return;
        }
        try {
            //  It's possible for videoWidth and videoHeight to be 0, which is required to create the capture canvas.
            //  To get around this, create the canvas here and update to the video DOM element's width instead
            if (this.isIOSNative) {
                videoElement.play();
                const canvas = this.getCaptureCanvas(videoElement);
                canvas.width = videoElement.width;
                canvas.height = videoElement.height;
                yield 1;
                videoElement.dispatchEvent(new Event('playing'));
            } else {
                yield videoElement.play();
            }
        } catch (_a) {
            console.warn('It was not possible to play the video.');
        }
    });
};

BrowserMultiFormatReader.prototype.drawImageOnCanvas = function (canvasElementContext, srcElement) {
    //  ctx.drawImage(video) in iOS is broken. Instead, go through an Image node to render
    if (this.isIOSNative) {
        srcElement.render?.save(data => {
            const newImage = new Image();
            newImage.onload = () => {
                canvasElementContext.drawImage(
                    newImage,
                    0,
                    0,
                    canvasElementContext.canvas.width,
                    canvasElementContext.canvas.height
                );
                newImage.src = null; //discard image
            };
            newImage.src = 'data:image/jpg;base64,' + data;
        });
    } else {
        canvasElementContext.drawImage(srcElement, 0, 0);
    }
};

/*
 * Helper function that wraps a call to the ZXing library, given a ZXing reader class prototype and a format the read image should be in
 */
const wrapZXingReader = function (prototype, format) {
    return async function (img, imgSrc) {
        const reader = new prototype();
        //  imgSrc is streamed in from the webcam only. If we get an image instead, we can try harder to get data from it
        let res;
        if (img) {
            const hints = new Map();
            hints.set(DecodeHintType.TRY_HARDER, true);
            hints.set(DecodeHintType.PURE_BARCODE, true);
            reader.hints = hints;
            res = await reader.decodeOnce(img, false, false); //without retries as it could get in infinite loop
        } else {
            res = await reader.decodeFromImage(img, imgSrc);
        }
        if (res.format == BarcodeFormat[format]) {
            return res.text;
        } else {
            throw new Error('Incorrect format');
        }
    };
};

/*
 * Helper function that wraps a call to the bwip-js library, given a bwip-js compatible type to render the image in
 */
const wrapBwipJsWriter = function (bcid) {
    const toPixels = 2.835;
    return function (value, width, height) {
        const canvas = document.createElement('canvas');
        bwip.toCanvas(canvas, {
            bcid,
            text: value,
            scale: 1,
            height: height / toPixels,
            width: width / toPixels,
            includetext: height >= 100, // Show human-readable text
            textxalign: 'center' // Always good to set this
        });
        const data = canvas.toDataURL('data/png');
        const pngImage = new Image();
        pngImage.width = width;
        pngImage.height = height;
        pngImage.src = data;
        return pngImage;
    };
};

/*
 * Specific function for the EAN-14 / RSS-14 format, which ensures that data begins with (01) before passing to the wrapBwipJsWriter function
 */
const wrapGS1_14 = function (bcid) {
    const origFunc = wrapBwipJsWriter(bcid);
    return function (value, width, height) {
        if (!value.startsWith('(01)')) {
            value = `(01)${value}`;
        }
        return origFunc(value, width, height);
    };
};

/*
 * List of currently supported barcode / QR code formats, and associated image readers / writers
 */
const codeParsers = {
    '1D': {
        'Code 39': [wrapZXingReader(BrowserBarcodeReader, 'CODE_39'), wrapBwipJsWriter('code39')],
        'Code 93': [wrapZXingReader(BrowserBarcodeReader, 'CODE_93'), wrapBwipJsWriter('code93')],
        'Code 128': [
            wrapZXingReader(BrowserBarcodeReader, 'CODE_128'),
            wrapBwipJsWriter('code128')
        ],
        'EAN-8': [wrapZXingReader(BrowserBarcodeReader, 'EAN_8'), wrapBwipJsWriter('ean8')],
        'EAN-13': [wrapZXingReader(BrowserBarcodeReader, 'EAN_13'), wrapBwipJsWriter('ean13')],
        'RSS-14': [wrapZXingReader(BrowserBarcodeReader, 'RSS_14'), wrapGS1_14('ean14')],
        'ITF-14': [wrapZXingReader(BrowserBarcodeReader, 'ITF'), wrapBwipJsWriter('itf14')]
    },
    '2D': {
        Aztec: [wrapZXingReader(BrowserAztecCodeReader, 'AZTEC'), wrapBwipJsWriter('azteccode')],
        PDF417: [wrapZXingReader(BrowserPDF417Reader, 'PDF_417'), wrapBwipJsWriter('pdf417')],
        QR: [wrapZXingReader(BrowserQRCodeReader, 'QR_CODE'), wrapBwipJsWriter('qrcode')],
        //  Data matrix can cause issues with other types of codes (Specifically, it can hang when scanning PDF417), so try this last
        'Data Matrix': [
            wrapZXingReader(BrowserDatamatrixCodeReader, 'DATA_MATRIX'),
            wrapBwipJsWriter('datamatrix')
        ]
    }
};

const multiReader = async function (img, imgSrc) {
    //  imgSrc is streamed in from the webcam only. If we get an image instead, we can try harder to get data from it
    let res;
    if (img) {
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.PURE_BARCODE, true);
        const reader = new BrowserMultiFormatReader(hints);
        res = await reader.decodeOnce(img, false, false); //without retries as it could get in infinite loop
    } else {
        const reader = new BrowserMultiFormatReader();
        res = await reader.decodeFromImage(img, imgSrc);
    }
    return res.text;
};

/*
 * Renders the specified value to an image, to the specific type if specified
 */
const StringToImage = function (value, imageType, imageSubtype, width, height) {
    if (value) {
        const imageSubTypeHandlers = codeParsers[imageType]?.[imageSubtype];
        if (imageSubTypeHandlers) {
            const writerFunc = imageSubTypeHandlers[1];
            return writerFunc(value, width, height);
        }
    }
    return document.createElement('div');
};

/*
 * Attempts to read an image and extract the barcode / QR code value and type
 */
const ImageToString = async function (imageType, imageSubType, img, imgSrc) {
    if (imageType) {
        const readers = codeParsers[imageType];
        if (imageSubType) {
            const readerFunc = readers[imageSubType][0];
            const result = await readerFunc(img, imgSrc);
            return result;
        } else {
            let throwMe = null;
            for (const reader of Object.values(readers)) {
                try {
                    const readerFunc = reader[0];
                    // eslint-disable-next-line no-await-in-loop
                    const result = await readerFunc(img, imgSrc);
                    return result;
                } catch (error) {
                    // May as well keep the error until later
                    throwMe = error;
                }
            }
            throw throwMe;
        }
    } else {
        const result = await multiReader(img, imgSrc);
        return result;
    }
};

export { StringToImage, ImageToString };
