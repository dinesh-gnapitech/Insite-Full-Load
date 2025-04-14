// Copyright: IQGeo Limited 2010-2023
import View from 'myWorld/base/view';
import { template } from 'underscore';

/**
 * UI Control for a Range slider.
 *
 */
export class WidgetSliderControl extends View {
    static {
        this.mergeOptions({
            defaultValue: 50, // Single mode handle
            rangeStep: 10,
            minRange: 0,
            maxRange: 100,
            tooltipLabel: '',
            unit: '',
            minRangeLabel: '',
            maxRangeLabel: ''
        });

        this.prototype.events = {
            'input.range-slider': 'onInput',
            'change.range-slider': 'onInput',
            mouseover: function () {
                this._calculateOutputPosition();
            },
            click: 'noop'
        };
    }

    constructor(options) {
        super(options);
        this.value = options.defaultValue;
        this.render();
    }

    render() {
        const o = this.options;

        let templateStr = '<form>' + '<div class="range-slider-widget-control">';
        templateStr +=
            o.minRangeLabel.length > 0
                ? '<span class="min-value-label"><%= minRangeLabel %></span>'
                : '';
        templateStr +=
            o.maxRangeLabel.length > 0
                ? '<span class="max-value-label"><%= maxRangeLabel %></span>'
                : '';
        templateStr +=
            '<input name="range" type="range" class="range-slider" value="<%=defaultValue %>" step="<%= rangeStep %>" min="<%= minRange %>" max="<%= maxRange %>"/>' +
            '<output for="range" class="output left" />' +
            '</div>' +
            '</form>';

        this.template = template(templateStr);
        this.$el.append(this.template(this.options));
    }

    onInput(ev) {
        this.value = ev.target.value;
        this._calculateOutputPosition();
        this.$('.output').text(`${this.options.tooltipLabel}: ${this.value}${this.options.unit}`);
        this.options.onChange?.(this.value);
    }

    /**
     * Calculate output position.
     * Get the width of the input and calculate the left/right position
     * based on where the handle is currently positioned.         *
     */
    _calculateOutputPosition() {
        const width = this.$('.range-slider').width();
        const currentPoint = this.value - this.options.minRange; //scaled value of the input
        const totalPoints = this.options.maxRange - this.options.minRange;
        const pointPos = width / totalPoints;

        this.$('.output').text(`${this.options.tooltipLabel}: ${this.value}${this.options.unit}`);

        //0% position
        if (currentPoint == 0) {
            this.$('.output')
                .css({ left: `${0}px` })
                .removeClass('right')
                .addClass('left');
            return;
        }

        //< 50% position
        if (currentPoint <= totalPoints / 2) {
            this.$('.output').removeClass('right').addClass('left');
            this.$('.output').css({ left: `${pointPos * currentPoint}px`, right: 'auto' });
        }

        //> 50% position
        if (currentPoint >= totalPoints / 2) {
            this.$('.output').removeClass('left').addClass('right');
            this.$('.output').css({
                left: 'auto',
                right: `${(totalPoints - currentPoint) * pointPos}px`
            });
        }

        //100% position
        if (currentPoint == totalPoints) {
            this.$('.output')
                .css({ left: 'auto', right: `${0}px` })
                .removeClass('left')
                .addClass('right');
            return;
        }
    }

    /**
     * getValue get the current value of the range input
     * @return {number}
     */
    getValue() {
        return this.value;
    }

    /**
     * setValue set the value of the range input
     * @param {number} value
     */
    setValue(value) {
        this.value = value;
        this.$('.range-slider').val(value);
        this.$('.output').text(value + this.options.unit);
        this._calculateOutputPosition();
    }
}

export default WidgetSliderControl;
