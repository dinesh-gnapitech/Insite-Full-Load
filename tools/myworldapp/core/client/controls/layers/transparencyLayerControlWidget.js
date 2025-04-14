// Copyright: IQGeo Limited 2010-2023
import { ILayerControlWidget } from './layerControlWidget';
import WidgetSliderControl from './widgetControls/widgetSliderControl';

/**
 * @class Allows Opacity control for a layer.
 * @name TransparencyLayerControlWidget
 * @constructor
 * @extends {LayerControlWidget}
 */
export class TransparencyLayerControlWidget extends ILayerControlWidget {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'transparency-layer-widget';

        this.prototype.events = {
            click: 'noop'
        };
    }

    render() {
        const defaultTransparency = this.options.layer.layerDef.transparency || 0;

        const sliderControl = new WidgetSliderControl({
            defaultValue: defaultTransparency,
            rangeStep: 5,
            tooltipLabel: this.msg('tooltip'),
            unit: '%',
            minRangeLabel: this.msg('minRangeLabel'),
            maxRangeLabel: this.msg('maxRangeLabel'),
            onChange: this.onChange.bind(this)
        });

        this.$el.append(sliderControl.$el);
    }

    onChange(value) {
        const opacity = this._transparencyToOpacity(value);
        if (typeof this.options.layer.maplibLayer.setOpacity !== 'undefined') {
            this.options.layer.maplibLayer.setOpacity(opacity);
        }
    }

    _transparencyToOpacity(value) {
        return 1.0 - value / 100;
    }

    noop(ev) {
        ev.stopPropagation();
    }
}

export default TransparencyLayerControlWidget;
