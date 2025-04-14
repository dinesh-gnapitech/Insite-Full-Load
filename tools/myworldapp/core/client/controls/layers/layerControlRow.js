// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import layerControlHtml from 'text!html/layerControl.html';
import myw from 'myWorld/base/core';
import View from 'myWorld/base/view';
import 'jquery-ui';
import 'jquery-ui-touch-punch';
import { LayerControlItem } from './layerControlItem';
import { LayerCheckbox } from './layerCheckbox';
import { WidgetRendererMixin } from './widgetRendererMixin';
import RenderOrderEditor from './renderOrderEditor';

const layerRowHtml = $(layerControlHtml).filter('#layer-row-template').html();

export class LayerControlRow extends View {
    static {
        this.prototype.innerTemplate = template(layerRowHtml);

        this.prototype.events = {
            click: 'toggleCheckbox',
            'click .layer-checkbox': 'updateSelection',
            'click .layer-list-delete': 'remove'
        };

        this.include(WidgetRendererMixin);
    }

    /**
     * @class UI Representation of a layer
     * @param  {LayerControl}  options.control
     * @param  {layerListItem}     options.model
     * @param  {Layer}         options.layer
     * @param  {string}            options.description  Text to show in the tooltip when you hover over the layer row
     * @constructs
     * @extends  {Backbone.View}
     * @mixes  {WidgetRendererMixin}
     */
    constructor(options) {
        super(options);

        const layer = options.layer;
        this.layer = layer;
        this.model = options.model;
        this.control = options.control;

        this.layerView = new LayerControlItem(options.control, {
            layerRow: this,
            layerItem: this.model,
            layer: layer,
            description: options.description,
            widgetDefinitions: this.getDefinitions(layer.layerDef.control_item_class)
        });
        this.render();
    }

    render() {
        const layerItem = this.model;

        this.setElement(
            this.innerTemplate({
                baseUrl: myw.baseUrl,
                layer: layerItem
            })
        );

        this.checkbox = new LayerCheckbox({ layer: layerItem, type: 'layer-checkbox' });

        this.$el.append(this.checkbox.$el);
        const renderOrderEditor = new RenderOrderEditor({
            owner: this,
            //Use the zIndex from user's session if available
            zIndex: this.model.zIndex ?? this.model.layerDef.options.zIndex,
            zIndexPointOffset: this.model.layerDef.options.zIndexPointOffset
        });
        this.$el.append(renderOrderEditor.$el);

        this.layerView.render();
        this.$el.prepend(this.layerView.el);
    }

    /**
     * Updates the enabled, valid and checked state of the layer
     */
    update() {
        this.enableOrDisable(this.layer.isEnabled);
        this.updateInvalidClass(this.layer.isInvalid);
        this.checkCheckbox(this.layer.isChecked);
    }

    /**
     * Removes the layer from the list and from the map
     */
    remove() {
        this.$el.remove();
        this.control.removeLayer(this);
    }

    /**
     * Enables or Disables (based on the enableLayer parameter) the overlay in the layers panel
     * by changing its style.
     * @param  {boolean} enableLayer
     */
    enableOrDisable(enableLayer) {
        if (enableLayer) this.$el.removeClass('overlay-disabled');
        else this.$el.addClass('overlay-disabled');
    }

    /**
     * Adds an invalid class to the sub layer if its inValid, else removes it
     * @param  {Boolean} isInvalid If the layer should be marked as inValid or not
     */
    updateInvalidClass(isInvalid) {
        this.$el.toggleClass('overlay-invalid', isInvalid);
    }

    /**
     * Sends the click to the layer's checkbox
     */
    toggleCheckbox(ev) {
        if (!this.control.isEditMode) {
            this.checkbox.change();
        }
    }

    /**
     * Handles the checkbox click on the layer control
     * @private
     */
    updateSelection(ev) {
        ev.stopPropagation(); //ENH: Do we really need this?
        if (!this.control.isEditMode) {
            this.setLayerChecked();
        }
    }

    /**
     * Asks the layerManager to make the layer visible is its checkbox is checked and vice versa
     */
    setLayerChecked() {
        const layerName = this.model.layer_name,
            checked = this.checkbox.isChecked();
        this.control.layerManager.setLayerChecked(layerName, checked);
        this.model.turned_on = checked; // Updates the model
    }

    /**
     * Updates the layer's checkbox
     * @param  {boolean} checked State that needs to be assigned to the layer checkbox
     */
    checkCheckbox(checked) {
        this.checkbox.setChecked(checked);
        this.model.turned_on = checked; // Updates the model
    }

    /**
     * Enable the layers that don't have the checkbox-disabled and/or out-of-scale data attribute set to true
     * This is to keep the inactive layers disabled
     */
    enable() {
        if (this.control.layerManager.layers[this.model.layer_name].isEnabled) {
            this.checkbox.enable();
        }
    }

    disable() {
        this.checkbox.disable();
    }
}

export default LayerControlRow;
