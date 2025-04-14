// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { pick } from 'underscore';
import { translate } from 'myWorld/base';
import { Control } from 'myWorld/base/control';
import { ObjectNotFoundError } from 'myWorld/base/errors';
import { Dialog } from 'myWorld/uiComponents/';
import detailsTabHtml from 'text!html/detailsTab.html';
import { FeatureViewer } from './feature/featureViewer';
import { FeatureEditor } from './feature/featureEditor';
import { BulkFeatureEditor } from './feature/bulkFeatureEditor';
import { ResultsListControl } from './resultsListControl';
import { TraceResultControl } from './traceResultControl';
import { PluginButton } from 'myWorld/base/pluginButton';
import { EditButton } from './editButton';
import { BulkEditButton } from './bulkEditButton';
import listImg from 'images/actions/list.svg';
import zoomImg from 'images/actions/zoom.svg';

export class DetailsControl extends Control {
    static {
        this.mergeOptions({
            usePopupEditor: undefined,
            navButtons: ['application.prevResult', 'application.nextResult'],
            featureButtons: ['results-list', 'edit', 'zoom'],
            resultsButtons: ['bulk-edit', 'zoom-all'],
            viewersState: {
                //state that will be shared across FeatureViewer instances
                attributeDisplayMode: 'medium',
                collapsed: false
            },
            DefaultFeatureViewer: FeatureViewer,
            resultsTypeMapping: {
                features: ResultsListControl,
                trace: TraceResultControl
            },
            BulkFeatureEditor: BulkFeatureEditor
        });

        this.prototype.messageGroup = 'details';
    }

    /**
     * @class   Control to display feature details and display results.
     * Manages several panes of which one is displayed: "details-loading", "feature-details", "feature-editor", "no-detail-contents" and panels corresponding to the entries in options.resultsTypeMapping
     *
     * Displaying of feature details can be customized by registering sub-classes of FeatureViewer with feature models.
     * Feature editing can be customized  by registering sub-classes of FeatureEditor with feature models. See {@link Feature}
     *
     * The panel below that exists below the one that displays the feature details is customizable by registering plugins with the pluginIds parameter. Example: </br>
     * <b>   new DetailsControl(tabControl, { pluginIds: ["notes"] })</b> <br/>
     * These plugins have to be previously registered with the application and need to then <br/>
     * implement the following method: <br/>
     * <b>updateFeatureDetailsDivFor: (feature, parentDiv) => {...}  </b><br/>
     *      This method is called after displaying the field values, so the plugin can add a new section or change the existing DOM elements
     *
     *
     * @param  {Application|Control}    owner       Owner of self
     * @param  {detailsControlOptions}          options
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);

        this.currentSelectionOrigin = null;

        //a list of the application plugins used by DetailsControl, for quicker access
        this.plugins = pick(this.app.plugins, options.pluginIds);
        this.pluginExtras = {};

        this.initUI();

        this.initAppEventHandlers();

        /**Tracks the locked state editor should be in.
         * @type {boolean} */
        this.isEditorLocked = false;
    }

    /**
     * Initial render of UI
     */
    initUI() {
        this.$el.html(detailsTabHtml);
        translate('details', this.$el);

        this.createToolbars();

        this.topLevelContainerIds = [
            'no-detail-contents',
            'details-loading',
            'feature-details',
            'feature-editor'
        ];
        this.resultsControl = {};
        for (const [type, Control] of Object.entries(this.options.resultsTypeMapping)) {
            //create element
            const id = `results-${type}`;
            const el = $(`<div id="${id}" class="results-list"></div>`);
            this.$el.append(el);
            //instantiate control
            this.resultsControl[type] = new Control(this, { el });
            this.topLevelContainerIds.push(id);
        }

        //initial state is no details
        this.showNoDetailsMessage();

        this._setPanelContentHeight();
    }

    createToolbars() {
        const navButtonWidth = 40;
        const leftToolbarWidth = this.options.navButtons.length * navButtonWidth;
        const rightToolbarWidth = this.owner.$el.width() - leftToolbarWidth - 20;

        //create buttons to navigate backwards and forwards in the browsed features stack
        this.addButtons.call(
            this,
            this.$('#results-nav'),
            this.options.navButtons,
            {},
            leftToolbarWidth,
            navButtonWidth
        );
        //create buttons for when displaying a feature's details
        this.addButtons.call(
            this,
            this.$('#details-actions'),
            this.options.featureButtons,
            {},
            rightToolbarWidth,
            navButtonWidth
        );
        //create buttons for when displaying a list of results
        this.addButtons.call(
            this,
            this.$('#multiple-details-actions'),
            this.options.resultsButtons,
            {},
            rightToolbarWidth,
            navButtonWidth
        );
    }

    /**
     * Setup handlers for application events
     */
    initAppEventHandlers() {
        const app = this.app;

        app.on('selection-started', data => {
            //a selection has started, so active the 'loading...' panel
            this.currentSelectionOrigin = data.origin; //the origin is necessary to adjust the message when nothing is found
            this.showTopLevelContainer('details-loading');
        });

        app.on('selection-cleared', data => {
            this.currentSelectionOrigin = 'clear_results';
        });

        app.on('query-started', data => {
            this.currentSelectionOrigin = 'search';
            this.showTopLevelContainer('details-loading');
        });

        app.on('currentFeatureSet-changed currentFeature-changed', e => {
            //new feature(s),
            this._featureEvent = e;
            const currentFeatureType = e.feature?.getType();
            let mode = this.app.displayModeFor(currentFeatureType);

            //check if event specified a mode
            if (mode == 'view' && e.edit && this.app.isFeatureEditable(e.feature)) mode = 'edit';
            else if (mode == 'edit' && e.edit === false) mode = 'view';

            this.setMode(mode); //leaves 'edit' mode if necessary
        });
    }

    /**
     * Sets the current mode of the control, and updates the UI
     * @param {string} mode 'view' or 'edit'
     */
    setMode(mode) {
        const switchedMode = this.mode && this.mode !== mode;
        this.mode = mode;
        const msg = this.msg('feature_editor');
        if (mode == 'edit') {
            //If the app is in edit mode,
            //we'll always have to end the current transaction before starting a new one
            if (this.app.editMode) this.app.database.endUserTransaction();

            return this.app.database
                .beginUserTransaction(msg)
                .then(() => {
                    this.render();
                    if (switchedMode) this.app.fire('detailsControlMode-changed', { mode });
                })
                .catch(error => {
                    new Dialog({
                        contents: error.message
                    });
                    console.log(error);
                });
        } else {
            if (switchedMode) this.app.database.endUserTransaction();
            this.render();
            if (switchedMode) this.app.fire('detailsControlMode-changed', { mode });
        }
    }

    /**
     * Updates the UI for the current state
     */
    render() {
        const currentFeatureSet = this.app.currentFeatureSet;
        const currentFeature = this.app.currentFeature;

        if (this.editor) {
            // we were editing a feature but are now displaying something different - disable edit mode
            this.editor.close();
            this.editor = null;
        }

        if (currentFeature === null && currentFeatureSet.isEmpty()) {
            this.showNoDetailsMessage();
        } else if (currentFeature !== null) {
            if (currentFeature.isNew || (this.mode == 'edit' && currentFeature.isEditable())) {
                this.setCurrentFeatureEditable();
            } else {
                //ENH: ensure necessary feature properties are available before continuing (instead of assuming it has been done by the application)
                this.displayFeatureDetails(currentFeature);
            }
        } else {
            if (this.mode == 'edit') {
                this.setCurrentFeatureSetEditable();
            } else {
                // Populate the multiple results container from the current feature set.
                this.populateMultipleResults();
            }
        }
        this.trigger('change'); //trigger event so buttons update themselves
    }

    /**
     * Show the no details message
     */
    showNoDetailsMessage() {
        // Reset the visibility of the top level detail containers.
        this.showTopLevelContainer('no-detail-contents', false);

        //hide the details actions and multiple-details actions from the navigation bar
        this.$('#details-actions, .multiple-details-actions').hide();

        let msgId = `no_details_${this.currentSelectionOrigin || 'default'}`;

        if (
            this.currentSelectionOrigin === 'map' &&
            this.app.map.getZoom() < this.app.map.getMaxZoom()
        ) {
            msgId = 'no_details_map_zoom_closer';
        }
        const msg = this.currentSelectionOrigin === 'clear_results' ? '' : this.msg(msgId);
        this.$('#no-detail-contents-message').html(msg);
    }

    /**
     * Display the details of a feature
     * @param  {Feature} feature
     */
    displayFeatureDetails(feature) {
        this.showTopLevelContainer('feature-details');
        const viewer = this._getViewerFor(feature);
        this.$('#feature-viewer').html(viewer.el);
        viewer.displayFeatureDetails(feature);

        this._renderPluginExtras(feature);
    }

    /*
     * Returns a feature viewer appropriate for the given feature
     * Caches instances of the different viewer classes
     * @param  {Feature} feature
     * @return {FeatureViewer}
     */
    _getViewerFor(feature) {
        if (feature.viewerClass) {
            const type = feature.getType();
            if (!this._viewers) this._viewers = {};

            if (!this._viewers[type]) {
                this._viewers[type] = new feature.viewerClass(this, {
                    state: this.options.viewersState
                });
            }
            return this._viewers[type];
        } else {
            if (!this._defaultViewer) {
                const viewerOptions = { state: this.options.viewersState };
                this._defaultViewer = new this.options.DefaultFeatureViewer(this, viewerOptions);
            }
            return this._defaultViewer;
        }
    }

    /**
     * Starts edit mode for the current feature of the application
     */
    setCurrentFeatureEditable() {
        const feature = this.app.currentFeature;
        let refreshPromise;
        if (feature.isNew) {
            //detached feature, no need to refresh..
            refreshPromise = Promise.resolve(feature);
        } else {
            //refresh feature details. also ensures we edit the feature and not a "qualified" feature with a
            // partial geometry as it happens when we start from a trace node
            refreshPromise = feature.datasource
                .getFeatureByUrn(feature.getUrn(), true, feature.getDelta())
                .catch(error => {
                    if (error instanceof ObjectNotFoundError) {
                        this.app.setCurrentFeature(null);
                        this.app.message(this.app.msg('missing_object_error'));
                    } else throw error;
                });
        }

        return refreshPromise.then(feature => {
            if (!feature) return;
            this.createEditorFor(feature);
        });
    }

    /**
     * Starts edit mode for the current feature set of the application
     */
    async setCurrentFeatureSetEditable() {
        const editableFeatures = this.app.currentFeatureSet.items.filter(
            feature => feature.isEditable() && this.app.isFeatureEditable(feature.type, feature)
        );
        //refresh feature details. also ensures we edit the feature and not a "qualified" feature with a
        // partial geometry as it happens when we start from a trace node
        try {
            const refreshPromises = editableFeatures.map(feature =>
                feature.datasource.getFeatureByUrn(feature.getUrn(), true, feature.getDelta())
            );
            const features = await Promise.all(refreshPromises);
            this.createEditorForSet(features);
        } catch (error) {
            if (error instanceof ObjectNotFoundError) {
                this.app.setCurrentFeature(null);
                this.app.message(this.app.msg('missing_object_error'));
            } else throw error;
        }
    }

    createEditorFor(feature) {
        const usePopup =
            this.app.useTouchStyles || feature.usePopupEditor || this.options.usePopupEditor;
        const editorOptions = {
            feature,
            usePopup,
            editorClass: feature.editorClass || FeatureEditor
        };
        this._createEditor(editorOptions);
    }

    createEditorForSet(featureSet) {
        const editorOptions = {
            featureSet,
            usePopup: true,
            editorClass: this.options.BulkFeatureEditor
        };
        this._createEditor(editorOptions);
    }

    _createEditor(options) {
        const { feature, featureSet, usePopup } = options;

        const editorOptions = {
            feature,
            featureSet,
            useTabs: usePopup,
            useExpandedFieldEditors: usePopup
        };

        if (!usePopup) {
            this.app.layout.layout.open('west');
            this.showTopLevelContainer('feature-editor');
            this.$('#detail-contents').scrollTop(0);
            editorOptions.el = $('#feature-editor');
        }

        const Editor = options.editorClass;
        this.editor = new Editor(this, editorOptions);
        this.editor.once('cancelled', this._editorClosed, this);
        this.editor.once('created_not_accessible', msg => {
            this.app.message(msg);
            this.app.setCurrentFeature();
        });

        this.editor.once('saved', featureProps => {
            this.handleSavedFeature(featureProps);
        });

        this.trigger('change');
    }

    async handleSavedFeature(featureProps) {
        const feature = featureProps.feature;
        await this.app.setCurrentFeature(feature);
        this.isEditorLocked = featureProps.isLocked;
        if (featureProps.isLocked) {
            //Create a new feature with the properties of the freshly created feature.
            const detachedFeature = await this.app.database.createDetachedFeature(
                feature.getType(),
                true
            );

            detachedFeature.properties = { ...feature.properties };
            //Remove the keyField property because we are creating a new feature
            delete detachedFeature.properties[feature.keyFieldName];

            this.app.setCurrentFeature(detachedFeature);
        }
    }

    /**
     * Populate the multiple results container.
     */
    populateMultipleResults() {
        const type = this.app.currentFeatureSet?.type;
        const control = this.resultsControl[type];
        if (!control) return;

        this.showTopLevelContainer('results-' + type);
        control.render();
    }

    /**
     * Shows paneIdToShow and hides the other main panes
     * @param  {boolean} [ensureVisible=true]  Whether to ensure self is visible
     * @param  {string} paneIdToShow
     */
    showTopLevelContainer(paneToShow, ensureVisible = true) {
        this.$('.list-export').removeClass('inactive');
        if (!this.$el.is(':visible') && ensureVisible) {
            this._activate();
        }

        //update buttons state
        if (['feature-details', 'feature-editor'].includes(paneToShow)) {
            this.$('#details-actions').show();
            this.$('.multiple-details-actions').hide();
        } else if (paneToShow.startsWith('results-')) {
            //hide the 'click to go back to the list of other features' button
            this.$('#details-actions').hide();
            this.$('.multiple-details-actions').show();
        }

        this.topLevelContainerIds.forEach(paneId => {
            if (paneId != paneToShow) {
                this.$(`#${paneId}`).hide();
            }
        });

        //to avoid flicker, only show the container we want after the others have been hidden
        this.$(`#${paneToShow}`).show();
        this._setPanelContentHeight();

        //inform plugins they are not visible anymore. Plugins are on visible when showing feature details
        const pluginsVisible = 'feature-details' == paneToShow;
        this.visibilityChanged(pluginsVisible);
    }

    /**
     * Makes self visible by requesting it to the owning framework
     * @private
     */
    _activate() {
        this.owner.fire('activateControl', { control: this });
    }

    /**
     * Looks through all the plugins and
     * calls the visibilityChanged() method on them if available.
     * @param  {Boolean} isVisible
     */
    visibilityChanged(isVisible) {
        for (const [name, plugin] of Object.entries(this.plugins)) {
            if (plugin.visibilityChanged) {
                try {
                    plugin.visibilityChanged(isVisible);
                } catch (error) {
                    console.warn(`Error calling 'visibilityChanged' on plugin '${name}':`, error);
                }
            }
        }
        this._setPanelContentHeight();
    }

    /**
     * Called by the owner when the available area for self changes
     * Adjusts the height of the results table and details-content div so that scrolling works correctly
     * Adjusts the size of the plugins panels
     */
    invalidateSize() {
        this._setPanelContentHeight();
        for (const plugin of Object.values(this.plugins)) {
            plugin.invalidateSize?.();
        }
        this.createToolbars();
        for (const control of Object.values(this.resultsControl)) {
            control.invalidateSize();
        }
    }

    getState() {
        return {
            viewersState: this.options.viewersState
        };
    }

    remove() {
        if (this.editor) this.editor.remove();
        super.remove();
    }

    _renderPluginExtras(feature) {
        //check if the registered plugins want to add something
        this.$('#feature-plugins-details').show();
        for (const [name, plugin] of Object.entries(this.plugins)) {
            if (plugin.updateFeatureDetailsDivFor) {
                const pluginContainer = this._getPluginExtraContainer(name);
                plugin.updateFeatureDetailsDivFor(feature, pluginContainer, this._featureEvent);
            }
        }
    }

    /*
     * Returns the container for the plugin extra. If it does not exist creates one.
     * @param  {string} pluginName
     * @return {jQueryElement}
     */
    _getPluginExtraContainer(pluginName) {
        if (!this.pluginExtras[pluginName]) {
            const pluginsDiv = this.$('#feature-plugins-details');
            const insertIndex = this.options.pluginIds.indexOf(pluginName);
            const pluginContainer = $('<div>');

            if (insertIndex > 0) {
                const prevContainer = pluginsDiv.children()[insertIndex - 1];
                this.$(prevContainer).after(pluginContainer);
            } else {
                pluginsDiv.append(pluginContainer);
            }
            this.pluginExtras[pluginName] = pluginContainer;
        }
        return this.pluginExtras[pluginName];
    }

    /**
     * Handler for when the feature editor is closed.
     * @private
     */
    _editorClosed() {
        if (!this.app.currentFeature || this.app.currentFeature.isNew) {
            //was creating a feature, navigate back
            this.app.featureNavigation.updateResults('previous');
            this.isEditorLocked = false;
        } else {
            //was editing an existing feature, display it in readonly mode
            this.setMode('view');
        }
        this.editor = null;
    }

    /**
     * Sets the heights of the various components in the feature details panel
     * This is required esp. to support all screen sizes and the use of virtual keyboard on touch devices
     * @private
     */
    _setPanelContentHeight() {
        const container = this.$el;

        if (!container.is(':visible')) return; //Don't bother resizing if the tab panel is hidden

        const navBarHeight = $('.navigation-bar').outerHeight(),
            panelContentHeight = container.height() - navBarHeight;

        this.$('#feature-details').height(panelContentHeight);
        this.$('#feature-editor').height(panelContentHeight);
    }
}

class ZoomToAllButton extends PluginButton {
    static {
        this.prototype.className = 'zoom-all-details';
        this.prototype.imgSrc = zoomImg;
        this.prototype.titleMsg = 'zoom_all';
    }

    action() {
        this.app.recordFunctionalityAccess('core.details_tab.zoom_all');
        this.app.map.fitBoundsToFeatures(this.app.currentFeatureSet.items);
    }

    render() {
        //If any of the features in the set are in geo world, activate the button
        const active = this.app.currentFeatureSet.items.some(
            feature => !!feature.getGeometryInWorld('geo')
        );
        this.setActive(active);
    }
}

class ResultsListButton extends PluginButton {
    static {
        this.prototype.id = 'results-list-button';
        this.prototype.imgSrc = listImg;
        this.prototype.inactiveImgSrc = listImg;
        this.prototype.titleMsg = 'current_results';
    }

    action() {
        this.app.recordFunctionalityAccess('core.details_tab.list');
        this.app.setCurrentFeature(null, { keepFeatureSet: true });
    }

    render() {
        const listAvailable = this.app.currentFeatureSet.items.length > 1;
        this.setActive(listAvailable);
    }
}

class ZoomButton extends PluginButton {
    static {
        this.prototype.id = 'details-zoom';
        this.prototype.imgSrc = zoomImg;
        this.prototype.titleMsg = 'zoom_to';
    }

    action() {
        this.app.recordFunctionalityAccess('core.details_tab.zoom_to');
        this.app.map.zoomTo(this.app.currentFeature);
    }

    render() {
        const feature = this.app.currentFeature,
            active = feature?.getGeometryInWorld('geo');
        this.setActive(active);
    }
}

DetailsControl.prototype.buttons = {
    'results-list': ResultsListButton,
    edit: EditButton,
    'bulk-edit': BulkEditButton,
    zoom: ZoomButton,
    'zoom-all': ZoomToAllButton
};

/**
 * @typedef detailsControlOptions
 * @property {boolean}          usePopupEditor  Whether feature editors should be used in popup mode or not. <br/>
 *                                              By default, popup mode will be used on touch devices and also for feature models that specify it by setting the property 'usePopupEditor' to True
 * @property {Array<string>}    pluginIds       List of plugins that may provide addtional feature details by implementing method updateFeatureDetailsDivFor(feature, parentDiv)
 * @property {Array<buttonId>}  featureButtons   List of buttons to use when displaying details of a feature
 * @property {Array<buttonId>}  resultsButtons   List of buttons to use when displaying a list of results
 * @property {object}           viewersState    State that will be shared across FeatureViewer instances. Will be passed to the viewer constructor as the 'state' option
 * @property {function} [DefaultFeatureViewer] Default class to use as a FeatureViewer. Defaults to FeatureViewer
 * @property {function} [BulkFeatureEditor] Class to use for BulkFeatureEditor. Defaults to BulkFeatureEditor
 * @property {object} [resultsTypeMapping] Mapping of results type to class that renders a result. Defaults to {features: ResultsListControl, trace: TraceResultControl}
 */

export default DetailsControl;
