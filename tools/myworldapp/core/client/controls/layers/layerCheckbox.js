// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import Backbone from 'backbone';
import layerControlHtml from 'text!html/layerControl.html';
import 'jquery-ui';
import 'jquery-ui-touch-punch';

const checkboxHtml = $(layerControlHtml).filter('#checkbox-template').html();

export class LayerCheckbox extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(checkboxHtml);
        this.prototype.tagName = 'span';
        this.prototype.className = 'layer-checkbox-container';
    }

    /**
     * @class Checkbox used by the layers and sub-layers in the layer control
     *        Adds a mask on top of the checkbox that can make it look disabled
     * @param  {object}     options               Options that
     * @param  {Layer}  options.layer         Layer the checkbox refers to
     * @param  {string}     options.type:         'sub-layer-select' or 'layer-checkbox'
     * @param  {boolean}    options.isExclusive   Optional. If the layer is part of an exclusieve group
     * @param  {string}     options.inputName     Optional. Name of the group for a sub-layer checkbox
     * @constructs
     * @extends {Backbone.View}
     */
    constructor(options) {
        super(options);
        this.options = options;
        this.render();
        this.enable(); //Enable the input elements by default
    }

    render() {
        const isExclusive = this.options['isExclusive'] || false;
        const inputName = this.options['inputName'] || null;
        this.$el.html(
            this.innerTemplate(
                Object.assign(this.options, { isExclusive: isExclusive, inputName: inputName })
            )
        );
    }

    /**
     * Hides the checkbox mask so the checkbox looks enabled
     */
    enable() {
        this.$('.checkbox-mask').hide();
    }

    /**
     * Shows the checkbox mask so the checkbox looks disabled
     * We don't want to actually disable the checkbox because -
     * we dont want to lose the ability to check/uncheck it
     */
    disable() {
        this.$('.checkbox-mask').show();
    }

    /**
     * Toggles the check/uncheck on he checkbox by inducing a click on it
     */
    change() {
        this.$('input').click();
    }

    /**
     * Check/uncheck the checkbox according to the checked param
     * @param {bookean} Whether the checkbox should be checked or unchecked
     */
    setChecked(checked) {
        this.$('input').prop('checked', checked);
    }

    /**
     * Returns true if the checkbox is checked else false
     * @return {Boolean}
     */
    isChecked() {
        return this.$('input').prop('checked');
    }
}
export default LayerCheckbox;
