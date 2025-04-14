// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import View from 'myWorld/base/view';
import 'jquery-ui';
import 'jquery-ui-touch-punch';
import { LayerControlItem } from './layerControlItem';
import { LayerCheckbox } from './layerCheckbox';
import { WidgetRendererMixin } from './widgetRendererMixin';
import RenderOrderEditor from './renderOrderEditor';

export class LayerControlSubLayer extends View {
    static {
        this.prototype.tagName = 'li';
        this.prototype.className = 'sub-layer';

        this.prototype.events = {
            click: 'toggleCheckbox',
            //To stop the click on the checkbox to bubble up to a click on the group container
            'click  .sub-layer-select': function (ev) {
                ev.stopPropagation();
            },
            'change .sub-layer-select': 'updateSelection'
        };

        this.include(WidgetRendererMixin);
    }

    /**
     * @class UI Representation of a sub layer (layer that is part of a group)
     * @param  {LayerControl}      options.control
     * @param  {layerListItem}         options.model
     * @param  {Layer}             options.layer
     * @param  {LayerControlGroup} options.groupView
     * @param  {layerListGroup}        options.group
     * @param  {string}                options.description  Text to show in the tooltip when you hover over the layer row
     * @constructs
     * @extends  {View}
     * @mixes  {WidgetRendererMixin}
     */
    constructor(options) {
        super(options);

        const layer = options.layer;
        this.layer = layer;
        this.model = options.model;
        this.control = options.control;
        this.group = options.group;
        this.groupView = options.groupView;

        this.layerView = new LayerControlItem(options.control, {
            layerItem: this.model,
            layer: options.layer,
            description: options.description,
            widgetDefinitions: this.getDefinitions(layer.layerDef.control_item_class)
        });

        this.render();
    }

    render() {
        this.layerView.render();
        this.checkbox = new LayerCheckbox({
            layer: this.model,
            type: 'sub-layer-select',
            isExclusive: this.group.exclusive,
            inputName: this.group.layer_name
        });

        const renderOrderEditor = new RenderOrderEditor({
            owner: this,
            //Use the zIndex from user's session if available
            zIndex: this.model.zIndex ?? this.model.layerDef.options.zIndex,
            zIndexPointOffset: this.model.layerDef.options.zIndexPointOffset
        });

        this.$el
            .attr('data-layer', this.model.layer_name)
            .append(this.checkbox.$el)
            .append(this.layerView.el)
            .append(renderOrderEditor.$el);

        // Makes sure that the subLayer is enabled or disabled according to the layer's state in the layerManager
        const layer = this.control.layerManager.getLayer(this.model.layerDef.id);
        this.update(layer);

        this.setDisabled();
    }

    /**
     * Updates the enabled, valid and checked state of the layer
     */
    update() {
        this.enableOrDisable(this.layer.isEnabled);
        this.updateInvaildClass(this.layer.isInvalid);
        this.checkCheckbox(this.layer.isChecked);
    }

    /**
     * Enables or Disables (based on the enableLayer parameter) the overlay in the layers panel
     * by changing its style.
     */
    enableOrDisable(enableLayer) {
        if (enableLayer) this.$el.removeClass('overlay-disabled');
        else this.$el.addClass('overlay-disabled');
    }

    /**
     * Adds an invalid class to the sub layer if its inValid, else removes it
     * @param  {Boolean} isInvalid If the layer should be marked as inValid or not
     */
    updateInvaildClass(isInvalid) {
        this.$el.toggleClass('overlay-invalid', isInvalid);
    }

    toggleCheckbox(ev) {
        this.checkbox.change();
        ev.stopPropagation();
    }

    /**
     * Turns the layer on/off via the setChecked() method
     * If the layer is part of an exclusive group, then the previous selection is turned off
     */
    updateSelection(ev) {
        if (!this.control.isEditMode) {
            if (this.group.exclusive) {
                //Its part of an exclusive layer group
                //Mark the  currently selected radio button as checked
                $(ev.currentTarget).attr('checked', true);
                let previousSelection;

                this.groupView.subLayers.forEach(layerView => {
                    if (layerView.model.turned_on) {
                        previousSelection = layerView;
                        //Turn off the previously selected layer
                        previousSelection.model.turned_on = false;
                        previousSelection.checkbox.setChecked(false); //Since radio buttons don't update their checked status
                    }
                });
                if (previousSelection) previousSelection.setChecked();
            }

            this.setChecked();
            ev.stopPropagation();
        }
    }

    /**
     * Turns the layer on/off based on whether the checkbox or radio button has been checked or unchecked
     * Triggers 'subLayerSelect', so its group's checkbox can be updated
     */
    setChecked() {
        const checked = this.checkbox.isChecked();

        this.model.turned_on = checked;
        //If its group is turned on and the it is not disabled
        const isActive = this.group.turned_on && !this.$el.hasClass('overlay-disabled');

        //Only try to make the layer visible is the group is turned on and the layer is not disabled
        //A layer could be disabled because its out of the zoom scale or if its inValid
        if (isActive) this.$el.trigger('subLayerSelect', checked);
        this.control.layerManager.setSubLayerChecked(
            this.group.layer_name,
            this.model.layer_name,
            checked,
            !isActive
        );
    }

    setDisabled() {
        //Makes sure the disabled state is not removed if the overlay is not enabled in the layerManager
        if (!this.$el.hasClass('overlay-disabled')) {
            this.checkbox[this.group.turned_on ? 'enable' : 'disable']();
        }
    }

    /**
     * Used when the layer is already updated in the map by a process
     * Updates its turned_on flag and its checked property,
     * Asks the layer manager to updates its layerList accordingly.
     * Triggers 'subLayerSelect', so its group's checkbox can be updated
     * @param  {boolean} checked State that needs to be assigned to the layer checkbox
     */
    checkCheckbox(checked) {
        if (this.group.turned_on) {
            // Only change the checked status if the group is turned_on
            this.checkbox.setChecked(checked);

            this.model.turned_on = checked; // Updates the model
            this.$el.trigger('subLayerSelect', checked);

            this.control.layerManager.updateSubLayerInLayerList(
                this.group.layer_name,
                this.model.layer_name,
                checked
            );
        }
    }
}

export default LayerControlSubLayer;
