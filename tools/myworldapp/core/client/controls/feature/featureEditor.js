// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import 'jquery-ui';
import { isEqual, template } from 'underscore';
import myw, { Util, Browser, msg } from 'myWorld-base';
import { ObjectNotFoundError, BadRequest, DuplicateKeyError } from 'myWorld/base/errors';
import { Dialog } from 'myWorld/uiComponents/dialog';
import { Control, TabControl } from 'myWorld/controls';
import featureEditorHtml from 'text!html/featureEditor.html';
import popupFeatureEditorHtml from 'text!html/featureEditorPopup.html';
import { DisplayMessage } from 'myWorld/controls/displayMessage';
import { GeomDrawMode } from 'myWorld/map/geomDrawMode';
import { ReadOnlyMode } from 'myWorld/map/readOnlyMode';
import GeoJSONVectorLayer from 'myWorld/layers/geoJSONVectorLayer';
import { FieldEditorsPanel } from './fieldEditorsPanel';
import { modifierKeyPressed } from 'myWorld/base/keyboardEvent';
import { getEditStyleFor } from 'myWorld/map/geomUtils';
import { Style, LineStyle, FillStyle } from 'myWorld/styles';
import geometry from 'myWorld/geometry/geometry';

const { android, isTouchDevice } = Browser;

/**
 * Options for FeatureEditor instances
 * @typedef featureEditorOptions
 * @property {DDFeature}    feature                     The feature to be edited
 * @property {MapControl}   map                         Map on which to edit the feature's geometry
 * @property {HTMLElement}       [el]                        (from Backbone) Element where the editor should render the UI. If not provided, a popup editor will be used
 * @property {boolean}  [useTabs=false]                     Whether self is embeded in a list of multiple of features or not
 * @property {boolean}  [useExpandedFieldEditors=false]     Whether a null value should still be rendered or not
 * @property {boolean}  [useSoftKeyboardInput=true]         Whether to use the softKeyboardInput on touch devices
 * @property {string}   [actionButtonsPanelHeight='58px']   The height of the action buttons panel. Should be updated in case custom buttons have been added
 * @property {string}   [phoneActionButtonsAndHeaderHeight='55px']   The height of the action buttons panel in the phone layout. Should be updated in case custom buttons have been added
 */

export class FeatureEditor extends Control {
    static {
        this.mergeOptions({
            useTabs: false,
            useExpandedFieldEditors: false,
            useSoftKeyboardInput: true,
            //If true show a pin icon in create object editors
            //Useful for data entry when you have to create multiple objects of the same type
            makeCreateFormPinnable: false,
            fieldEditorsPanelClass: FieldEditorsPanel,
            actionButtonsPanelHeight: '58px',
            phoneActionButtonsAndHeaderHeight: '55px'
        });

        this.prototype.template = template(featureEditorHtml);
        this.prototype.templatePopup = template(popupFeatureEditorHtml);

        this.prototype.events = {
            'click .cancel:not(:disabled)': 'cancel',
            'click .delete:not(:disabled)': 'deleteFeature',
            'click .save:not(:disabled)': 'save',
            'click [data-feature-editor-set-map-object]': 'geomMode',
            'click .lock-editor': 'toggleLockedState'
        };
    }

    /**
     * @class  A UI control for editing or creating a feature <br/>
     *         Does field validation and activation of Geometry edit mode on the corresponding map.<br/>
     *         Triggers a 'cancelled' event when editing has been cancelled.<br/>
     *         Custom editors can be used by registering sub-classes as feature models. See {@link DDFeature}. <br/>
     *         Field editors are rendered using {@link FieldEditorsPanel}
     * @param  {Application|Control}    owner
     * @param  {featureEditorOptions}           options
     * @constructs
     * @extends {Control}
     * @fires cancelled
     */
    constructor(owner, options) {
        super(owner, options);

        const feature = options.feature;

        this.popup = !this.options.el; // no element provided means we should popup a dialog for the editor

        this.datasource = feature.datasource;

        this.feature = feature;
        this.featureDD = feature.featureDD;
        this.referencedFeatureUrn = null;
        this.isLocked = this.owner.isEditorLocked;
        this.userLocation = this.app.userLocation;
        this._geomFieldDDs = this._getGeomFieldDDs();

        ['onKeydown', 'onKeyup', '_handleGeomDrawStart', '_handleSaveError'].forEach(
            method => (this[method] = this[method].bind(this))
        );

        //ensure we have the necessary properties before building the UI
        //ENH: there may be no need to request lobs once image fields have a better editor
        /* Promise fullfilled when the UI is ready
         * @type {Promise} */
        this.ready = feature.ensure(['simple', 'display_values', 'lobs']).then(async () => {
            await this.initUI();
            this.on('change', () => {
                const featureData = this.getChanges(this.feature);
                this.fieldPanels.forEach(panel => panel.update(featureData));
            });

            this.userLocation.on('tracking-changed', evt => {
                $('[data-feature-editor-use-user-location]').toggleClass(
                    'show',
                    evt.target.isTracking
                );
            });

            this.trigger('ready');
        });

        this.app.on('map-interaction-dialog-opened', data => {
            //a dialog used to interact with the map has started, so close popup editor
            if (data.force || this.isCoveringTheMap()) this.hidePopupEditor();
        });

        this.app.on('map-interaction-dialog-closed', data => {
            //a dialog used to interact with the map has closed so show the popup editor
            this.showPopupEditor();
        });
    }

    /**
     * Renders the editor and activates the geometry editing mode
     */
    async initUI() {
        await this.render();

        this.activateGeomDrawMode(this.feature);
        document.addEventListener('keydown', this.onKeydown);
        document.addEventListener('keyup', this.onKeyup);
    }

    /**
     * Activates GeomRotateMode when control key is pressed
     * @param {KeyboardEvent} event Captured keyboard event
     */
    onKeydown(event) {
        if (modifierKeyPressed(event)) {
            this.activateGeomRotateMode();
        }
    }

    /**
     * Ends GeomRotateMode when control key is released
     * @param {KeyboardEvent} event Captured keyboard event
     */
    onKeyup(event) {
        if (!modifierKeyPressed(event)) {
            this.endGeomRotateMode();
        }
    }

    /**
     * Builds a form for feature editing. <br/>
     * Includes the field editors, and  buttons for geometry mode, saving, canceling and deleting
     * @param  {DDFeature}  feature     The feature to be edited
     * @param  {jQueryElement}  container   The container where the editor should be rendered
     * @private
     */
    render() {
        const feature = this.feature,
            templateValues = this.getTemplateValues(feature);

        if (!this.options.el) {
            //weren't given an element to render on.

            //Updates the jquery ui title to use an html instead of just text
            $.widget(
                'ui.dialog',
                $.extend({}, $.ui.dialog.prototype, {
                    _title(title) {
                        title.html(this.options.title || '&#160;');
                    }
                })
            );

            //open a dialog to render on
            this.openPopupDialog();
        }

        const template = this.popup ? this.templatePopup : this.template;
        this.$el.html(template(templateValues));
        if (feature.isNew && this.options.makeCreateFormPinnable) {
            this.$el.children('.panel-header').prepend(this._createPinBtn());
        }
        this.$('.button').button(); //styles buttons with jquery-ui
        // showing a tooltip for set to current location button, provide more info for a icon button
        // only show in desktop layout,
        this._setToUserLocationButtons = this.$('[data-feature-editor-use-user-location]');
        this._setToUserLocationButtons.tooltip({
            position: { my: 'right bottom', at: 'cetner top' }
        });

        this.fieldEditorsEl = this.$('#field-editors');

        this.renderFieldEditors();
        const actionButtonsPanelHeight = this.app.isHandheld
            ? this.options.phoneActionButtonsAndHeaderHeight
            : this.options.actionButtonsPanelHeight;

        const panelHeaderHeight = this.$('.panel-header').outerHeight();
        this.$('.feature-edit-container').css(
            'height',
            `calc(100% - ${actionButtonsPanelHeight} - ${panelHeaderHeight}px)`
        );

        this.translate(this.$el);
        if (this.options.useSoftKeyboardInput) myw.softKeyboardInput.enableOn(this.$el, this.app);
    }

    /**
     * Converts self's element into a dialog and add it to the dom
     */
    openPopupDialog() {
        const isMasterView = this.feature.datasource.options.masterMode;
        const masterIcon = $('<span>', {
            class: 'master-layer-icon',
            title: msg('LayerControl', 'master_layer')
        });

        const titleText = this.options.feature.getTitle(),
            title = isMasterView ? titleText + masterIcon[0].outerHTML : titleText;

        let titleDiv = title;
        if (this.feature.isNew && this.options.makeCreateFormPinnable) {
            // We want to show the lock toggle icon
            const lockToggleIcon = this._createPinBtn();
            titleDiv =
                '<div class="popup-editor-title">' + lockToggleIcon[0].outerHTML + title + '<div>';
        }

        $(':root').append(this.el);
        this.$el.dialog({
            modal: false,
            width: 'auto',
            resizable: false,
            position: { my: 'left top', at: 'left+50 top+50', of: window },
            title: titleDiv,
            closeText: this.msg('close_tooltip'),
            close: (event, ui) => {
                this.cancel();
            }
        });

        this.$el
            .dialog('widget')
            .find('.lock-editor')
            .on('click', ev => this.toggleLockedState(ev));

        if (isTouchDevice && android) {
            //Allows 'x' (in the draggable titlebar) click to work on android touch devices
            this.$el
                .dialog('widget')
                .find('.ui-dialog-titlebar-close')
                .mousedown(() => {
                    this.$el.dialog('close');
                });
        }

        // Resize the editor dialog on window resize
        $(window)
            .resize(() => {
                const panelHeight = $(window).height() - 120;
                this.$el.css({
                    'max-height': panelHeight,
                    'max-width': $(window).width() - 80,
                    'overflow-y': 'auto'
                });
            })
            .resize();

        this.delegateEvents();

        //Hide the left panel and the feature brief (that shows up as a result of closing the pane)
        this.app.layout.layout.panes?.west?.hide(); //to avoid the animation masking the dialog
        this.app.layout.close('west');
        this.app.layout.controls.featureBriefControl?.hide();
    }

    /**
     * Renders field editors.
     * If options.useTabs is true and field groups definitions exist <br/>
     * it will render using several tabs - one per group. Each tab is rendered using {@link FieldEditorsPanel} <br/>
     * Otherwise it renders all fields using a single {@link FieldEditorsPanel}
     */
    renderFieldEditors() {
        const groups = this.feature.getFieldGroups();
        this.tabbed = this.options.useTabs && groups?.length > 1;

        if (this.tabbed) {
            //there are more than 1 field group definitions. Create a tab for each group
            this.renderTabs();
        } else {
            //only one panel with fieldEditors
            this.renderFieldEditorsSinglePane();
        }

        this.fieldPanels.forEach(fieldPanel => {
            //propagate value change events
            this.listenTo(fieldPanel, 'change', this._propagateEvent);
        });
    }

    /**
     * Renders all field editors as a single panel
     * Features with a single group are displayed in a single pane.
     * If that group has separators, we want to display them
     */
    renderFieldEditorsSinglePane() {
        // jshint newcap: false
        const fieldEditorsPanelClass = this.options.fieldEditorsPanelClass;

        const feature = this.feature;

        const fieldNames = feature.getFieldsOrder({ includeSeparators: true });
        let fieldEditorsPanel;

        if (this.feature.isNew) this.addKeyFieldTo(fieldNames);

        fieldEditorsPanel = new fieldEditorsPanelClass(this, {
            el: this.fieldEditorsEl,
            feature: feature,
            fields: fieldNames,
            useExpandedFieldEditors: this.options.useExpandedFieldEditors
        });

        this.fieldPanels = [fieldEditorsPanel];
    }

    /**
     * Renders field editors grouping them in tabs acording to field group definitions
     */
    renderTabs() {
        //get tab definitions
        const tabs = this._getTabDefinitions();

        this.tabControl = new TabControl(this, {
            el: this.$('#field-editors'),
            tabs: tabs,
            initialTab: tabs[0].id
        });

        // Add a top border to the tab buttons
        this.tabControl._tabButtons.addClass('top-bordered');

        //set the list of the field panels for simpler access when obtaining changes and validating (same as non-tabbed editor)
        this.fieldPanels = [];
        //Normally would have to wait for tabControl to be ready but since we are
        //not using the tabControl's html option, our tabs are rendered synchronously,
        //so we don't need to wait for initialized to fulfill
        Object.values(this.tabControl.tabs).forEach(tab => {
            if (tab.control) {
                //store the tab button with the control to make it easier to access when we need to highlight the button
                tab.control.button = tab.button;
                this.fieldPanels.push(tab.control);
                this.listenTo(tab.control, 'change', this._propagateEvent);
            }
        });
    }

    /**
     * Returns the list of tab definitions to render in the UI
     * @return {Array<tabDefinition>}
     * @private
     */
    _getTabDefinitions() {
        const tabs = this.feature.getFieldGroups().map(fieldGroup => {
            const fields = fieldGroup.fields.map(f => f.field_name);
            return {
                id: this.getSafeIdFrom(fieldGroup.display_name),
                title: fieldGroup.display_name,
                control: [
                    this.options.fieldEditorsPanelClass,
                    {
                        feature: this.feature,
                        fields: fields,
                        useExpandedFieldEditors: this.options.useExpandedFieldEditors
                    }
                ]
            };
        });

        if (this.feature.isNew) this.addKeyFieldTo(tabs[0].control[1].fields);
        return tabs;
    }

    /**
     * If the key field does not have a generator and is not included in the fieldNames,
     * adds it to the fieldNames
     * @param {Array<string>} fieldNames   List of field names to show in the editor
     */
    addKeyFieldTo(fieldNames) {
        const featureDD = this.feature.featureDD;
        const keyField = featureDD.key_name;
        const needsKeyField =
            !fieldNames.includes(keyField) && !featureDD.fields[keyField].generator;
        if (needsKeyField) {
            fieldNames.unshift(keyField); //Pushes the keyfield to the top of the array
        }
    }

    /**
     * Obtains the values to use in the html template.
     * Override in sub-classes if using a diferent template
     * @param  {DDFeature} feature
     * @return {object}         keyed on field name
     */
    getTemplateValues(feature) {
        const featureDD = this.featureDD;
        const templateValues = {};
        let geom_not_editable = false;

        //Set the map object type
        let geomTypeStr = featureDD.geometry_type;
        if (!feature.isNew && feature.hasGeometry() && this._hasMutiGeometry(feature)) {
            // Feature has a geometry of a "Multi" type - no support for editing it
            geomTypeStr = this.msg('not_editable', { geomtype: feature.getGeometryType() });
            geom_not_editable = true;
        }
        templateValues.geom_not_editable = geom_not_editable;
        templateValues.geomType = geomTypeStr;
        templateValues.deletable = !feature.isNew && featureDD.delete_from_gui;

        //figure out title
        let title = feature.getTitle();
        if (feature.isNew) title = this.msg('detached_feature_title', { title: title });
        templateValues.myw_title = title;

        templateValues.geometries = this._getEditableGeomFieldDDs();

        templateValues.geomMsgFn = fieldDD => {
            const geom = feature.getGeometry(fieldDD.internal_name);
            return this.msg(geom ? 'update_map_object_geometry' : 'set_map_object_geometry', {
                geomName: fieldDD.external_name
            });
        };
        templateValues.myw_short_description = feature.getShortDescription();
        templateValues.masterView = feature.datasource.options.masterMode;
        templateValues.isLocked = this.isLocked;
        templateValues.isUserLocationTracking = this.userLocation.isTracking;
        templateValues.set_to_current_location_tooltip = this.msg(
            'set_to_current_location_tooltip'
        );
        return templateValues;
    }

    /**
     * Returns true is the feature is a multipoint, multiline or multipoygon
     * @param  {DDFeature} feature
     * @return {Boolean}
     * @private
     */
    _hasMutiGeometry(feature) {
        return (
            this.featureDD.geometry_type.toLowerCase() !== feature.getGeometryType().toLowerCase()
        );
    }

    _propagateEvent(ev) {
        this.trigger('change', ev);
    }

    /*
     * Get dds of geometry fields for visible maps, keeping field order
     * @returns {Array<fieldDD>}
     */
    _getGeomFieldDDs() {
        const featureDD = this.featureDD;
        const geomFieldNames = this._getGeomDrawMaps().flatMap(
            map => featureDD.fieldsByWorldType[map.worldType]
        );
        return Object.keys(featureDD.fields)
            .filter(name => geomFieldNames.includes(name))
            .map(name => featureDD.fields[name]);
    }

    /*
     * Returns geometry fields that we want to show in the editor
     * @returns {Array<fieldDD>}
     */
    _getEditableGeomFieldDDs() {
        const sessionVars = this.feature.database.getSessionVars();
        return this._geomFieldDDs.filter(fieldDD => !fieldDD.read_only.matches({}, sessionVars));
    }

    /**
     * Return true is it is a popup editor is covering more than half of the viewport
     * The editor in the left panel does not overlap/cover the map and is collapsible
     *
     * @returns {boolean}
     */
    isCoveringTheMap() {
        if (!this.popup) return false;
        const windowWidth = window.innerWidth;
        const popupEditorWidth = this.el.offsetWidth;
        return popupEditorWidth > windowWidth / 2;
    }

    /**
     * Hides the popup editor based on the param
     * @param {boolean} show
     */
    hidePopupEditor() {
        if (this.popup) this.$el.parent().hide();
    }

    /**
     * Shows the popup editor based on the param
     * @param {boolean} show
     */
    showPopupEditor() {
        if (this.popup) this.$el.parent().show();
    }

    /* ******************** Geom editing methods ********************* */

    /**
     * Activates geometry edit mode for a given feature
     * @param  {DDFeature}  feature     Feature being edited/created
     * @param  {string}     [fieldName] Name of geometry field
     */
    activateGeomDrawMode(feature, fieldName) {
        const featureDD = feature.featureDD;
        if (!featureDD.geometry_type) return;
        if (!this._otherGeomsLayers) this._otherGeomsLayers = {};

        const maps = this._getGeomDrawMaps();
        // get editable geom fields' name
        const editableGeomFieldDDs = this._getEditableGeomFieldDDs();
        const editableGeomFieldNames = editableGeomFieldDDs.map(fieldDD => fieldDD.internal_name);
        maps.forEach(map => {
            const { worldType } = map;
            const worldFieldNames = featureDD.fieldsByWorldType[worldType] ?? [];
            const drawFieldName =
                fieldName && worldFieldNames.includes(fieldName)
                    ? fieldName
                    : feature.getGeometryFieldNameForWorld(map.worldId);

            this._enableGeomDrawModeFor(
                map,
                feature,
                drawFieldName,
                worldFieldNames,
                editableGeomFieldNames
            );
        });
    }

    _enableGeomDrawModeFor(map, feature, drawFieldName, worldFieldNames, editableGeomFieldNames) {
        const options = { fieldName: drawFieldName };
        const isDrawFieldEditable = editableGeomFieldNames.includes(drawFieldName);

        // when enabled a read only geomtry, using ReadOnlyMode instead of GeomDrawMode
        // If feature is new, read only geomtry will not able be add as well
        if (isDrawFieldEditable) {
            map.enableGeomDrawModeFor(feature, options);
            map.on('geomdraw-start', this._handleGeomDrawStart);
        } else {
            // Selected read only field geomtry will be shown as other geometries
            // If feature is new, featureRep does not exist for removal
            map.getFeatureRepFor(feature)?.removeFromMap();
            map.setInteractionMode(new ReadOnlyMode(map, { disableContextMenu: true }));
        }

        // display other geometries of the feature in this map/world
        if (!this._otherGeomsLayers[map.worldId])
            this._otherGeomsLayers[map.worldId] = new GeoJSONVectorLayer({ zIndex: 150 });
        const layer = this._otherGeomsLayers[map.worldId];
        layer.clear();
        for (const fieldName of worldFieldNames) {
            const isActiveField = fieldName === drawFieldName;
            this.$(`.mapObjectLabel.geom_field_${fieldName}`).toggleClass(
                'active-geom',
                isActiveField
            );
            // only show other geometries or read only active geomtry
            if (isActiveField && isDrawFieldEditable) continue;
            const geom = feature.getGeometry(fieldName);
            if (geom) layer.addGeoJSON(geom, this._getOtherGeomsStyle());
        }
        map.addLayer(layer);
    }

    /**
     * Disables the geom editing mode, going back to previous mode
     */
    endGeomDrawMode() {
        const maps = this._getGeomDrawMaps();
        maps.forEach(map => {
            map.off('geomdraw-start', this._handleGeomDrawStart);
            map.disableEditMode();

            //clear layer for other (not being edited) geom fields
            const layer = this._otherGeomsLayers?.[map.worldId];
            if (layer) {
                layer.clear();
                map.removeLayer(layer);
            }
        });
    }

    /**
     * Activates geometry rotating mode when we are editing a geometry
     */
    activateGeomRotateMode() {
        const maps = this._getGeomDrawMaps();
        maps.forEach(map => map.enableGeomRotateMode());
    }

    /**
     * Disables the GeomRotateMode, going back to previous mode
     */
    endGeomRotateMode() {
        const maps = this._getGeomDrawMaps();
        maps.forEach(map => map.disableGeomRotateMode());
    }

    /**
     * Get all maps that are able to be drawn on (ie geo map and any maps displayed by internals plugin)
     * @returns {Array}
     * @private
     */
    _getGeomDrawMaps() {
        return this.app.getMaps();
    }

    /**
     * Clear geomDrawModes on 'other' maps if fieldName is repeated
     * @param {event} e
     * @private
     */
    _handleGeomDrawStart(e) {
        const { geomDrawMode } = e;
        this._clearOtherGeomDrawModes(geomDrawMode);
    }

    /**
     * Clear geomDrawModes on 'other' maps if fieldName is repeated
     * @param {GeomDrawMode} geomDrawMode
     * @private
     */
    _clearOtherGeomDrawModes(geomDrawMode) {
        const worldId = geomDrawMode.map.worldId;
        const maps = this._getGeomDrawMaps();
        const feature = this.feature;
        const fieldName = feature.getGeometryFieldNameForWorld(worldId);

        maps.forEach(map => {
            const shouldClear =
                fieldName === feature.getGeometryFieldNameForWorld(map.worldId) &&
                worldId !== map.worldId;
            if (shouldClear) map.geomDrawMode?.clear();
        });
    }

    /* **************************  Field value manipulation  ********************* */
    /**
     * Obtain values, including the changes made by the user, to send to the database
     * Values are obtained from the html input elements
     * @param  {DDFeature}  feature                   Feature being inserted/updated
     * @param  {object}     options
     * @param  {boolean}    options.includeUndefined  If true undefined values are included in result
     * @return {geojson}                              Feature data in geojson format
     */
    getChanges(feature, options) {
        const featureData = this._getGeometryData(feature);

        featureData.type = 'Feature';
        featureData.properties = Object.assign({}, feature.properties, featureData.properties);

        //exclude calculated fields from data to send
        Object.values(feature.featureDD.fields).forEach(fieldDD => {
            if (fieldDD.value) delete featureData.properties[fieldDD.internal_name];
        });
        //add values from field editors
        const fieldEditorValues = this.getFieldEditorValues(options);
        Object.assign(featureData.properties, fieldEditorValues);

        return featureData;
    }

    /**
     * Obtain current values from field editors
     * @param  {object}    options          Optional parameters
     * @param  {boolean}   options.includeUndefined  If true undefined values are included in result
     * @return {object}
     */
    getFieldEditorValues(options) {
        const editorValues = {};

        //get changes from each of the forms and merge them
        this.fieldPanels?.forEach(fieldPanel => {
            const panelValues = fieldPanel.getValues(options);
            Object.assign(editorValues, panelValues);
        });
        return editorValues;
    }

    /**
     * Returns the field editor being used to edit a given field
     * @param  {string} fieldName Name of the field
     * @return {FieldEditor}
     */
    getFieldEditor(fieldName) {
        const fieldPanel = this.fieldPanels.find(
            fieldPanel => !!fieldPanel.fieldEditors[fieldName]
        );

        return fieldPanel.fieldEditors[fieldName];
    }

    /**
     * Returns the current editor value for a given field
     * @param  {string} fieldName Name of the desired field
     * @return {string|number}           current value of the field editor
     */
    getValue(fieldName) {
        return this.getFieldEditor(fieldName).getValue();
    }

    /**
     * Sets the current value of a field editor
     * @param {string} fieldName Name of the field
     * @param {string|number|date|object} value     New value for the field
     */
    setValue(fieldName, value) {
        return this.getFieldEditor(fieldName).setValue(value);
    }

    /**
     * Get geometry details from active geomDrawModes on visible maps
     * Includes orientation
     * @param {feature} feature
     * @returns {Object} featureData
     */
    _getGeometryData(feature) {
        //initialise with existing data
        let featureData = {
            geometry: feature.getGeometry(),
            properties: {},
            secondary_geometries: { ...feature.secondary_geometries }
        };

        this._getGeomDrawMaps().forEach(map => {
            const { geomDrawMode, geomDrawFieldName } = map;
            let geom = geomDrawMode?.getGeometry();
            const orientation = geomDrawMode?.getRotation();

            if (geom !== undefined) {
                if (geom?.type === 'Polygon') geom = this._closePolygon(geom);

                const drawnGeometry = geom?.coordinates?.length ? geom : null;

                if (geomDrawFieldName == this.featureDD.primary_geom_name)
                    featureData.geometry = drawnGeometry;
                else featureData.secondary_geometries[geomDrawFieldName] = drawnGeometry;

                //population of geometry world name fields is done by datasource by insert/update calls
            }

            if (orientation != null) {
                const orientationFieldName = `myw_orientation_${geomDrawFieldName}`;
                featureData.properties[orientationFieldName] = orientation;
            }
        });

        return featureData;
    }

    /**
     * Close polygon by adding closing point to it
     * @param {Object} drawnGeometry
     */
    _closePolygon(drawnGeometry) {
        const coords = drawnGeometry?.coordinates?.[0];
        if (!coords) return drawnGeometry;
        //close polygons automatically
        if (
            drawnGeometry?.type == 'Polygon' &&
            coords.length > 2 &&
            !isEqual(coords[0], coords[coords.length - 1])
        ) {
            coords.push(coords[0]);
        }

        return drawnGeometry;
    }

    /* ************************ Data Validation ********************* */

    /**
     * Validates the geometry and field values according to the data dictionary
     * If a value is invalid this information is presented to the user
     * @param  {geojson}    featureJson Feature data to be validated
     * @return {boolean}                Whether the provided data is valid or not
     */
    async validateChanges(featureJson) {
        let validFormData = true;
        let validGeom;
        let isValid;

        this.fieldPanels.forEach(fieldPanel => {
            isValid = fieldPanel.validateChanges(featureJson);
            validFormData = validFormData && isValid;
            fieldPanel.button?.toggleClass('invalid-tab-content', !isValid);
        });

        const geomEnabled = !!this.featureDD.geometry_type;
        if (geomEnabled) {
            // validate geometry only if feature has geometry
            validGeom = await this._validateGeometries(featureJson);
        }
        const isDataValid = geomEnabled ? validFormData && validGeom.isValid : validFormData;
        const message = this.msg('invalid_data');
        if (!isDataValid) this.displayMessage(message, 'error');

        return isDataValid;
    }

    /**
     * Validate geometries (primary and secondary) on passed featureJson object
     * @param {Object} featureJson
     * @private
     */
    async _validateGeometries(featureJson) {
        const results = [];
        for (let geomFieldDD of this._geomFieldDDs) {
            let featureJsonGeometry;
            const geomName = geomFieldDD.internal_name;
            if (geomName === this.featureDD.primary_geom_name) {
                //For primary geometry
                featureJsonGeometry = featureJson.geometry;
            } else {
                //For secondary geometry
                featureJsonGeometry = featureJson.secondary_geometries[geomName];
            }
            // eslint-disable-next-line no-await-in-loop
            results.push(await this._validateGeometry(featureJsonGeometry, geomFieldDD));
        }
        const invalidResult = results.find(result => result.isValid === false);
        if (invalidResult) return invalidResult;
        else return { isValid: true, message: null };
    }

    /**
     * Elementry geoJson geometry validation
     * @param  {geoJson}  featureJsonGeometry
     * @param  {fieldDD}  geomFieldDD
     * @return {object} an object with two keys: isValid (boolean) and message (string, an error message)
     * @private
     */
    async _validateGeometry(featureJsonGeometry, geomFieldDD) {
        const type = featureJsonGeometry?.type;
        const fieldName = geomFieldDD.internal_name;
        const isRequired = this._isGeomRequired(geomFieldDD);
        const coordinates = featureJsonGeometry?.coordinates;
        const result = { isValid: false, message: null, fieldName };

        if (isRequired && !coordinates) {
            result.message = this._getValidationErrorFor(geomFieldDD.type);
        } else if (type == 'Polygon') {
            result.message = await this._validatePolygonGeom(coordinates);
            if (!result.message) result.isValid = true;
        } else if ((type == 'LineString' || type == 'Linestring') && coordinates.length < 2) {
            result.message = this.msg('complete_linestring');
        } else {
            result.isValid = true;
        }
        this.$(`.mapObjectLabel.geom_field_${fieldName}`).toggleClass(
            'validationHighlight',
            !result.isValid
        );
        this.$(`.mapObjectValidationLabel.geom_field_${fieldName}`).html(result.message || '');

        return result;
    }

    _getValidationErrorFor(geomType) {
        switch (geomType) {
            case 'point':
                return this.msg('place_point');
            case 'linestring':
                return this.msg('place_linestring');
            case 'polygon':
                return this.msg('place_polygon');
        }
    }

    /*
     * If its a primary geometry or is marked as mandatory
     * @param {fieldDD}  geomFieldDD
     * @returns {boolean}
     */
    _isGeomRequired(geomFieldDD) {
        const sessionVars = this.feature.database.getSessionVars();
        return geomFieldDD.mandatory.matches({}, sessionVars);
    }

    /**
     * Checks if the polygon is valid
     * @param  {Array} coordinates  List of geometry coordinates
     * @return {string}             If the polygon is invalid, returns an appropriate message
     * @private
     */
    async _validatePolygonGeom(coordinates) {
        if (coordinates[0]?.length < 4) {
            //polygons are "closed" so should have at least 4 points
            return this.msg('complete_polygon');
        }

        await geometry.init();
        const pol = geometry.polygon(coordinates).removeDuplicates();
        if (!pol.isValid()) return this.msg('invalid_polygon');
    }

    /* ************************ Database operations********************* */

    /**
     * Handler for the save button.
     * Gets the changes, validates them and if valid saves them to the database
     */
    async save() {
        const feature = this.feature;
        let featureJson = this.getChanges(feature, { includeUndefined: true });

        const validated = await this.validateChanges(featureJson);
        const isNew = feature.isNew;

        if (!validated) return;
        //data is valid

        // remove undefined properties before submitting for insert/update
        Object.entries(featureJson.properties).forEach(([key, value]) => {
            if (value === undefined) delete featureJson.properties[key];
        });
        const request = isNew ? this.insertFeature(featureJson) : this.updateFeature(featureJson);

        //for the situation where the  save takes some time,
        //disable the buttons (to avoid the user repeating the save thinking we could cancel the save that is already on its way)
        this.$('.button').attr('disabled', true);
        //and display an information message
        this.displayMessage(this.msg('saving'), 'alert');

        const savedFeature = await request.catch(reason =>
            this._handleSaveError(reason, this.msg('problem_saving'))
        );

        if (!savedFeature) return;
        const changeType = isNew ? 'insert' : 'update';
        this.app.fire('featureCollection-modified', {
            changeType: changeType,
            feature: savedFeature,
            featureType: savedFeature.getType()
        });

        await Util.delay(1000); //wait for a second before closing the editor (so the user can see the success message)

        this.close();
        this.trigger('saved', { feature: savedFeature, isLocked: this.isLocked });
    }

    /**
     * Handler for the delete button
     */
    deleteFeature() {
        const self = this;

        new Dialog({
            contents: this.msg('confirm_delete_message'),
            destroyOnClose: true,
            title: this.msg('confirm_delete_title'),
            buttons: {
                Cancel: {
                    text: this.msg('cancel_btn'),
                    click() {
                        this.close();
                    }
                },
                OK: {
                    text: this.msg('delete_btn'),
                    class: 'dangerous-btn primary-btn',
                    click() {
                        this.close();
                        self._confirmedDelete();
                    }
                }
            }
        });
    }

    /**
     * Deletes the feature
     * @private
     */
    async _confirmedDelete() {
        const feature = this.feature;

        try {
            await feature.preDelete(this.app);

            //send delete to database (via transaction that can be defined in feature's model)
            const transaction = await feature.buildDeleteTransaction(this.app);
            await this.datasource.runTransaction(transaction);
        } catch (reason) {
            this._handleSaveError(reason, this.msg('deleted_not', { type: feature.type }));
        }
        await feature.posDelete(this.app);

        this.displayMessage(this.msg('deleted_ok', { title: feature.getTitle() }));
        // fire an event so that feature is removed from the layer
        this.app.fire('featureCollection-modified', {
            changeType: 'delete',
            feature: feature,
            featureType: feature.getType()
        });
        await Util.delay(1000);

        this.close();
        // fire an event so that feature is removed from the navigation stack
        this.app.fire('currentFeature-deleted');
        this.app.setCurrentFeatureSet([]);
    }

    _handleSaveError(reason, defaultMessage) {
        if (reason instanceof ObjectNotFoundError) {
            //created object is not accessible (due to filters)
            this.trigger('created_not_accessible', this.msg('created_not_accessible'));
            this.close();
            return;
        }
        let rethrow = true;
        let message;

        if (reason.messageGroup && reason.messageId) {
            message = msg(reason.messageGroup, reason.messageId);
            rethrow = false;
        } else if (reason.messageId) {
            message = this.msg(reason.messageId);
            rethrow = false;
        } else if (reason instanceof DuplicateKeyError) {
            // Display inline validation error under keyFieldName input
            const editor = this.getFieldEditor(this.feature.keyFieldName);
            const validationResult = this.msg('duplicate_key', { key: editor.getValue() });
            editor.$el.siblings('.inlineValidation').html(validationResult);

            // Display invalid data at bottom of editor
            message = this.msg('invalid_data');
            rethrow = false;
        } else if (reason instanceof BadRequest) {
            // some of the data is invalid (wasn't caught in validation...)
            message = this.msg('invalid_data_no_field');
            rethrow = false;
        } else {
            // Unexpected error
            message = defaultMessage;
        }
        this.displayMessage(message, 'error');
        this.$('.button').attr('disabled', false); // Activate the buttons again so another action can be performed
        if (rethrow) throw reason;
    }

    /**
     * Inserts a new feature into the database
     * @param  {featureData} featureJson
     * @return {DDFeature}
     */
    async insertFeature(featureJson) {
        const app = this.app;
        let feature = this.feature;

        //start by running any preInsert hook
        await feature.preInsert(featureJson, app);

        //obtain from the feature model a transaction to perform the insertion
        const { transaction, opIndex } = await feature.buildInsertTransaction(featureJson, app);
        const res = await this.datasource.runTransaction(transaction);

        //get feature from database (gets values updated by database triggers)
        const id = res.ids[opIndex];
        feature = await this.datasource.getFeature(feature.getType(), id);

        //run post insert hook
        await feature.posInsert(featureJson, app);
        this.displayMessage(this.msg('created_ok', { title: feature.getTitle() }));
        return feature;
    }

    /**
     * Sends a set of changes to a feature to the database
     * @param  {featureData} featureJson
     * @return {DDFeature}
     */
    async updateFeature(featureJson) {
        let feature = this.feature;
        const preUpdateGeoJson = feature.asGeoJson();
        //start by running pre update hook
        await feature.preUpdate(featureJson, this.app);

        //send changes to database (via transaction that can be defined in feature's model)
        const transaction = await feature.buildUpdateTransaction(featureJson, this.app);
        await this.datasource.runTransaction(transaction);

        await feature.update(); //refresh feature properties
        await feature.posUpdate(preUpdateGeoJson, this.app); //run post update hook
        this.displayMessage(this.msg('saved_ok'));
        return feature;
    }

    /**
     * Activates the Editor's digitizing mode by hiding the fields,
     * so that the user can use the map to set a geometry
     */
    async geomMode(ev) {
        const fieldName = $(ev.currentTarget).parents('.mapObject').attr('geom_field');
        const isUseUserLocation =
            ev.target.getAttribute('data-feature-editor-use-user-location') !== null;

        // Use user location button is nested in a button, stop propagation to ensure only trigger once.
        // It also stopped event propagated for open dialog in phone layout
        if (isUseUserLocation) ev.stopPropagation();

        if (this.popup && !isUseUserLocation) {
            this.$el.dialog('widget').toggle();

            this.openSetMapObjectDialog();
        }
        //copy geometry data to the (detached feature) as this can not be obtained in the same way as from field editors
        const geomData = this._getGeometryData(this.feature);
        this.feature.copyValuesFrom(geomData);

        this.endGeomDrawMode();
        this.activateGeomDrawMode(this.feature, fieldName);

        if (isUseUserLocation) {
            this.setGeomFieldWithUserCurrentLocation(fieldName);
        }
    }

    /**
     * Set a point geomtry with user current location when location tracking is enabled.
     */
    async setGeomFieldWithUserCurrentLocation(fieldName) {
        // ensure the tooltip is closed in touch screen device
        this._setToUserLocationButtons.tooltip('close');

        // when this function is called without user location tracking enabled
        // still can show a message and tell user about it
        if (!this.userLocation.isTracking) {
            const message = this.msg('location_tracking_required');
            this.displayMessage(message, 'error');
            return false;
        }

        const userCurrentLocation = this.userLocation.lastLatLng;

        // get field name from parent, prevent duplicate it on the button
        this._getGeomDrawMaps().forEach(map => {
            const { geomDrawMode, geomDrawFieldName } = map;
            if (geomDrawFieldName !== fieldName) return;

            geomDrawMode.setCoords([userCurrentLocation.lng, userCurrentLocation.lat]);
        });
    }

    /**
     * Opens a (small) dialog that instructs the user to define a geometry on the map
     */
    openSetMapObjectDialog() {
        $(`<div>${this.getGeomModeMsg()}</div>`).dialog({
            modal: false,
            width: 'auto',
            resizable: false,
            position: { my: 'left top', at: 'left+50 top+50', of: window },
            title: this.options.feature.getTitle(),
            buttons: {
                Done: {
                    text: this.msg('done'),
                    class: 'primary-btn',
                    click() {
                        $(this).dialog('close');
                    }
                }
            },
            close: (event, ui) => {
                this.$el.dialog('widget').toggle();
            }
        });
    }

    getGeomModeMsg() {
        const feature = this.options.feature;
        const geomType = feature.geometry ? feature.geometry.type : this.featureDD.geometry_type;
        const geomName = feature.primaryGeomFieldDD().external_name;
        let messageType = '';
        let message = '';

        if (feature.isNew) {
            switch (geomType) {
                case 'linestring':
                    messageType = 'new_line_msg';
                    break;
                case 'polygon':
                    messageType = 'new_polygon_msg';
                    break;
                default:
                    // Point
                    messageType = 'new_point_msg';
                    break;
            }
            message = this.msg(messageType, { geomName: geomName });
        } else {
            message = this.msg('edit_geom_msg');
        }
        return message;
    }

    displayMessage(message, type) {
        new DisplayMessage({ el: this.$('.message-container'), type: type, message: message });

        // Scroll to the bottom of the scrollable form element so the message is clearly visible
        // No scroll needed in the pop up feature editor
        const el = this.$('.feature-fields-and-map-label')[0];
        if (el) el.scrollTop = el.scrollHeight;
    }

    /**
     * Handler for when the user cancels the editing <br/>
     * Either by clicking the cancel button or the dialog close button.
     * Closes the editor and triggers the 'cancelled' event
     */
    cancel() {
        this.close();

        this.trigger('cancelled');
    }

    /**
     * Removes UI elements, clears event handlers, ends geometry draw mode
     */
    close() {
        this.endGeomDrawMode();
        document.removeEventListener('keydown', this.onKeydown);
        document.removeEventListener('keyup', this.onKeyup);

        if (!this.options.el) {
            //we added our own element to the dom to render the editor
            //remove the element from the dom
            this.remove();
            this.app.layout.open('west');
        }

        this.fieldPanels.forEach(panel => panel.close());

        //self can be reused, so we need to remove event handlers, otherwise we can get duplicate ones
        this.undelegateEvents();
    }

    /*
     * Creates a pin/unpin toggle button
     * @return {jQueryElement}
     */
    _createPinBtn() {
        const lockToggleIcon = $('<span>', { class: 'lock-editor' });
        this._setPinState(lockToggleIcon);
        return lockToggleIcon;
    }

    /*
     * Assigns the active class to the icon if the editor is pinned and vice versa
     * Assigns an appropriate title to the icon
     * @param  {jQueryElement} pinIcon
     */
    _setPinState(pinIcon) {
        const titleMsg = this.isLocked ? 'unpin_editor' : 'pin_editor';
        pinIcon.toggleClass('active', this.isLocked).attr('title', msg('FeatureEditor', titleMsg));
    }

    /**
     * Toggles the isLocked flag and sets the state of the pin icon
     */
    toggleLockedState(ev) {
        this.isLocked = !this.isLocked;
        this._setPinState($(ev.currentTarget));
    }

    _getOtherGeomsStyle() {
        if (!this._otherGeomsStyle) {
            const geomDrawOptions = GeomDrawMode.prototype.options;
            const pointOptions = geomDrawOptions.create.point;
            const pointStyle = getEditStyleFor('Point', {
                create: { point: { ...pointOptions, strokeWidth: 2 } }
            });
            const color = geomDrawOptions.create.polyline.color;

            this._otherGeomsStyle = new Style(
                new LineStyle({ color }),
                new FillStyle({ color, opacity: 0.3 }),
                pointStyle
            );
        }
        return this._otherGeomsStyle;
    }
}

export default FeatureEditor;
