// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control } from 'myWorld/base/control';
import geometry from 'myWorld/geometry/geometry';
import { msg as mywMsg, latLng, latLngBounds } from 'myWorld-base';
import { MapControl, SelectionMode } from 'myWorld/map';
import activeContextMenuItemImg from 'images/activeContextMenuItem.png';
import inactiveContextMenuItemImg from 'images/inactiveContextMenuItem.png';

const msg = mywMsg('InternalsControl');

/* Some notes on what the DOM looks like and who owns what.

    An InternalsControl owns this DOM:
        <div id='internalsContainer-floorplan'>     Top level container for internals (this.internalsContainerDiv)
            <div id='internalsMap-floorplan'>       Container for map. Given to MapControl as container for map (this.internalsMapDiv)
            <div id='internalsButtons-floorplan'>   Container for buttons

   In Tab View, the above DOM sits inside
    <div id='internals-div_floorplan_tab-space'>    Created/owned by TabControl
        <div id='internalsContainer-floorplan'>

   In Expanded View, it sits inside
    <div id='internals-large-container-floorplan'>  Created when internals expanded (_expandInternals) and managed by
        <div id='internalsContainer-floorplan'>     ViewManager

*/

export class InternalsControl extends Control {
    static {
        this.prototype.messageGroup = 'InternalsControl';

        this.mergeOptions({
            contextmenuWidth: 150
        });
    }

    /**
     * @class Provides a view onto a single internals world. Owns a MapControl that does the display and creates appropriate
     *  expand and shrink buttons.
     *
     * @constructs
     * @param  {Application} owner                         The myWorld application
     * @param  {object}          options
     */
    constructor(owner, options) {
        super(owner, options);

        /** Current mapControl in use to display an internals world
            @type {MapControl}*/
        this.map = null;

        /** The mode on which the internals map is displayed 'small', 'halfscreen' or 'fullscreen'
            @type {string} */
        this.mode = options.mode || 'small';

        this.plugin = options.plugin;

        /** Type of internals world being display. For example 'floorplan'
            @type {string}  */
        this.worldType = options.worldType;

        /** Feature that owns the world being displayed
            @type {Feature} */
        this.worldOwner = options.feature;

        this.isSelectable = true;

        /** Describes the view of the internals the user is interested in and is set when the control is first instantiated or in setView.
            Until the user pan/zooms, this will be the view we used when restoring map view .
            @type {worldView}  */
        this.initialView = options.initialView;

        /** Used to record the view the map should be looking at across GUI changes
            @type {LatLngBounds} */
        this.mapView = undefined;

        this.layout = options.layout || 'desktop';

        this.noButtons = options.noButtons;

        this._addViewContainer(this.plugin, options.feature);

        //Items for context menu that appears on right click (on long press for touch devices)
        const setDefaultView = {
            text: msg('zoom_to_object'),
            internalText: 'default_view',
            callback: this.setDefaultView.bind(this),
            icon: inactiveContextMenuItemImg
        };
        const clearSelection = {
            text: msg('clear_selection'),
            internalText: 'clear_selection',
            callback: this._clearSelection.bind(this),
            icon: inactiveContextMenuItemImg
        };
        const multipleSelect = {
            text: msg('multiple_select'),
            internalText: 'multiple_select',
            callback: this._toggleMultipleSelect.bind(this),
            icon: inactiveContextMenuItemImg
        };
        this.contextMenuItems = [setDefaultView, clearSelection, multipleSelect];
    }

    /**
     * Cleanup DOM elements owned by this control.
     */
    cleanup() {
        // Clear out any orphaned versions
        const div = $(`#internalsContainer-${this.worldType}`);
        div.html('');
        div.remove();

        // Remove from large view panel
        const cName = `internals-large-container-${this.worldType}`;
        this.plugin.app.layout.mapViewManager.unregister(cName);
        $(`#${cName}`).remove();
    }

    /**
     * Get the state of the control - its view and mode.
     * @return {internalsState} State of this control
     */
    getState() {
        return { view: this.getWorldView(), mode: this.mode };
    }

    /**
     * Set the state of the control - its view and mode
     * @param {viewState} state
     * @param {Feature} feature
     * @return {Promise}
     */
    setState(state, feature) {
        return this.setView(state.view, feature, false);
    }

    /**
     * Return current view for this control
     * @return {worldView} World view information
     */
    getWorldView() {
        return {
            worldType: this.worldType,
            worldName: this.map?.worldId,
            bounds: this.map?.getBounds(),
            centre: this.map?.getCenter(),
            zoomLevel: this.map?.getZoom()
        };
    }

    /**
     * Add the DIV that will contain the map control and buttons.
     * @param {InternalsPlugin} plugin
     * @param {Feature} feature
     * @private
     */
    _addViewContainer(plugin, feature) {
        if (!this.internalsContainerDiv) {
            let internalsContainer;

            internalsContainer = $('<div/>', {
                id: `internalsContainer-${this.worldType}`,
                class: 'hidden smallViewContainer left-panel-centered'
            });
            this.internalsMapDiv = $('<div/>', {
                id: `internalsMap-${this.worldType}`,
                class: 'internalsMap-small'
            });
            internalsContainer.append(this.internalsMapDiv);

            this.$el.append(internalsContainer);

            this.internalsContainerDiv = internalsContainer;

            this._buildButtons();

            this.translate(this.internalsContainerDiv);
        }
    }

    /**
     * Provides large view container name
     * @return {string}
     * @private
     */
    _largeViewContainerName() {
        return `internals-large-container-${this.worldType}`;
    }

    /**
     * Handler for button click event.
     */
    expandInternalsClick() {
        this.expandInternals();
    }

    get isVisible() {
        return this._isVisible;
    }

    /**
     * To be called when some aspect of visibility has changed
     * @param  {Boolean} isVisible
     */
    visibilityChanged(isVisible) {
        this._isVisible = isVisible;
        if (isVisible) {
            if (this.map) {
                // When a map is hidden during a zoom animation it can lock up.
                // So if we find the map in animation zoom mode we end the zoom.
                if (this.map._animatingZoom) this.map._onZoomTransitionEnd();
                this.map.invalidateSize();
            } else {
                if (this.initialView)
                    this.setView(this.initialView, this.app.currentFeature, false);
                else this.setViewForFeature(this.app.currentFeature);
                this.initialView = undefined;
            }
        }
    }

    /**
     * Set view for the provided feature
     * @param {Feature} currentFeature
     * @param {boolean} zoomTo  Whether to zoom to the feature or not
     */
    setViewForFeature(currentFeature, zoomTo) {
        const internalsView = this._getInternalsView(currentFeature);
        if (!internalsView) return;
        return this.setView(internalsView, currentFeature, zoomTo);
    }

    /**
     * Zooms to the current object
     */
    setDefaultView() {
        this.setViewForFeature(this.worldOwner, true);
    }

    /**
     * Sets the view of the internals map.
     * If drawing a different world, the map div is rebuilt
     * @param {worldView}   worldView       Details of the world view to display
     * @param {Feature} [feature]       Feature to highlight on the map
     * @param {boolean}     [zoomTo=false]  Whether to zoom to the feature or not
     */
    setView(worldView, feature, zoomTo) {
        this.ensureVisible();

        if (this.worldView && worldView.worldName == this.worldView.worldName) {
            // same world
            if (zoomTo) {
                //  need to update the current view
                this._setView(worldView, feature, true);
            }
        } else {
            //different world
            this.worldView = worldView;
            this.worldViewValid = true;

            if (!this.map) {
                this._createMapControl(worldView);
            }
            // update the world owner
            if (feature?.isWorldOwner(worldView.worldName)) this.worldOwner = feature;

            return this._setWorld(worldView).then(() => this._setView(worldView, feature, zoomTo));
        }
    }

    /**
     * Creates a new instance of MapControl class
     * @param  {object} worldView
     * @private
     */
    _createMapControl(worldView) {
        let zoomLevel = worldView.zoomLevel || 20;
        const centre = worldView.centre || worldView.bounds.getCenter();

        this.map = new MapControl(this, this.getMapDiv().attr('id'), worldView.worldName, {
            center: centre,
            zoom: zoomLevel,
            contextmenuWidth: this.options.contextmenuWidth
        });
        if (!worldView.zoomLevel) {
            this.map.fitBounds(worldView.bounds);
        }
        this.map.toggleZoomSlider(this.internalsContainerDiv, false);

        this.app.fire('new-map', { map: this.map, owner: this });
    }

    /**
     * Low level setting of view
     * @param {worldView} worldView
     * @param {Feature} feature
     * @param {Boolean} zoomTo
     * @private
     */
    _setView(worldView, feature, zoomTo) {
        const centre = worldView.centre || worldView.bounds.getCenter();
        const zoomLevel = worldView.zoomLevel || this.map.getBoundsZoom(worldView.bounds);
        this.map.setView(centre, zoomLevel, { animate: false });
        this.map.handleCurrentFeatureSet({ zoomTo: zoomTo });
        if (zoomTo) this.map.zoomTo(feature);
    }

    /**
     * Reset map zoom to be truely within min/max zoom of layers
     * @private
     */
    _resetZoom() {
        // ENH: Check to see if there is an alternative.
        const layerList = this.map.layerManager.layerList;
        if (!layerList.length) return;
        let minZoom = Infinity;
        let maxZoom = -Infinity;
        const zoom = this.map.getZoom();
        layerList.forEach(layer => {
            minZoom = Math.min(minZoom, layer.layerDef.min_scale);
            maxZoom = Math.max(maxZoom, layer.layerDef.max_scale);
        });

        if (zoom < minZoom) this.map.setZoom(minZoom);
        if (zoom > maxZoom) this.map.setZoom(maxZoom);
    }

    /**
     * Setup control so that it can view a particular drawing
     * @param {worldView} worldView
     * @private
     */
    async _setWorld(worldView) {
        this.worldView = worldView;
        const map = this.map;
        map.setWorld(worldView.worldName);
        const worldType = worldView.worldName.split('/')[0];

        map.layerManager.removeLayers();

        const layerDefs = await this._getInternalsLayerDefs(worldType);

        //wait for layers to have been initialized/loaded
        await Promise.allSettled(
            layerDefs.map(layerDef => {
                // This allows us to maintain backward compatibility of layer definitions.

                //setup layer option that specified the world name
                //used by both tile and vector layer types
                layerDef.options = {
                    worldName: worldView.worldName
                };

                const layer = map.layerManager.addLayerFromDef(layerDef, true); //ENH: should return a promise for when the layer has effectively been added
                return layer.initialized;
            })
        );

        //after layers to have been initialized/loaded reset the map's zoom
        this._resetZoom();

        // Wait for map and tiles loaded (if there are any) to ensure that anything highlighted when we do an expand/shrink
        // is highlighted again correctly.
        await map.ready;

        if (this.isSelectable) {
            // enable selection mode
            this.map.setInteractionMode(
                new SelectionMode(this.map, {
                    contextMenuItems: this.contextMenuItems
                })
            );
        }

        return map;
    }

    /**
     * Obtains the tile layers that display an internal world for the current application and drawing type
     * @param  {worldView}     worldView  Details of the world view to display
     * @return {Promise<Array<layerDef>>}
     * @private
     */
    async _getInternalsLayerDefs(worldType) {
        if (!this._internalsLayerDefPromise) {
            //this caches the layerDefinition request
            this._internalsLayerDefPromise = this.app.getLayersDefs();
        }

        const layerDefs = await this._internalsLayerDefPromise;

        return layerDefs.filter(
            layerDef =>
                (layerDef.category == 'internals' && worldType == 'int') ||
                layerDef.category == worldType
        );
    }

    /**
     * Calculate internals view (zoom, centre, world name etc) suitable for feature
     * @param  {Feature} feature
     * @return {worldView}  Returns undefined if there is no adequate view in world type for the given feature
     * @private
     */
    _getInternalsView(feature) {
        // construct internals view from the geometry on the feature for the world type
        let geom = feature.getGeometryForWorldType(this.worldType);

        let worldName = geom?.world_name;

        if (!geom) {
            //no geometry for the world type.
            if (
                this.worldOwner.getUrn() == feature.getUrn() || //Feature is the current world owner
                feature.getOwnerWorldTypes().includes(this.worldType) //Feature is world owner in different world from current
            ) {
                //feature is a world owner - return a "world owner" view, using the geo geometry to calculate bounds
                worldName = feature.worldNameForType(this.worldType);
                geom = feature.getGeometryForWorldType('geo');
            }
        }

        if (!geom) return this._getInternalsViewLegacy(feature);

        // ENH: Don't zoom to bounds if we have been to this view before. Go back to previous position and zoom
        const bbox = geometry(geom).bbox();
        const bounds = latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);

        const worldView = {
            worldName,
            bounds
        };

        return worldView;
    }

    /**
     * Obtains the view details of a world owned by a feature.
     * @param  {Feature} feature The feature that owns the world
     * @return {worldView}          Details of the world view or null if the feature doesn't own a world
     * @private
     */
    _getInternalsViewLegacy(feature) {
        const worldViewStr = feature.properties.myw_internal_world_view;

        if (!worldViewStr) return;

        const worldAttrs = worldViewStr.split('|'),
            minMaxLevelsStr = worldAttrs[3].split(','),
            centreCoords = worldAttrs[2].split(',');

        const worldView = {
            worldType: 'int',
            worldName: `int/${worldAttrs[0]}`,
            zoomLevel: parseInt(worldAttrs[1], 10),
            maxZoomLevel: parseInt(minMaxLevelsStr[1], 10),
            minZoomLevel: parseInt(minMaxLevelsStr[0], 10),
            centre: latLng(centreCoords[1], centreCoords[0])
        };

        if (this.mode !== 'small') {
            worldView.zoom += 2; //zoom in a touch for the large map
        }

        this.worldType = 'int';

        return worldView;
    }

    /**
     * Ensures the necessary divs are visible
     */
    ensureVisible() {
        if (this.map === null) {
            //there is no internals world being shown, so show it
            if (this.mode == 'small') {
                this.internalsContainerDiv.show();
            }
        }
    }

    /**
     * @return {jqueryElement} The div where the map should created
     */
    getMapDiv() {
        return this.mode == 'small' ? this.internalsMapDiv : this.internalsMapDiv;
    }

    /**
     * @param  {boolean} keepCurrentZoom
     * Handler when the expand button is pressed
     */
    expandInternals(keepCurrentZoom) {
        // Increase a zoom level to have a better view of the object when expanding it
        const currentZoom = this.map.getZoom();
        if (keepCurrentZoom) this.map.setZoom(currentZoom);
        else this.map.setZoom(currentZoom + this.plugin.zoomIncreaseOnExpand);

        const feature = this.plugin.app.currentFeature;
        this.map.toggleZoomSlider(this.internalsContainerDiv, true);

        if (!this.map) {
            return this.setViewForFeature(feature).then(() => {
                this._expandInternals();
            });
        } else return Promise.resolve(this._expandInternals());
    }

    /**
     * Callback for when ViewManager resizes view due to making another one visible/hidden
     * @param  {string} width
     * @private
     */
    _onViewResize(width) {
        // Needed to reset and unlock map if it was hidden during setView
        if (this.map) {
            if (this.map._animatingZoom) this.map._onZoomTransitionEnd();
            this.map.invalidateSize();
        }

        if (width === '50%') {
            if (this.expandMoreButton) this.expandMoreButton.show();
            if (this.shrinkHalfButton) this.shrinkHalfButton.hide();
        }
    }

    /**
     * Expand internals view
     * @param  {Integer} zoomLevel
     * @private
     */
    _expandInternals() {
        // Rearrange the GUI
        const cName = this._largeViewContainerName();
        const lc = $('<div>', { id: cName, class: 'viewContainer' });

        const title = this.plugin._titleFor(this.worldType);
        lc.append($('<div>', { class: 'viewContainerLabel' }).html(title));

        // Push new internals view container view onto left hand side of view
        $('#view-container-start').after(lc);
        this.plugin.app.layout.mapViewManager.register(
            cName,
            lc,
            true,
            this._onViewResize.bind(this)
        );

        this.internalsContainerDiv.detach();
        if (this.mode == 'small' && Object.entries(this.plugin.tabControl.tabs).length === 1) {
            //All the tabs in the small view have been expanded so hide the header
            this.plugin.smallViewHeader.hide();
        }
        this.plugin.removeTab(this.worldType);

        lc.append(this.internalsContainerDiv);
        this.plugin.app.layout.mapViewManager.show(cName);
        this.plugin.occupied = true;

        this.internalsContainerDiv.removeClass('smallViewContainer');
        this.internalsContainerDiv.addClass('internalsMap-large');

        this.mode = 'halfscreen';

        this._buildButtons();

        // Now reset map size and zoom level
        this._restoreMapView();

        //Center the label according to its width
        const label = lc.find('.viewContainerLabel');
        label.css('left', `calc(50% - ${label.outerWidth() / 2}px)`);
    }

    /**
     * Restore map view after manipulation of GUI
     * @private
     */
    _restoreMapView() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    _clearSelection() {
        this.app.clearResults();
    }

    /**
     * toggles multipleSelect
     */
    _toggleMultipleSelect() {
        //Set flag to oposite setting
        this.multipleSelect = !this.multipleSelect;

        //find multiple select item from context menu items
        const multipleSelectItem = this.contextMenuItems.find(item => {
            return item.internalText == 'multiple_select';
        });

        //Set icon to new setting
        multipleSelectItem.icon = this.multipleSelect
            ? activeContextMenuItemImg
            : inactiveContextMenuItemImg;

        //reset world (to show icon)
        this._setWorld(this.worldView);

        //enable multiple select
        this.map._toggleMultipleSelect();
    }

    /**
     * Build the expand/shrink buttons on the control
     * @private
     */
    _buildButtons() {
        if (this.noButtons) return;

        const mainDiv = this.internalsContainerDiv;
        const buttonsId = `internalsButtons-${this.worldType}`;
        let buttonsDiv = $(`#${buttonsId}`);

        if (buttonsDiv.length === 0) buttonsDiv = $('<div>', { id: buttonsId }).appendTo(mainDiv);
        else buttonsDiv.html('');

        if (this.mode == 'small') {
            // SMALL view

            this.expandButton = $(
                '<button type="button" class="internalsMap-expandButton overMapButton" title="{:expand}"/>'
            )
                .click(this.expandInternalsClick.bind(this))
                .appendTo(buttonsDiv);
        } else {
            // LARGE view
            this.shrinkButton = $(
                '<button type="button" class="shrinkButton overMapButton" title="{:shrink}"/>'
            )
                .click(this.shrinkInternals.bind(this))
                .appendTo(buttonsDiv);

            this.shrinkHalfButton = $(
                '<button type="button" class="shrinkHalfButton overMapButton" title="{:shrink_half}"/>'
            )
                .click(this.shrinkToHalf.bind(this))
                .appendTo(buttonsDiv);

            this.expandMoreButton = $(
                '<button type="button" class="expandMoreButton overMapButton" title="{:expand_more}"/>'
            )
                .click(this.expandFullInternals.bind(this))
                .appendTo(buttonsDiv);
        }

        this.translate(buttonsDiv);
    }

    /**
     * Shrink internals view back to below detail control
     */
    shrinkInternals() {
        // Decrease a zoom level to have a better view of the object when shrinking it
        const currentZoom = this.map.getZoom();
        this.map.setZoom(currentZoom - this.plugin.zoomIncreaseOnExpand);

        this.plugin.smallViewHeader.show();

        // Rearrange GUI
        const id = this.worldType;
        const control = this.plugin.controls[id];
        const tabControl = this.plugin.tabControl;
        const cName = this._largeViewContainerName();

        this.internalsContainerDiv.detach();
        $(`#${cName}`).remove();
        this.plugin.app.layout.mapViewManager.hide(cName);

        tabControl.addTab({ id: id, object: control, title: this.plugin._titleFor(id) });

        tabControl.tabs[id].div.append(this.internalsContainerDiv);
        tabControl.currentTabId = ''; // Force a switch to tab if there is no other tab
        tabControl.switchToTab(id);

        this.internalsContainerDiv.addClass('smallViewContainer');
        this.internalsContainerDiv.removeClass('internalsMap-large');

        this.map.toggleZoomSlider(this.internalsContainerDiv, false);

        this.mode = 'small';
        this._buildButtons();

        this._restoreMapView();
    }

    /**
     * Handler when the expand full button is pressed
     */
    expandFullInternals() {
        const cName = this._largeViewContainerName();
        this.mode = 'fullscreen';

        if (this.app.layout.mapViewManager.showInFull(cName)) {
            if (!this.noButtons) {
                this.expandMoreButton.hide();
                this.shrinkHalfButton.show();
            }
            this._restoreMapView();
        }
        this.map.toggleZoomSlider(this.internalsContainerDiv, true);
    }

    /**
     * Shrink internals to half the screen
     */
    shrinkToHalf() {
        const cName = this._largeViewContainerName();
        this.mode = 'halfscreen';
        this.plugin.app.layout.mapViewManager.show(cName);
        this.expandMoreButton.show();
        this.shrinkHalfButton.hide();
        this._restoreMapView();
    }

    /**
     * Do the necessary tweaks for print layout.
     * @param {worldView} view
     * @param {string} mode    Expand mode
     * @param {Feature} feature
     */
    setUpForPrintLayout(view, mode, feature) {
        this._expandInternals();

        // Otherwise the map has height zero
        const w = $('#print_map_canvas').height();
        $(`#internalsMap-${this.worldType}`).height(w);

        // For some reason need to move the label inside the container
        const label = $(`#internals-large-container-${this.worldType}`).find('.viewContainerLabel');
        label.detach();
        $(`#internalsMap-${this.worldType}`).prepend(label);
        $(`#internals-large-container-${this.worldType}`).find('.hidden').removeClass('hidden');
        this.setView(view, feature).then(() => {
            if (mode == 'fullscreen') this.expandFullInternals();
            // Remove the attribution from the map
            this.map._setPrefix('');
        });
    }

    /**
     * Creates params for the map link denoting the internals map view and display size
     * @return {string} <Lat>,<Lng>,<Zoom>,<halfscreen/fullscreen>
     */
    getStateForAppLink() {
        // Add params for internals if it is currently being viewd
        const cName = this._largeViewContainerName();
        if (this.app.layout.mapViewManager.isVisible(cName)) {
            const internalParams = this.map.getMapViewParameters();
            return `${internalParams.center.lat},${internalParams.center.lng},${internalParams.zoom},${this.mode},${this.map.worldId}`;
        } else return '';
    }
}

/**
 * Definition of a world view. View of internals that the user is interested in. Does not
 * store zoom level and centre as these depend on map canvas size and are calculated when
 * required. Bounds is set and used in most uses of this structure; zoomLevel and centre are
 * set and used when setting internals from URL params.
 * @typedef worldView
 * @property {string}              worldName   Name of world
 * @property {LatLngBounds}      bounds      Bounds of view
 * @property {number}            zoomLevel   Zoom level of view
 * @property {LatLng}            centre      Centre of view
 */

/**
 * Object that defines the context menu item
 * @typedef contextMenuItem
 * @property {string}    text     Text to be used as item label (localized using the language file)
 * @property {string}    icon     String representing the relative path of the icon image
 * @property {string}    action   Method name for the on click event handler for the context menu item
 */

export default InternalsControl;
