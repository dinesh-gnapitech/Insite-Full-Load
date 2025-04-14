// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template, filter } from 'underscore';
import layerControlHtml from 'text!html/layerControl.html';
import myw from 'myWorld/base/core';
import { applyIOS13ContextMenuHack } from 'myWorld/base/util';
import { trace as mywTrace } from 'myWorld/base/trace';
import { AddLayerControl } from './addLayerControl';
import { Control } from 'myWorld/base/control';
import { PluginButton } from 'myWorld/base/pluginButton';
import DefineLayerControl from './defineLayerControl';
import 'jquery-ui';
import 'jquery-ui-touch-punch';
import { LayerControlRow } from './layerControlRow';
import { LayerControlGroup } from './layerControlGroup';
import 'jquery-contextmenu';
import layersImg from 'images/toolbar/layers.svg';

const tabHtml = $(layerControlHtml).filter('#layers-tab-template').html();

const contextMenuTarget = '.layer-item-row, .layer-group-row';

const trace = mywTrace('layers');

export class LayersControl extends Control {
    static {
        this.prototype.innerTemplate = template(tabHtml);

        this.prototype.events = {
            'mouseover #state_save.state-save-list': 'showMenu',
            'mouseout #state_save.state-save-list': 'hideMenu',
            'click #layers_edit': 'enterEditMode',
            'click #layers_edit.active': 'enterViewMode',
            'click #layers_order': 'enterOrderMode',
            'click #layers_order.active': 'enterViewMode',
            'click #layers_add': 'openAddLayersDialog',
            'click #state_save:not(.state-save-list)': 'save',
            'click .state-save-list .save-state': 'save',
            'click .state-save-list .save-default-state': 'saveDefaultState'
        };

        this.mergeOptions({
            v: 2 //options format version
        });
    }

    /**
     * @class UI for users to control layers visibility
     * @param  {Application|Control}    owner    Owner of self
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        //call control constructor
        super(owner, options);

        this.layerManager = this.app.map.layerManager;
        this.system = this.app.system;

        //everytime there is a change to the overlays on the map, update our list
        this.app.on('overlays-changed nativeAppMode-changed', this.render.bind(this));

        this.app.on('overlayState-changed', ev => {
            this.updateOverlayItem(ev.layer);
        });

        const layerList = options.layerList;

        trace(5, `LayersControl: options.layerList: ${layerList?.map(el => el.layer_name)}`);
        //the call to layerManager will trigger an 'overlays-changed' event
        if (layerList) this.layerManager.setLayerList(layerList);
        else this.layerManager.ensureInitialLayers(); //only to get started as early as possible, since this is also called by GeoMapControl

        /**Tracks the mode the layer control is in.
         * @type {string} */
        this.mode = 'view';

        this.render(); //In case the 'overlays-changed' event has already been triggered
    }

    /**
     * Called when application closes
     * @return {object} Current layer list state
     */
    getState() {
        return {
            layerList: this.layerManager.getState(),
            v: 2
        };
    }

    /**
     * Sets the layer list as defined in state
     * @param {object} state    As returned by getState
     */
    setState(state) {
        this.layerManager.setLayerList(state.layerList);
    }

    //upgrades options from pre 4.2 to the 4.2 format
    upgradeOptionsToV2(options) {
        //note: upgraded databases might still have state saved in older formats so this method need to be kept
        //pre 4.2 layer list was saved as part of map state (which was undesirable if there was no layer control)
        const mapState = myw.app.getInitialState('map'); //this.app won't be set when this is called from View's constructor
        const mapLayerList = mapState?.layerList;
        if (mapLayerList) options.layerList = mapLayerList;
        return options;
    }

    /**
     * Updates the overlay list to match the status of the layer manager
     */
    render() {
        this.$el.html(this.innerTemplate({ baseUrl: myw.baseUrl }));
        this.showLayerEditButtons();

        /** References the layerManager's layerList
         * It is maintained by any layer additions or deletions on the map
         * @type {Array<layerListItem>} */
        this.layerList = this.layerManager.layerList;

        /** Holds the layers and layer groups views in the layerControl
         * @type {Object<name, LayerControlRow|LayerControlGroup>} */
        this.rowViews = {};

        this.layerList.forEach(layerItem => {
            this.addLayerToPanel(layerItem);
        });

        this.translate(this.$el);
        this.delegateEvents();
        this.ensureMode();

        //ENH: remove layers not in layer manager's list (even though there is  )

        this._configureContextMenu();
    }

    /**
     * Uses jquery.contextMenu to create a menu that appears on right click on the layer list
     * The menu has options to 'restore to default', 'All on' and 'All off'
     * @private
     */
    _configureContextMenu() {
        applyIOS13ContextMenuHack(this.$el[0]);

        const self = this; // use closure as the context for the functions will be clicked ui element
        const isEditable = function (key, opt) {
            const layerId = this[0].dataset.layer;
            const item = self.layerList.find(l => l.layer_name === layerId);
            return item && Object.prototype.hasOwnProperty.call(item.layerDef, 'owner');
        };
        const editPrivate = function (key, opt) {
            const { settings } = self.system;
            const layerId = this[0].dataset.layer;
            const item = self.layerList.find(l => l.layer_name === layerId);
            let options = {
                layerDef: item.layerDef,
                onChangeCallback: newDef => {
                    self.layerManager.removeLayerFromList(layerId);
                    if (newDef) {
                        self.layerManager.addLayerFromDef(newDef, true);
                    }
                },
                canUploadFiles: !!settings['core.privateLayerSettings']?.attachmentFeatureType
            };
            new DefineLayerControl(self.layerManager, options);
        };

        $.contextMenu('destroy', contextMenuTarget); //remove any stale menu
        $.contextMenu({
            // define which elements trigger this menu
            selector: contextMenuTarget,
            zIndex: 2,
            // define the elements of the menu
            items: {
                all_on: {
                    name: this.msg('all_on'),
                    callback: this.toggleAllLayers.bind(this, true)
                },
                all_off: {
                    name: this.msg('all_off'),
                    callback: this.toggleAllLayers.bind(this, false)
                },
                restore: {
                    name: this.msg('restore_to_default'),
                    callback: this._restoreToDefault.bind(this)
                },
                edit: { name: this.msg('edit_private'), callback: editPrivate, visible: isEditable }
            }
        }).bind(this);
    }

    /**
     * Display dialog for user to confirm if he wants to reset layer list
     * Restores the layer list to the default user's layer list
     * If there is no default layer list, lists all available layers and groups
     * @private
     */
    _restoreToDefault() {
        myw.confirmationDialog({
            title: this.msg('restore_to_default'),
            msg: this.msg('restore_confirm_msg'),
            confirmCallback: this._restoreSavedLayerList.bind(this)
        });
    }

    /**
     * Sets up the saved layer list for the current application as the user's current layer list
     * If there isn't one, it will set up a list corresponding to the available layers
     * @private
     */
    async _restoreSavedLayerList() {
        const layerList = await this._getSavedLayerList();
        this.layerManager.setLayerList(layerList);
    }

    /**
     * Returns the saved layer list for the current application
     * If there isn't one, returns all available layers
     * @private
     */
    async _getSavedLayerList() {
        const state = await this.app.getSavedStateFor(this, true, true);
        if (state) return state.layerList;

        //check for pre 4.2 format
        const appState = await this.app.getSavedState(true);
        if (appState && appState.map && appState.map.layerList) {
            return appState.map.layerList;
        }

        //return all available layers
        return this.layerManager.getDefaultLayerList();
    }

    /**
     * Turns all the layers and layer groups ON or OFF depending on the 'show' flag
     * @param {boolean}   show   Whether all layers/groups should be turned on or off
     */
    toggleAllLayers(show) {
        Object.values(this.rowViews).forEach(layerRow => {
            layerRow.checkCheckbox(show); //just checking doesnt make the layers visible
            layerRow.setLayerChecked();
        });
    }

    /**
     * Checks for user permissions
     * Shows the layer list edit, add and save buttons bar
     */
    showLayerEditButtons() {
        this.stateSaveButton = this.$('#state_save');
        //Checks if the logged in user has permission to modify the layer list
        this.app.userHasPermission('modifyLayerList').then(hasPerm => {
            if (hasPerm) this.$('.navigation-bar').removeClass('hidden');
            this._setPanelHeight();

            this.app.userHasPermission('persistState').then(hasPerm => {
                if (!hasPerm) this.stateSaveButton.remove();
            });
            this.app.userHasPermission('saveDefaultState').then(hasPerm => {
                if (!hasPerm) return;
                //Create a pull down with an additional option to save default app state for all users
                this.stateSaveButton.prop('title', '').empty();
                //Add list
                const stateSaveList = $('<ul>', { class: 'hidden sub-list' });
                //Add list items
                stateSaveList.append($('<li>', { class: 'save-state' }).text(this.msg('save')));
                stateSaveList.append(
                    $('<li>', { class: 'save-default-state' }).text(
                        this.msg('save_default_state_for_all_users')
                    )
                );

                this.stateSaveButton.addClass('state-save-list').append(stateSaveList);
            });
        });
    }

    /**
     * Adds a layer to the end of the layer panel list
     * @param {layerListItem|layerListGroup} layer          Layer/group to be added to the control
     */
    addLayerToPanel(layerItem) {
        if (layerItem.subLayers) {
            //its a group
            return this.addGroupToPanel(layerItem);
        } else {
            const layer = this.layerManager.getLayer(layerItem.layerDef.id);
            const newLayerRow = new LayerControlRow({
                control: this,
                model: layerItem,
                layer: layer,
                description: this.layerManager.getLayerItemDescription(layerItem.layerDef)
            });
            this._cacheRows(layerItem, newLayerRow);

            // Add the new overlay button.
            this.$('#layers-overlays').append(newLayerRow.el);

            // Update the element based on the current basemap and zoom-level
            this.updateOverlayItem(layer);
        }
    }

    /**
     * Adds the group to the control
     * @param {layerListGroup} group
     */
    addGroupToPanel(group) {
        const newGroup = new LayerControlGroup({
            control: this,
            model: group
        });

        // Add the new group button.
        this.$('#layers-overlays').append(newGroup.el);

        this.ensureMode();
        this._cacheRows(group, newGroup);
    }

    _cacheRows(layerItem, row) {
        const layer = this.layerManager.layers[layerItem.layer_name];

        if (layerItem.type !== 'layer_group' && !layer) return;

        const entryName = this._getListEntryName(layerItem);

        //Store the layer/layergroup view keyed by its name
        this.rowViews[entryName] = row;
    }

    /**
     * Returns an entry id for the layer control row cache
     * Appends "_group" for layer groups, so same named layers and layer groups can be differenciated
     * @param  {layerListItem|layerListGroup} layerItem
     * @return {string}
     * @private
     */
    _getListEntryName(layerItem) {
        const entryName = layerItem.layer_name;
        if (layerItem.type === 'layer_group') {
            return `${entryName}_group`;
        }
        return entryName;
    }

    /**
     * Called by the layout when the available area for self changes
     * Adjusts the height of the layer list so that scrolling works correctly
     */
    invalidateSize() {
        this._setPanelHeight();
    }

    /**
     * Sets the heights of the layers panel
     * This is required esp. to support all screen sizes and the use of virtual keyboard on touch devices
     * @private
     */
    _setPanelHeight() {
        const navBarHeight = this.$('.navigation-bar').hasClass('hidden')
                ? 0
                : this.$('.navigation-bar').outerHeight(),
            panelContentHeight = this.$el.height() - navBarHeight;

        this.$('#layers-overlays-container').height(panelContentHeight);
    }

    /**
     * Makes the layer rows sortable;
     * Disables the turn on and off capability
     * Shows the buttons required via the ensureMode method
     */
    enterEditMode() {
        this.app.recordFunctionalityAccess('core.layers_tab.organise');

        this._makeListSortable();

        this.mode = 'edit';
        this.ensureMode();

        Object.values(this.rowViews).forEach(layer => {
            layer.disable();
        });
    }

    enterOrderMode() {
        this.app.recordFunctionalityAccess('core.layers_tab.render_order');
        this.mode = 'render_order';
        this.ensureMode();
        Object.values(this.rowViews).forEach(layer => {
            layer.disable();
        });
    }

    /**
     * Makes the list sortable
     */
    _makeListSortable() {
        const that = this;
        this.$('.sort-layers').sortable({
            cursor: 'move',
            handle: '.reorder-button',
            axis: 'y',
            start() {
                this.sortable_start = that
                    .$('.sort-layers')
                    .sortable('toArray', { attribute: 'data-layer' });
            },
            stop() {
                this.sortable_end = that
                    .$('.sort-layers')
                    .sortable('toArray', { attribute: 'data-layer' });
                that._sortLayersList(this.sortable_end);
            }
        });
    }

    /**
     * Removes sortability from the layer rows;
     * Enables the turn on and off capability of the layer
     * Hides the edit buttons via the ensureMode method
     */
    enterViewMode() {
        this.mode = 'view';
        this.ensureMode();

        Object.values(this.rowViews).forEach(layer => {
            layer.enable();
        });

        //only attempt to destroy the sortable  jquery widget if it has been initalized
        if (this.$('.sort-layers').hasClass('ui-sortable')) {
            this.$('.sort-layers').sortable('destroy');
        }
    }

    /**
     * Makes sure the layer buttons and form elements are hidden or shown according to the current mode
     */
    ensureMode() {
        const isInEditMode = this.mode === 'edit';
        this.$('.reorder-button, .layer-list-delete')[isInEditMode ? 'show' : 'hide']();
        this.$(
            '.layer-checkbox-container, .layer-group-select, .master-layer-icon, .invalid-layer-icon'
        )[this.mode == 'view' ? 'show' : 'hide']();

        //Update edit button state and tooltip
        this.$('#layers_edit')
            .toggleClass('active', isInEditMode)
            .prop('title', this.msg(isInEditMode ? 'done_edit' : 'edit'));

        //Update order button state and tooltip
        this.$('#layers_order')
            .toggleClass('active', this.mode === 'render_order')
            .prop('title', this.msg(this.mode === 'render_order' ? 'done_order' : 'order_layers'));
        this.$('#layers-overlays').toggleClass('order-mode', this.mode === 'render_order');

        if (isInEditMode) {
            //if the sortable jquery widget has not been initalized
            if (!this.$('.sort-layers').hasClass('ui-sortable')) {
                this._makeListSortable();
            }
        }

        this.$('.render-order-container')[this.mode == 'render_order' ? 'show' : 'hide']();
    }

    /**
     * handles the click on the add layer list button
     */
    openAddLayersDialog() {
        this.app.recordFunctionalityAccess('core.layers_tab.add_layers');
        if (!this.addLayerControl) {
            this.addLayerControl = new AddLayerControl(this.layerManager, { app: this.app });
        }
        this.addLayerControl.render();
    }

    /**
     * Sorts this.layerList to match the order specified in layerIdArray i.e. list of layer/group ids
     * @param  {Array<string>} layerIdArray Array of layer names in the desired layer order
     * @private
     */
    _sortLayersList(layerIdArray) {
        const layersbyName = {};

        this.layerList.forEach(layer => {
            const key =
                layer.type == 'layer_group' ? `group_${layer.layer_name}` : layer.layer_name;
            layersbyName[key] = layer;
        });

        this.layerList.length = 0; //empties the layerList so it can be repopulated in the correct order

        let sequence = 1;
        layerIdArray.forEach(layerName => {
            const l = layersbyName[layerName];
            l.sequence = sequence++;
            if (l.subLayers) {
                const subLayers = l.subLayers;
                l.subLayers = [];

                //update the sequence of all its subLayers
                subLayers.forEach(subLayer => {
                    subLayer.sequence = l.sequence;
                    l.subLayers.push(subLayer);
                });
            }
            this.layerList.push(l);
        });
    }

    /**
     * Updates a item in the layer list
     * Verifies isChecked and isEnabled status and changes the css styles acordingly
     * @param  {Layer} overlay
     */
    updateOverlayItem(overlay) {
        Object.values(this.rowViews).forEach(layerView => {
            if (layerView.model.subLayers) {
                //Update any matching subLayer if the group is turned on
                const subLayerView = layerView.subLayers.find(
                    subLayer => subLayer.model.layer_name === overlay.layerDef.id
                );

                if (subLayerView) {
                    const isGroupTurnedOn = this.layerManager.getLayerFromLayerList(
                        layerView.model.layer_name,
                        true
                    ).turned_on;
                    layerView.checkCheckbox(isGroupTurnedOn); //update the turned_on flag in group's view
                    subLayerView.update();
                }
            } else if (layerView.model.layer_name === overlay.layerDef.id) {
                //Update any matching layer
                layerView.update();
            }
        });
    }

    /**
     * Removes the layer from the model and asks the layerManager to remove it from the map
     * @param  {LayerControlRow} layer The layer view that is being removed
     */
    removeLayer(layer) {
        this.rowViews = filter(this.rowViews, view => view !== layer);
        this.layerManager.removeLayerFromList(layer.model.layer_name);
    }

    /**
     * Removes the group from the model and asks the layerManager to remove it
     * @param  {LayerControlGroup} group  The group view that is being removed
     */
    removeGroup(group) {
        // Remove the group
        this.rowViews = filter(this.rowViews, view => view !== group);
        this.layerManager.removeGroup(group.model.layer_name);
    }

    /**
     * update the app state with any changes or create a new one if a new user
     * @param  {boolean} asDefault If true the default app state is saved for all users
     */
    saveState(asDefault = false) {
        //ENH: convert into button provided by application
        this.app.saveState(true, asDefault).then(
            () =>
                this.app.message(
                    this.msg(`${asDefault ? 'default_' : ''}state_saved_ok`),
                    2000,
                    2000
                ),
            () =>
                this.app.message(
                    this.msg(`${asDefault ? 'default_' : ''}state_saved_not_ok `),
                    2000,
                    2000
                )
        );
        this.enterViewMode();
    }

    save() {
        this.saveState();
    }

    /**
     * Save application default state for all users
     */
    saveDefaultState() {
        this.saveState(true);
    }

    remove() {
        $.contextMenu('destroy', contextMenuTarget);
        super.remove();
    }

    /**
     * Returns layer list information in a way suitable to send to the database
     * @private
     */
    _flattenLayerData() {
        let layerData = this.layerManager.layerList;

        layerData.forEach(layer => {
            if (layer.subLayers) {
                // its a group; remove the layers from its model
                layerData = layerData.filter(l => l !== layer);
                const { subLayers, ...res } = layer;
                // Add the sublayers to the layer data
                layerData = [...new Set([res, ...layerData, ...subLayers])];
            }
        });
        return layerData.map(l => {
            // eslint-disable-next-line no-unused-vars
            const { layerDef, ...res } = l;
            return res;
        });
    }

    showMenu() {
        if (this.$el.attr('class').includes('inactive')) return;
        this.stateSaveButton.find('ul').show();
    }

    hideMenu() {
        this.stateSaveButton.find('ul').hide();
    }
}

LayersControl.prototype.buttons = {
    //used in phone layout
    view: class extends PluginButton {
        static {
            this.prototype.id = 'a-layers';
            this.prototype.titleMsg = 'menu_msg';
            this.prototype.imgSrc = layersImg;
        }

        action() {
            this.app.layout.pages.layers.toggle(true);
        }
    }
};

export default LayersControl;
