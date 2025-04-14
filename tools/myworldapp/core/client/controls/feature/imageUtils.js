import { ImageDimensionParser } from './imageDimensionParser';
import { LightweightBase64Reader } from './lightweightBase64Reader';

/**
 * Available via myw.imageUtils
 * @module imageUtils
 */

/**
 * @typedef ImageData
 * @property {string} type     MIME type of the image. 'image/jpeg'
 * @property {Blob} blob    Object represeting the image obtained from a canvas
 * @property {string} base64   <data> of a DATA URL, which is the base64 of the image (without the 'data:' tag at the start)
 */

/**
 * Reads the browsed image file as dataURL
 * @param  {object} file File object from the browser's file api
 * @return {ImageData}
 */
export async function readImageFileData(file, fieldDD) {
    //  Extract the width, height and any EXIF Orientation info
    const imageDimensionParser = new ImageDimensionParser();
    const dimensions = await imageDimensionParser.getDimensions(file);
    if (dimensions !== null) {
        return new Promise((resolve, reject) => {
            var img = new Image();
            //  Free up memory by revoking the object URL
            URL.revokeObjectURL(img.src);
            img.onload = () => {
                resizeAndRotateImage(
                    img,
                    dimensions.width,
                    dimensions.height,
                    dimensions.exif,
                    fieldDD
                ).then(imageData => {
                    resolve(imageData);
                });
            };
            img.onerror = e => {
                reject(new Error('Unable to load image'));
            };
            img.src = URL.createObjectURL(file);
        });
    } else {
        //ENH: Inform the user that the file format is not accepted
    }
}
let _browserAutoRotatesPromise = null;

/**
 * Re-sample the image to fit the maxWidth/maxHeight bounds defined in the dd type</br>
 * If no bounds are defined, the image is used as it is</br>
 * Converts it to jpeg</br>
 * @param  {string} img  Image file read as data url</br>
 * @param  {number} width
 * @param  {number} height
 * @param  {exif} exif   only 'Orientation' is used
 * @param  {FieldDD} fieldDD
 * @return {ImageData}
 */
export async function resizeAndRotateImage(img, width, height, exif, fieldDD) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const maxDimensions = fieldDD.type.slice(6, -1).split(',');
    const max_width = parseInt(maxDimensions[0], 10);
    const max_height = parseInt(maxDimensions[1], 10);

    //  Recently, WebView changed to automatically rotate uploaded images based on it's EXIF Orientation value.
    //  Test this here and change our functionality appropriately
    if (!_browserAutoRotatesPromise) {
        _browserAutoRotatesPromise = new Promise(function (resolve) {
            //  We adapted this check from the Modernizr framework
            //  https://github.com/Modernizr/Modernizr/blob/1560f1f0ddd159209c2c97a84ca49b727b2e7673/feature-detects/exif-orientation.js
            const img = new Image();
            img.onerror = function () {
                resolve(false);
            };
            img.onload = function () {
                resolve(img.width !== 2);
            };
            // There may be a way to shrink this more, it's a 1x2 white jpg with the orientation flag set to 6
            img.src =
                'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgASAAAAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+/iiiigD/2Q==';
        });
    }
    const isAutoRotating = await _browserAutoRotatesPromise;

    let imageData;
    // If the EXIF Orientation is present, use that to determine orientation, else calculate using width and height
    let isLandscape = !isAutoRotating && exif?.Orientation ? exif.Orientation < 4 : width >= height;
    //  If the image has been auto-rotated, change it back here
    if (isAutoRotating && exif?.Orientation >= 5) {
        isLandscape = !isLandscape;
        const temp = width;
        width = height;
        height = temp;
    }
    //  This is the best case sizes, these will be reduced if the canvas is too big to handle
    let desiredWidth = width;
    let desiredHeight = height;

    // Compare what to scale down the size to if needed
    if (isLandscape) {
        //Landscape
        if (width > max_width) {
            desiredHeight *= max_width / width;
            desiredWidth = max_width;
        }
    } else {
        //Portrait
        if (height > max_height) {
            desiredWidth *= max_height / height;
            desiredHeight = max_height;
        }
    }
    canvas.width = desiredWidth;
    canvas.height = desiredHeight;
    //  Keep trying to draw to the canvas, in event of a failure, scale down the canvas and try again
    let valid = false;
    let scale = 1.0;
    while (!valid) {
        canvas.width = desiredWidth * scale;
        canvas.height = desiredHeight * scale;
        //  Reset to identity matrix
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!isAutoRotating) rotateCanvas(exif, ctx, canvas.width, canvas.height);
        //  This will return null or throw an error if the canvas is too big to process
        try {
            ctx.drawImage(img, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
            // eslint-disable-next-line no-await-in-loop
            imageData = await toDataUrl(canvas);
            valid = imageData?.base64 !== 'data:,';
            scale -= 0.05;
        } catch (error) {
            valid = false;
            scale -= 0.05;
        }

        if (scale <= 0) {
            throw new Error('Unable to process image');
        }
    }

    return imageData;
}

/**
 * Convert image in a canvas to base64 dataURL
 * @param  {canvas} canvas
 * @return {ImageData}
 */
export async function toDataUrl(canvas) {
    return new Promise((resolve, reject) => {
        const type = 'image/jpeg';
        //  In some browsers, canvas.toBlob isn't available. Handle that scenario here
        if (canvas.toBlob) {
            canvas.toBlob(async blob => {
                //  Check if the canvas is too big to process
                if (blob == null) {
                    resolve(null);
                    return;
                }

                const lightweightReader = new LightweightBase64Reader();
                const base64 = await lightweightReader.readFile(blob);
                //  Return the blob as well for use in the thumbnail
                resolve({ blob, base64, type });
            }, type);
        } else {
            //  Get the base64 of the data here, and strip the data: tag from the front
            const base64Data = canvas
                .toDataURL(type)
                .replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
            resolve({ blob: null, base64: base64Data, type });
        }
    });
}

export function rotateCanvas(exif, ctx, width, height) {
    if (exif) {
        switch (exif.Orientation) {
            case 2:
                // horizontal flip
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
                break;
            case 3:
                // 180° rotate left
                ctx.translate(width, height);
                ctx.rotate(Math.PI);
                break;
            case 4:
                // vertical flip
                ctx.translate(0, height);
                ctx.scale(1, -1);
                break;
            case 5:
                // vertical flip + 90 rotate right
                ctx.rotate(0.5 * Math.PI);
                ctx.scale(1, -1);
                break;
            case 6:
                // 90° rotate right
                ctx.rotate(0.5 * Math.PI);
                ctx.translate(0, -height);
                break;
            case 7:
                // horizontal flip + 90 rotate right
                ctx.rotate(0.5 * Math.PI);
                ctx.translate(width, -height);
                ctx.scale(-1, 1);
                break;
            case 8:
                // 90° rotate left
                ctx.rotate(-0.5 * Math.PI);
                ctx.translate(-width, 0);
                break;
        }
    }
}
