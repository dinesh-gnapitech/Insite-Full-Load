// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { MywClass } from 'myWorld/myWorld-base';

export class CanvasDoodleManager extends MywClass {
    constructor(owner, canvas, context, options) {
        super();
        this.owner = owner;
        this.canvas = canvas;
        this.context = context;
        this.options = options || {};
        this.color = this.options.color;
        this.lineWidth = this.options.lineWidth || 4;

        this.enabled = false;

        this.draw = this.draw.bind(this);
    }

    getColor() {
        return this.color;
    }

    setColor(color_hex) {
        this.color = color_hex;
    }

    getLineWidth() {
        return this.lineWidth;
    }

    setLineWidth(width) {
        this.lineWidth = width;
    }

    drawEvent(evt_type, coors) {
        if (!this.enabled) return;

        if (evt_type == 'mousedown' || evt_type == 'touchstart') {
            return this.start(coors);
        } else if (evt_type == 'mousemove' || evt_type == 'touchmove') {
            return this.move(coors);
        } else if (evt_type == 'mouseup' || evt_type == 'touchend') {
            return this.stop(coors);
        }
    }

    enable() {
        if (this.enabled) return;

        this.canvas.addEventListener('mousedown', this.draw, false);
        this.canvas.addEventListener('mousemove', this.draw, false);
        this.canvas.addEventListener('mouseup', this.draw, false);
        this.canvas.addEventListener('touchstart', this.draw, false);
        this.canvas.addEventListener('touchmove', this.draw, false);
        this.canvas.addEventListener('touchend', this.draw, false);

        this.enabled = true;
    }

    disable() {
        if (!this.enabled) return;

        this.canvas.removeEventListener('mousedown', this.draw, false);
        this.canvas.removeEventListener('mousemove', this.draw, false);
        this.canvas.removeEventListener('mouseup', this.draw, false);
        this.canvas.removeEventListener('touchstart', this.draw, false);
        this.canvas.removeEventListener('touchmove', this.draw, false);
        this.canvas.removeEventListener('touchend', this.draw, false);

        this.enabled = false;
    }

    start(coors) {
        this.context.beginPath();
        this.context.moveTo(coors.x, coors.y);
        this.isDrawing = true;
    }

    move(coors) {
        if (this.isDrawing) {
            this.context.strokeStyle = this.color;
            this.context.lineJoin = 'round';
            this.context.lineWidth = this.lineWidth;
            this.context.lineTo(coors.x, coors.y);
            this.context.stroke();
        }
    }

    stop(coors) {
        if (this.isDrawing) {
            this.move(coors);
            this.isDrawing = false;
        }
    }

    draw(evt) {
        // Ensure that the event comses with a location
        if (!evt.clientX && (!evt.targetTouches || evt.targetTouches.length == 0)) return;

        // The X and Y is offset by the position of the canvas so remove the offset.
        let x = evt.clientX || evt.targetTouches[0].pageX;
        let y = evt.clientY || evt.targetTouches[0].pageY;
        let offset = $(evt.currentTarget).offset();

        this.drawEvent(evt.type, {
            x: x - offset.left,
            y: y - offset.top
        });
    }
}

export default CanvasDoodleManager;
