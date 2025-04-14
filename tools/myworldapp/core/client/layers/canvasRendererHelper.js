// Copyright: IQGeo Limited 2010-2023
import { MywClass } from 'myWorld/base/class';

export class CanvasRendererHelper extends MywClass {
    /**
     * @class  A helper for rendering to an HTML5 canvas
     * @constructs
     * @param  {Canvas} canvas  HTML5 canvas
     */
    constructor(canvas) {
        super();
        const ctx = canvas.getContext('2d');
        this._ctx = ctx;
    }

    /**
     * Add a line ring to the canvas
     * @param {Array<Point>} coordinates  The line ring
     */
    addLineRing(coordinates) {
        this._ctx.moveTo(coordinates[0].x, coordinates[0].y);
        for (let index = 1; index < coordinates.length; index++) {
            this._ctx.lineTo(coordinates[index].x, coordinates[index].y);
        }
        this._ctx.closePath();
    }

    /**
     * Add a polygon to the canvas
     * @param {Array<Array<Point>>} coordinates  The polygon
     * The polygon consists of an array of line rings. The first is the
     * external ring which should be oriented anti-clockwise. The rest
     * are internal rings which should be oriented clockwise.
     */
    addPolygon(polygonCoordinates) {
        // We assume that all rings are oriented correctly, so all we need to
        // do is add them
        polygonCoordinates.forEach(this.addLineRing, this);
    }

    /**
     * Add a multi-polygon to the canvas
     * @param {Array<Array<Array<Point>>>} coordinates  The multi-polygon
     */
    addMultiPolygon(coordinates) {
        coordinates.forEach(this.addPolygon, this);
    }

    /**
     * Draw an image at the canvas origin clipped by the specified geometry
     * @param {Array<Array<Array<Point>>>} clipGeometry  A multi-polygon
     * @param {Image} img   An Image DOM element
     */
    drawClippedImageAtOrigin(clipGeometry, img) {
        this._ctx.beginPath();
        this.addMultiPolygon(clipGeometry);
        this._ctx.clip();
        this._ctx.drawImage(img, 0, 0);
    }

    /**
     * Draw an image at the canvas origin
     * @param {Image} img   An Image DOM element
     */
    drawImageAtOrigin(img) {
        this._ctx.drawImage(img, 0, 0);
    }
}

export default CanvasRendererHelper;
