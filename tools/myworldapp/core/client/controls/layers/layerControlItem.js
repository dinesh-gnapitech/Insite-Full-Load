// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import { Control } from 'myWorld/controls';
import layerControlHtml from 'text!html/layerControl.html';
import 'jquery-ui';
import 'jquery-ui-touch-punch';

const layerHtml = $(layerControlHtml).filter('#layer-template').html();

/**
 * @class UI Representation of a layer in {@link LayerControl}
 * @name LayerControlItem
 * @param  {layerListItem}      options.layerItem
 * @param  {Layer}          options.layer
 * @constructor
 * @extends {Control}
 */
export class LayerControlItem extends Control {
    static {
        this.prototype.innerTemplate = template(layerHtml);

        this.prototype.state = {
            open: false
        };

        this.prototype.events = {
            'click .expandWidgetGroup': 'toggleExpandedState'
        };
    }

    render() {
        const layerItem = this.options.layerItem;
        const layer = this.options.layer;

        this.$el.html(
            this.innerTemplate({
                layerItem: layerItem,
                thumbnail: layer.layerDef.thumbnail,
                tooltip: this.options.description,
                viewMode: layer.appViewMode() || '',
                open: false,
                isExpandable: this.options.widgetDefinitions.length
            })
        );

        this._renderWidgets();
    }

    _renderWidgets() {
        this.options.widgetDefinitions.forEach(async widgetDefinition => {
            const widget = new widgetDefinition({ layer: this.options.layer, app: this.app });
            await widget.render();
            this.$el.find('.layer-widget-container').append(widget.$el);
        });
    }

    toggleExpandedState(ev) {
        ev.stopPropagation();
        this.$('.expandWidgetGroup').toggleClass('expanded');
        this.$('.layer-widget-container').toggleClass('hidden');
    }
}
export default LayerControlItem;
