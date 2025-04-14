// Copyright: IQGeo Limited 2010-2023
import { difference, intersection } from 'underscore';
import $ from 'jquery';
import { Plugin, latLng } from 'myWorld-base';
import { TabControl } from 'myWorld/controls';
import { InternalsControl } from './internalsControl';

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

export class InternalsPlugin extends Plugin {
    static {
        this.mergeOptions({
            collapsed: false,
            zoomIncreaseOnExpand: 2,
            onlyShowMulipleTabs: true //Only show the tab buttons when there are multiple worldTypes
        });
    }

    /**
     * @class Plugin that handles display of internal views for currently selected feature. <br/>
     * Instantiates a number of {@link InternalsControl}. Initially views are displayed in a tab control on the details panel. <br/>
     * Views can be expand over the map in half or full screen mode and stack to the left of the map. Handles map link and print URLs
     * @param  {Application}     owner   The application
     * @param  {Object}              options  Options for the plugin configuration
     * @extends Plugin
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        this.owner = owner;

        // Complete list of InternalControl instances
        this.controls = {};

        this.currentFeatureSetItems = null;
        // List of InternalControls instances that are outside of the tab control
        // Lowest index are positioned left-most in the expanded view
        this.expanded = [];
        this.collapsed = this.options.collapsed;

        this.zoomIncreaseOnExpand = this.options.zoomIncreaseOnExpand;

        this.app.on('currentFeature-changed', ({ feature }) => {
            if (feature?.isNew && feature.getOwnerWorldTypes().length) {
                //current feature is new and is a world owner - clear internals otherwise an unrelated world could remain being shown
                this.cleanup();
            }
        });
    }

    /**
     * Remove tab from the internals tab control and switch to previous tab
     * or the one specified.
     * @param  {string} worldType
     * @param  {string} newType
     */
    removeTab(worldType, newType) {
        if (worldType == newType || !this.tabControl) return;

        const otherTypes = Object.keys(this.tabControl.tabs).filter(x => x != worldType);

        if (Object.entries(this.tabControl.tabs).length == 1) {
            this.tabControl._previousTabId = worldType;
        } else {
            if (this.tabControl.options.initialTab == worldType)
                this.tabControl.options.initialTab = otherTypes[0];
            if (this.tabControl._previousTab == worldType)
                this.tabControl._previousTab = this.tabControl.options.initialTab;
        }

        const tab = this.tabControl.tabs[worldType];

        this.tabControl._removeTab(tab);
        this.tabControl._previousTabId = undefined; // This gets set to the tab we've just removed.
        if (otherTypes.length > 0) this.tabControl.switchToTab(newType || otherTypes[0]);
    }

    /**
     * Sets the internals views according to the params in the URL
     * @param  {string} param   URL parameter string
     * @param  {Feature} feature Feature specified in parameter string
     */
    handleUrlParameterForInternals(param, feature) {
        if (param !== '') {
            param = param.split(',');
            this.internalsInitViews = {};

            const numViews = Math.floor(param.length / 5);

            for (let i = 0; i < numViews; i++) {
                const offset = i * 5;
                const worldType = param[4 + offset].split('/')[0];
                const view = {
                    centre: latLng(param[offset], param[1 + offset]),
                    worldName: param[4 + offset],
                    zoomLevel: parseInt(param[2 + offset], 10),
                    selectable: this.app.getUrlParam('layout') === 'print' ? false : true,
                    worldType: worldType,
                    zoomTo: false,
                    mode: param[3 + offset]
                };

                // If printing need to construct the internals control and put it into the correct state.
                // otherwise remember the view information and make use of it when the feature is
                // selected later on during initialisation.
                if (this.app.getUrlParam('layout') === 'print') {
                    const control = new InternalsControl(this, {
                        plugin: this,
                        worldType: worldType,
                        layout: 'print',
                        mode: param[3 + offset],
                        noButtons: true
                    });

                    control.setUpForPrintLayout(view, param[3 + offset], feature);

                    this.controls[worldType] = control;
                } else {
                    this.internalsInitViews[worldType] = { view: view };
                }
            }
        }
    }

    /**
     * Return a string defining internals views. Information for expanded views are returned
     * in right to left order.
     * @return {string}
     */
    getStateForAppLink() {
        const visibleItems = this.owner.layout.mapViewManager?.visibleItems() || [];
        let paramList = visibleItems.map(id => {
            if (!id.includes('internals-large-container-')) return '';
            id = id.substring(26);
            const control = this.controls[id];
            return control.getStateForAppLink();
        });

        paramList = paramList.filter(param => param !== '');
        return paramList.join(',');
    }

    /**
     * @param  {string} worldType World type. Uses mapping defined in 'core.worldTypeNames';
     * if this is not present, converts underscore to spaces and capitalises initial letter.
     * @return {string}           Human readable form of world type
     * @private
     */
    _titleFor(worldType) {
        const worldTypeNames = this.app.system.settings['core.worldTypeNames'];
        if (worldTypeNames?.[worldType]) return worldTypeNames[worldType];
        return worldType.replace(
            /(^|_)(\w)/g,
            (m, space, letter) => (space && ' ') + letter.toUpperCase()
        );
    }

    /**
     * Build the GUI for the internals display.
     * @param  {jQueryElement} parentDiv
     * @param  {Feature} feature
     * @param  {} priorState
     * @private
     */
    _buildLayout(parentDiv, feature) {
        const types = feature.getInternalWorldTypes();
        types.map(world =>
            this.owner.system.recordDataAccess(this.owner.name, `internal.layer.${world}`)
        );

        if (!this.tabControl) return this._buildLayoutInitial(parentDiv, feature);

        // We are already displaying something so do our best to use what we have

        let currentTabId =
            Object.entries(this.tabControl.tabs).length > 0
                ? this.tabControl.currentTabId
                : undefined;

        const worldTypes = Object.keys(this.controls);

        const removeTypes = difference(worldTypes, types);
        const addTypes = difference(types, worldTypes);
        const keepTypes = intersection(types, worldTypes);

        this._removeTypes(removeTypes);
        this._addTypes(addTypes, feature);

        if (!Object.entries(this.tabControl.tabs).length) this.smallViewHeader.hide();
        else this.smallViewHeader.show();

        // If current tab is no longer going to be on the tab control then
        // make the first tab on the tab control the current one and visible.
        if (!keepTypes.includes(currentTabId)) {
            this.tabControl.switchToFirstTab();
            currentTabId = this.tabControl.currentTabId;
        }

        // Update the view of tabs we are keeping. If we are looking at the same world then
        // don't change the view; might need to highlight something.
        Promise.all(
            keepTypes.map(aType => {
                const ctl = this.controls[aType];
                return ctl.setViewForFeature(feature, this._zoomTo);
            })
        ).then(() => {
            // Hiding a map view that is doing an animated zoom might lock it up. This is resolved
            // when it is made visible again. See visibilityChanged().
            if (this.controls[currentTabId]?.mode == 'small') {
                this.tabControl.switchToTab(currentTabId);
            }
        });
    }

    /**
     * Remove old controls and tabs
     * @param  {Array<string>} removeTypes Types to be removed from the existing types
     * @private
     */
    _removeTypes(removeTypes) {
        removeTypes.forEach(aType => {
            const control = this.controls[aType];
            if (control.mode == 'small') {
                this.removeTab(aType);
            }
            control.cleanup();
            delete this.controls[aType];
        });
    }

    /**
     * Add new controls and tabs
     * @param {Array<string>} addTypes Types tbe added to the existing types
     * @param {Feature} feature
     * @private
     */
    _addTypes(addTypes, feature) {
        addTypes.forEach(aType => {
            const options = {
                plugin: this,
                feature: feature,
                worldType: aType
            };
            const tabDef = {
                control: [InternalsControl, options],
                id: aType,
                title: this._titleFor(aType)
            };
            this.tabControl.addTab(tabDef);
            this.controls[aType] = this.tabControl.tabs[aType].control;

            // If adding a tab to existing empty tab control then need to
            // do this to get map to show. ENH Improve
            if (Object.entries(this.tabControl.tabs).length == 1) {
                this.tabControl.currentTabId = undefined;
                this.tabControl.switchToTab(aType);
            }
        });
    }

    visibilityChanged(isVisible) {
        Object.values(this.controls).forEach(control => {
            //only when mode is 'small', the plugin being informed (by detailsControl) of visibility affects those of the controls. ENH: simplify this somehow
            if (control.mode == 'small') control.visibilityChanged(isVisible);
        });
    }

    /**
     * Build the internals display for provided feature from scratch
     * @param  {jQueryElement} parentDiv
     * @param  {Feature} feature
     * @private
     */
    _buildLayoutInitial(parentDiv, feature) {
        const types = feature.getInternalWorldTypes();
        const initialTab = types[0];

        this.controls = {};

        parentDiv.find('#internals-div').remove();
        parentDiv.append("<div id='internals-div'></div>");

        const tabs = types.map(aType => {
            let initialView = undefined;
            if (this.internalsInitViews && aType in this.internalsInitViews)
                initialView = this.internalsInitViews[aType].view;
            return {
                control: [
                    InternalsControl,
                    { plugin: this, feature, worldType: aType, initialView }
                ],
                id: aType,
                title: this._titleFor(aType)
            };
        });

        const options = {
            divId: 'internals-div',
            initialTab,
            tabs
        };

        this.tabControl = new TabControl(this, options);

        this.smallViewHeader = $("<div class='feature-plugins-header noselect'></div>")
            .text(this.msg('internals'))
            .click(this.toggleCollapsedState.bind(this))
            .prependTo('#internals-div');

        Object.values(this.tabControl.tabs).forEach(tab => {
            this.controls[tab.control.worldType] = tab.control;
        });
    }

    /**
     * Toggles the collapsed state
     */
    toggleCollapsedState() {
        this.collapsed = !this.collapsed;
        this._toggleDetails();
    }

    /**
     * Toggles the details in the details tab while showing the title bar.
     * @private
     */
    _toggleDetails() {
        this.smallViewHeader
            .toggleClass('collapsed', this.collapsed) //Updates the collapsed state of the header
            .siblings(':not(".hidden")')
            .toggle(!this.collapsed); //Hides the internals view
    }

    /**
     * Cleanup plugin. For example causing DOM elements to be removed.
     * @param  {jQuerySelector} parentDiv
     */
    cleanup(parentDiv) {
        parentDiv = parentDiv ?? $('.internals-div').parent();
        parentDiv.find('#internals-div').remove();
        Object.values(this.controls).forEach(control => {
            control.cleanup();
        });
        this.controls = {};
        this.tabControl = undefined;
    }

    /**
     * Implements detailsControl interface to add an internal view to the details of a feature
     * @param  {Feature}    feature   Feature for which to display the panorama
     * @param  {jqueryElement}  parentDiv Div on which to append the new internal view
     */
    updateFeatureDetailsDivFor(feature, parentDiv) {
        // ENH If selecting non-internals owner but expanded internals is shown then might not want to hide it.
        // This will require some rethink as the internals plugin would then be managing internals
        // for an object that isn't current and only showing the expanded view
        if (!feature.inInternalsWorld()) {
            this.cleanup(parentDiv);
            return;
        }

        this._buildLayout(parentDiv, feature);
        this._manageTabsFor(feature);
        // Now expand the appropriate initial views
        if (this.internalsInitViews) {
            Object.values(this.internalsInitViews).forEach(initView => {
                initView = initView.view;
                const control = this.controls[initView.worldType],
                    mode = initView.mode;
                control.setView(initView, feature, false);
                if (mode != 'small') {
                    const keepCurrentZoom = true;
                    control.expandInternals(keepCurrentZoom).then(() => {
                        if (mode === 'fullscreen') control.expandFullInternals();
                    });
                }
            });
            this.internalsInitViews = undefined;
        }
        if (this.collapsed) this._toggleDetails();
    }

    /**
     * If the plugin is configured to only show the tabs when there are more than one worldTypes
     * in the feature, hide the tab button when a feature has only one worldType
     * @param  {object} feature The internals feature to be displayed
     * @private
     */
    _manageTabsFor(feature) {
        if (this.options.onlyShowMulipleTabs) {
            const hasMultipleTabs = feature.getInternalWorldTypes().length > 1;
            this.tabControl._tabButtons[hasMultipleTabs ? 'removeClass' : 'addClass']('hidden');
        }
    }

    currentControl() {
        const tab = this.tabControl.tabs[this.tabControl.currentTabId];
        if (tab) return tab.control;
    }

    /**
     * Return maps used by the control
     */
    getMaps() {
        if (!this.controls || this.collapsed) return [];
        return Object.values(this.controls).map(control => control.map);
    }

    /**
     * Return the currently visible internals maps
     */
    getVisibleMaps() {
        if (!this.controls || this.collapsed) return [];
        return Object.values(this.controls)
            .filter(control => control.isVisible)
            .map(control => control.map);
    }

    getState() {
        return {
            collapsed: this.collapsed
        };
    }
}

export { InternalsControl };

export default InternalsPlugin;
