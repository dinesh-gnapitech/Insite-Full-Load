// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';
import $ from 'jquery';

class RenderOrderEditor extends View {
    static {
        this.prototype.messageGroup = 'RenderOrderEditor';
        this.prototype.className = 'render-order-container';

        this.mergeOptions({
            min: -50,
            max: 50,
            step: 2,
            initialDelay: 500, //Initial delay for press and hold
            multiplier: 0.7 //factor by which the speed of increment increases or the delay decreases
        });
    }

    /**
     * Editor to update the layer render order
     * @interface
     * @constructs
     * @extends  {View}
     */
    constructor(options) {
        super(options);
        this.render();
    }

    render() {
        this.pointRenderOrder = $('<span>', {
            class: 'point-render-order',
            title: this.msg('point_render_order')
        });
        const renderInputBox = $('<div>', {
            class: 'render-order-editor',
            title: this.msg('layer_render_order')
        }).click(e => e.stopPropagation()); //makes sure the click does not propogate to the hidden elements like the visibility checkbox
        const decreaseBtn = $('<span>', { class: 'render-order-down render-incrementor-btn' });
        this.renderInput = $('<input>', { class: 'render-order-input', type: 'number' });
        const increaseBtn = $('<span>', { class: 'render-order-up render-incrementor-btn' });

        renderInputBox
            .html(decreaseBtn)
            .append(this.renderInput)
            .append(this.pointRenderOrder)
            .append(increaseBtn);

        this.$el.html(renderInputBox);

        this.renderInput.on('change', ev => {
            const { min, max } = this.options;
            //Make sure the value is always in the required range
            let val = $(ev.currentTarget).val();
            if (val < min) val = min;
            if (val > max) val = max;
            this.renderInput.val(val);
            this.updateRenderOrder();
        });

        //Set the value by subtracting 50 to match the config pages
        this.setValue(this.options.zIndex - 50);

        this.makeButtonIncrement(increaseBtn, 'add');
        this.makeButtonIncrement(decreaseBtn, 'subtract');
    }

    setValue(val) {
        this.renderInput.val(val || '');
        this.updateRenderOrder();
    }

    getValue() {
        return parseInt(this.renderInput.val(), 10) || 0;
    }

    updateRenderOrder() {
        //Overlays zIndex range = 0 to 100
        //Vector layer will render polygons/lines between 0-100; and points between 20-120 (A factor of 20 in added to a point in vector layer)
        const val = this.getValue();
        this.options.owner.layer.setZIndex(val + 50);

        //Update the point render order display
        const zIndexPointOffset = this.options.zIndexPointOffset;
        if (zIndexPointOffset) this.pointRenderOrder.text(`(${zIndexPointOffset + val})`);
    }

    /**
     * Makes the up and down arrows into increment button that incrementallly increase or decrease the value on press and hold
     * The value is incremented by options.step
     * Creates a closure and puts a mousedown handler on the element specified in the "button" parameter
     * @param {jQueryObject} button  plusBtn/decreaseBtn
     * @param {string} action        'add'/'subtract'
     */
    makeButtonIncrement(button, action) {
        let holdTimer,
            changeValue,
            timerRunning = false,
            delay = this.options.initialDelay;
        const self = this;
        changeValue = function () {
            const { min, max, step, initialDelay, multiplier } = self.options;
            let inputVal = parseInt(self.renderInput.val(), 10) || 0;
            if (action == 'add' && inputVal < max) {
                inputVal = inputVal + step;
                if (inputVal > max) inputVal = max;
            } else if (action == 'subtract' && inputVal > min) {
                inputVal = inputVal - step;
                if (inputVal < min) inputVal = min;
            }
            self.renderInput.val(inputVal);
            holdTimer = setTimeout(changeValue, delay);
            if (delay > 20) delay = delay * multiplier;
            if (!timerRunning) {
                // When the function is first called, it puts an onmouseup handler on the whole document
                // that stops the process when the mouse is released. This is important if the user moves
                // the cursor off of the button
                document.onmouseup = function (e) {
                    e.stopPropagation;
                    clearTimeout(holdTimer);
                    document.onmouseup = null;
                    timerRunning = false;
                    delay = initialDelay;
                    self.updateRenderOrder();
                };
                timerRunning = true;
            }
        };
        button.on('mousedown', changeValue);
    }
}

export default RenderOrderEditor;
