// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { sortBy, template } from 'underscore';
import Backbone from 'backbone';
import myw from 'myWorld-base';
import Dialog from 'myWorld/uiComponents/dialog';
import TabControl from '../tabControl';
import addLayerControlHtml from 'text!html/addLayerControl.html';
import { DefineLayerControl } from './defineLayerControl';
import 'jquery-ui';
import 'jquery-ui-touch-punch';

const templatesHtml = $(addLayerControlHtml),
    addLayersDialog = templatesHtml.filter('#add-layers-dialog-template').html(),
    addLayersRow = templatesHtml.filter('#add-layers-row-template').html();

export class AddLayerControl extends Dialog {
    static {
        this.prototype.innerTemplate = template(addLayersDialog);

        this.prototype.events = {
            'keyup .text-layer-search': 'filterLayers'
        };

        this.mergeOptions({
            editPrivateLayerOnPhone: false, //For simplicity of the phone UI
            modal: true,
            autoOpen: false,
            width: 460,
            height: 'auto',
            resizable: false,
            position: { my: 'center', at: 'top+160', of: window, collision: 'fit' },
            title: '{:add_layer_title}',
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                },
                Create: {
                    text: '{:create_layer_btn}',
                    class: 'create-layer-btn',
                    click() {
                        this.defineLayerDialog();
                    }
                }
            },
            open(event, ui) {
                $(this).find('.text-layer-search').focus();
            }
        });
    }

    /**
     * @class Control that allows users to add layers to the map/layerManager.
     * The list of layers includes the layers that are accessible by the user but are not added to the map yet.
     * @param  {LayerControl}   owner   Owner of self
     * @constructs
     * @extends {Control}
     */
    constructor(layerManager, options) {
        //call control constructor
        super(options);
        this.editPrivateLayers = !(myw.app.isHandheld && !this.options.editPrivateLayerOnPhone);
        if (myw.isNativeApp || !this.editPrivateLayers) delete this.options.buttons['Create'];

        this.layerManager = layerManager;
    }

    render() {
        //build UI
        const maxHeight = $(window).height() - 100;
        this.options.maxHeight = maxHeight;
        this.options.contents = this.innerTemplate();

        super.render();
        this.translate(this.$el);
        this.addLayerTable = this.$('.add-layer-list');

        this.app.userHasPermission('addPrivateLayers').then(hasPerm => {
            if (hasPerm) {
                this.renderTabs();
            }
            this.show().then(() => {
                this.$el.dialog('open');
            });
        });
    }

    /**
     * Renders tabs to separate out the private layers from the system layers
     */
    renderTabs() {
        if (this.tabs) return;

        this.tabs = $('<div>', { id: 'add-layer-tabs' });
        this.$el.dialog('widget').children('.ui-dialog-titlebar').after(this.tabs);
        //get tab definitions
        const tabs = [
            {
                id: 'system-layers-tab',
                title: this.msg('system_tab_title')
            },
            {
                id: 'private-layers-tab',
                title: this.msg('private_tab_title')
            }
        ];

        this.tabControl = new TabControl(this, {
            el: this.tabs,
            tabs: tabs,
            initialTab: tabs[0].id
        });

        // Add a top border to the tab buttons
        this.tabControl._tabButtons.addClass('top-bordered');
        this.tabControl.on('change', tabId => {
            this.show();
        });
    }

    /**
     * Obtains the layer and layer groups that should be shown in the addLayerControl.
     * Opens the add layer dialog
     * @return {Promise} Resolved when the layers are ready to be added to the control
     */
    show() {
        const currentLayers = this.layerManager.layerList.filter(layer => layer.type === 'layer');
        const currentGroups = this.layerManager.layerList.filter(
                layer => layer.type === 'layer_group'
            ),
            currentLayerNames = currentLayers.map(l => l.layer_name),
            currentGroupNames = currentGroups.map(g => g.layer_name);

        //asynchronously get all of the available overlay layers in the system
        const layersPromise = this.layerManager
            .getLayerListLayersAndGroups()
            .then(layersAndGroups => {
                this.layerListItems = sortBy(layersAndGroups.layers, layer =>
                    layer.layerDef.name.toLowerCase()
                );

                const availableLayerDefs = this.layerListItems.filter(
                    item => !currentLayerNames.includes(item.layer_name)
                );

                if (this.tabControl?.currentTabId === 'private-layers-tab') {
                    const privateLayers = availableLayerDefs.filter(item =>
                        Object.prototype.hasOwnProperty.call(item.layerDef, 'owner')
                    );
                    this._showPrivateLayers(privateLayers, currentLayers);
                } else {
                    const systemLayers = availableLayerDefs.filter(
                        item => !Object.prototype.hasOwnProperty.call(item.layerDef, 'owner')
                    );

                    const allLayerGroups = sortBy(layersAndGroups.layerGroups, 'layer_name');
                    const availableLayerGroups = allLayerGroups.filter(
                        group => !currentGroupNames.includes(group.layer_name)
                    );

                    this._showAvailableLayers(systemLayers, availableLayerGroups);
                }
            });

        return layersPromise;
    }

    /**
     * Filter the table of layers when a key is pressed(released)
     */
    filterLayers(ev) {
        const filterText = this.$(ev.currentTarget).val();
        const rows = this.addLayerTable.children().toArray();
        rows.forEach(element => {
            const row = this.$(element),
                re = new RegExp(filterText, 'gi');

            if (row.text().search(re) > -1) row.show();
            else row.hide();
        });
    }

    defineLayerDialog(layerDef) {
        const { settings } = this.app.system;
        let options = {
            layerDef,
            onChangeCallback: this.show.bind(this),
            canUploadFiles: !!settings['core.privateLayerSettings']?.attachmentFeatureType,
            owner: this
        };
        new DefineLayerControl(this.layerManager, options);
    }

    /**
     * Displays the layers and layer groups that user can add to the map
     * @param  {Array<string>} availableLayerDefs  Layers that are not in the user's layer list
     * @private
     */
    _showAvailableLayers(availableLayerDefs, availableLayerGroups) {
        this.addLayerTable.empty();

        // if there are available layers get them, if not let the user know they are using all available layers
        if (availableLayerDefs.length > 0 || availableLayerGroups.length > 0) {
            this._appendLayers(availableLayerDefs);
            this._appendGroups(availableLayerGroups);
            this.showNoLayersMode(false);
        } else {
            this.showNoLayersMode(true);
        }

        // Resize the add layer control on window resize
        $(window)
            .resize(() => {
                this.$el.css({
                    'max-height': $(window).height() - 185,
                    'overflow-y': 'auto'
                });
            })
            .resize();

        this.$el.dialog('widget').find('.ui-dialog-buttonpane').find('.create-layer-btn').hide();
    }

    _showPrivateLayers(privateLayers, currentLayers) {
        this.addLayerTable.empty();

        const processedPrivateLayers = privateLayers.map(layer => {
            const currentLayerDefs = currentLayers.map(l => l.layerDef);
            layer['isAvailable'] = !currentLayerDefs.includes(layer.layerDef);
            return layer;
        });
        // if there are available layers get them, if not let the user know they are using all available layers
        if (privateLayers.length > 0) {
            this._appendLayers(processedPrivateLayers);
            this.showNoLayersMode(false);
        } else {
            this.showNoLayersMode(true);
        }

        // Resize the add layer control on window resize
        $(window)
            .resize(() => {
                this.$el.css({
                    'max-height': $(window).height() - 185,
                    'overflow-y': 'auto'
                });
            })
            .resize();
        this.$el.dialog('widget').find('.ui-dialog-buttonpane').find('.create-layer-btn').show();
    }

    /**
     * Creates a view for the layers and adds then to the addLayerControl
     * @param  {Array<string>} availableLayerNames  Names of layers already in the users layer list
     * @private
     */
    _appendLayers(availableLayerDefs) {
        availableLayerDefs.forEach(layerListItem => {
            const layerDef = layerListItem.layerDef;
            const properties = {
                name: layerDef.display_name || layerDef.name,
                description: this.layerManager.getLayerItemDescription(layerDef),
                thumbnail: layerDef.thumbnail,
                isAvailable: layerListItem.isAvailable,
                layerDef
            };

            let layerRow;
            if (this.tabControl?.currentTabId === 'private-layers-tab') {
                layerRow = new PrivateLayerView({
                    control: this,
                    model: properties
                });
            } else {
                layerRow = new AvailableLayerView({
                    control: this,
                    model: properties
                });
            }
            this.addLayerTable.append(layerRow.el);
        });
    }

    /**
     * Creates a view for the layer-groups and adds then to the addLayerControl
     * @private
     */
    _appendGroups(availableLayerGroups) {
        availableLayerGroups.forEach(group => {
            const groupRow = new AvailableLayerView({
                control: this,
                model: group
            });
            this.addLayerTable.append(groupRow.el);
        });
    }

    /**
     * Displays a message that there are no layers to show
     * @param  {boolean} noLayers Decides whether to show this mode or not
     * @private
     */
    showNoLayersMode(noLayers) {
        this.$('.text-layer-search')[noLayers ? 'hide' : 'show']();
        this.$('.no-available-layer-rows')[noLayers ? 'show' : 'hide']();
    }

    /**
     * Asks the layerManager to add the layer group to the map
     * @param {AvailableLayerView} group group's view that the add action came from
     */
    addGroupToMap(group) {
        this.layerManager.addLayerGroupToList(group.model, group.model.subLayers);

        this._afterAdd(group, true);
    }

    /**
     * Asks the layerManager to add the layer to the map
     * @param {AvailableLayerView} layer layer's view that triggered the add action
     */
    addLayerToMap(layerView) {
        // add the layer
        const layerListItem = this.layerListItems.find(
            l => l.layer_name === layerView.model.layerDef.id
        );

        // put the layers on the map, setting it to visible
        const targetLayer = this.layerManager.addLayerFromDef(layerListItem.layerDef, true);

        this._afterAdd(layerView, !!targetLayer);
    }

    /**
     * Shows a 'no more layers to add' message if its was the last item to add.
     * If the layer/group that was sent to be added wasn't a valid one, dislays an error message.
     * @param  {AvailableLayerView} layer         group/layer's view that triggered the add action
     * @param  {Boolean}            isValidLayer  If the layer that was sent to be aded was a valid layer
     * @private
     */
    _afterAdd(layer, isValidLayer) {
        if (isValidLayer) {
            //If this is the last row, show the no available layers message
            if (layer.$el.siblings().length === 0) {
                this.showNoLayersMode(true);
            }
            layer.remove();
        } else {
            //ENH display this message in the add layer control so it's (more) visible
            myw.app.message(this.msg('add_layer_error'), 2000, 2000, 'layers');
        }
    }
}

class AvailableLayerView extends Backbone.View {
    static {
        this.prototype.innerTemplate = template(addLayersRow);

        this.prototype.genericEvents = {
            'click .add-layer-button': 'addButtonHandler',
            'click .add-layer-cell': 'addButtonHandler',
            'click .expandLayerGroup': 'expandLayerGroup'
        };

        this.prototype.isEditable = false;
    }

    constructor(options) {
        super(options);
        this.control = options.control;
        this.model = options.model;
        const events = Object.assign(this.events || {}, this.genericEvents);
        this.render();

        this.delegateEvents(events);
    }

    render() {
        if (typeof this.model.isAvailable === 'undefined') this.model['isAvailable'] = true;
        this.setElement(
            this.innerTemplate(Object.assign(this.model, { isEditable: this.isEditable }))
        );
        this.control.translate(this.$el);
    }

    expandLayerGroup(ev) {
        ev.stopPropagation(); //so the click on expand button is not bubbled up to the row which adds the layer to the panel
        this.$('.sub-layer-list').toggle();
        this.$(ev.currentTarget).toggleClass('expanded');
    }

    addButtonHandler() {
        if (this.model.subLayers) this.control.addGroupToMap(this);
        else this.control.addLayerToMap(this);
    }

    remove() {
        this.$el.remove();
    }

    edit(e) {
        e.preventDefault();
        const layerDef = this.model.layerDef;
        if (layerDef) {
            this.control.defineLayerDialog(layerDef);
        }
    }
}

class PrivateLayerView extends AvailableLayerView {
    static {
        this.prototype.events = {
            'click .edit-btn': 'edit'
        };
    }

    render() {
        this.isEditable = this.control.editPrivateLayers;
        this.model.description = `${this.control.msg('owner')}: ${
            this.model.layerDef.owner
        } | ${this.control.msg('type')}: ${this.model.layerDef.datasource_spec.type}`;
        this.model.thumbnail = ''; // We don't want to show the thumbnails for private layers since they are all same
        super.render();
    }
}

/**
 * @typedef layerGroup

 * @property {number}                       id                     Id of the layer
 * @property {string}                         name                   Name of the layer
 * @property {string}                         description            Description for the layer-group
 * @property {boolean}                        exclusive              Whether the group's layers can only be exclusively selected or not
 * @property {string}                         thumbnail              Thumbnail image source path
 * @property {Array<string>}                  layers                 Names of layers that are assigned to this group
 */

export default AddLayerControl;
