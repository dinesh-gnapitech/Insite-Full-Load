// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import myw from 'myWorld/base/core';
import * as Browser from 'myWorld/base/browser';
import layerControlHtml from 'text!html/layerControl.html';
import 'jquery-ui';
import 'jquery-ui-touch-punch';
import { LayerControlSubLayer } from './layerControlSubLayer';

const layerGroupHtml = $(layerControlHtml).filter('#layer-group-template').html();

export class LayerControlGroup extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(layerGroupHtml);

        this.prototype.events = {
            'click .relative': 'toggleCheckbox',
            'click .layer-group-select': 'updateSelection',
            'click .layer-list-delete': 'remove',
            'click .expandLayerGroup': 'toggleExpandedState',
            subLayerSelect: '_autoUpdateGroupState'
        };
    }

    /**
     * @class Creates a view to display the layer groups
     * @param  {LayerControl}  options.control
     * @param  {layerListGroup}    options.model
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        this.model = options.model;
        this.control = options.control;
        this.expanded = this.model.expanded || false;
        this.render();
    }

    render() {
        this.setElement(
            this.innerTemplate(Object.assign({ baseUrl: myw.baseUrl, thumbnail: null }, this.model))
        ); // Creates the group header
        this.checkbox = this.$('.layer-group-select');
        this.active = true;
        this.addSubLayers();
        this.expandLayerGroup();
    }

    /**
     * Creates views for the subLayers and adds them to the group's sub-layer-container
     */
    addSubLayers() {
        this.subLayers = this.model.subLayers.map(subLayer => {
            const layer = this.control.layerManager.getLayer(subLayer.layerDef.id);

            const subLayerView = new LayerControlSubLayer({
                control: this.control,
                groupView: this,
                group: this.model,
                layer: layer,
                model: subLayer,
                description: this.control.layerManager.getLayerItemDescription(subLayer.layerDef)
            });
            this.$('.sub-layer-container').append(subLayerView.el);

            return subLayerView;
        });
        this._autoUpdateGroupState();
    }

    toggleCheckbox() {
        this.checkbox.click();
    }

    /**
     * Handles the checkbox click on the layer group
     */
    updateSelection(ev) {
        if (!this.isEditMode) {
            this.setLayerChecked();

            ev.stopPropagation(); //so the click on expand button is not bubbled up to the row which adds the layer to the panel
        }
    }

    /**
     * Asks the layerManager to make the group visible is its checkbox is checked and vice versa
     * Called it setLayerChecked so it can be called by the layerControl on layerRow as well as groupRow
     */
    setLayerChecked() {
        let checked = this.checkbox.prop('checked');

        // When clicking on an indeterminate checkbox, Edge changes it to checked whereas other browsers uncheck it
        // We want the uncheck behaviour
        if (Browser.edge && this.isIndeterminate) {
            checked = false;
        }

        this.model.turned_on = checked;

        this.control.layerManager.setGroupChecked(this.model.layer_name, checked);

        this.subLayers.forEach(layerView => {
            layerView.setDisabled(); //Update the disabled state of the subLayers
        });
    }

    /**
     * Sets the groups checkbox to checked, unchecked or indeterminate according to its layers' state.
     * @param {boolean} checked  Whether the subLayer that triggered the subLayerSelect event is turnedOn or not.
     * @private
     */
    _autoUpdateGroupState() {
        const subLayersStateArray = this.model.subLayers.map(layer => layer.turned_on);
        this._setCheckboxState(subLayersStateArray);
    }

    /**
     * Sets the state of the tri-state group checkbox
     * @param {Array<boolean>} subLayersStateArray Array with the checked state of all the subLayers
     * @private
     */
    _setCheckboxState(subLayersStateArray) {
        const groupSelectBox = this.checkbox;
        const isGroupTurnedOn = this.model.turned_on;

        if (
            subLayersStateArray.includes(true) &&
            subLayersStateArray.includes(false) &&
            isGroupTurnedOn
        ) {
            //Indeterminate
            this.isIndeterminate = true;
            groupSelectBox.prop('indeterminate', true).prop('checked', true);
        } else if (
            subLayersStateArray.includes(true) &&
            !subLayersStateArray.includes(false) &&
            isGroupTurnedOn
        ) {
            //Checked
            this.isIndeterminate = false;
            groupSelectBox.prop('indeterminate', false).prop('checked', true);
        } else {
            //Unchecked
            this.isIndeterminate = false;
            groupSelectBox.prop('indeterminate', false).prop('checked', false);
        }
    }

    /**
     * Expands the layer group is this.expanded is true
     */
    expandLayerGroup() {
        this.$('.sub-layer-container').toggleClass('hidden', !this.expanded);
        this.$('.expandLayerGroup').toggleClass('expanded', this.expanded);
    }

    /**
     * Expands the layer group if it was collapsed and vice versa
     * @param  {object} ev Click event
     */
    toggleExpandedState(ev) {
        ev.stopPropagation(); //so the click on expand button is not bubbled up to the row which adds the layer to the panel
        this.$('.sub-layer-container').toggle();
        this.$('.expandLayerGroup').toggleClass('expanded');
        this.expanded = !this.expanded;
        this.control.layerManager.updateGroupExpandedState(this.model.layer_name, this.expanded);
    }

    /**
     * Updates the group's checkbox
     * @param  {boolean} checked State that needs to be assigned to the group's checkbox
     */
    checkCheckbox(checked) {
        this.checkbox.prop('checked', checked);
        this.model.turned_on = checked; // Updates the model
        this._autoUpdateGroupState();
    }

    /**
     * Removes the layer from the list and from the map
     */
    remove(ev) {
        this.$el.remove();
        this.control.removeGroup(this);
    }

    enable() {
        this.active = true;
        this.checkbox.prop('disabled', false);
    }

    disable() {
        this.active = false;
        this.checkbox.prop('disabled', true);
    }
}
export default LayerControlGroup;
