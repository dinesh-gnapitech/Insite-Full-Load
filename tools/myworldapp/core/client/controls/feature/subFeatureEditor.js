// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-base';
import { Control } from 'myWorld/base/control';
import { Dialog } from 'myWorld/uiComponents';
import FieldEditorsPanel from './fieldEditorsPanel';

export class SubFeatureEditor extends Control {
    static {
        this.mergeOptions({
            useSoftKeyboardInput: true
        });

        this.prototype.className = 'feature-edit-container feature-edit-container-popup';
    }

    /**
     * @class  A UI control for editing a sub feature <br/>
     *         Does field validation <br/>
     *         Field editors are rendered using {@link FieldEditorsPanel}
     * @param  {Application|Control}    owner
     * @param  {featureEditorOptions}   options
     * @param  {DDFeature}              options.feature                Feature to edit
     * @param  {Array<string>}          options.excludeFields          Field to exclude from the editor
     * @param  {method}                 options.handleOk               Method to execute when OK button clicked
     * @param  {boolean}                options.useSoftKeyboardInput   Whether to use the softKeyboardInput or not
     * @constructs
     * @extends {Control}
     * @fires cancelled
     */
    constructor(owner, options) {
        super(owner, options);
        this.feature = options.feature;
        this.render();
    }

    /**
     * Builds a form for sub feature editing. <br/>
     * Includes the field editors, and  buttons for geometry mode, saving, canceling and deleting
     * @param  {DDFeature}  feature     The feature to be edited
     * @param  {jQueryElement}  container   The container where the editor should be rendered
     * @private
     */
    render() {
        //open a dialog to render on
        this.openEditorDialog();
        this.fieldEditorsEl = $('<div>', { class: 'field-editors' });
        this.$el.html(this.fieldEditorsEl);

        this.renderFieldEditors();
        if (this.options.useSoftKeyboardInput) myw.softKeyboardInput.enableOn(this.$el, this.app);
    }

    /**
     * Converts self's element into a dialog and add it to the dom
     */
    openEditorDialog() {
        const titleText = this.options.feature.getTitle();
        this.dialog = new Dialog({
            contents: this.$el,
            modal: true,
            width: 'auto',
            position: { my: 'top', at: 'top+50', of: window },
            resizable: false,
            title: titleText,
            destroyOnClode: true,
            buttons: {
                Ok: {
                    text: this.msg('ok_btn'),
                    class: 'primary-btn',
                    click: () => {
                        this.handleOk();
                    }
                }
            }
        });
    }

    /**
     * Renders field editors
     */
    renderFieldEditors() {
        // jshint newcap: false
        const feature = this.feature;
        let fieldNames = feature.getFieldsOrder();
        let fieldEditorsPanel;

        if (this.feature.isNew) this.addKeyFieldTo(fieldNames);
        this.options.excludeFields?.forEach(item => {
            fieldNames = fieldNames.filter(field => field !== item);
        });

        fieldEditorsPanel = new FieldEditorsPanel(this, {
            el: this.fieldEditorsEl,
            feature: feature,
            fields: fieldNames
        });

        this.fieldPanels = [fieldEditorsPanel];

        this.fieldPanels.forEach(fieldPanel => {
            //propagate value change events
            this.listenTo(fieldPanel, 'change', this._propagateEvent);
        });
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

    /* **************************  Field value manipulation  ********************* */
    /**
     * Obtain values, including the changes made by the user
     * Values are obtained from the html input elements
     * @param  {DDFeature}  feature     Feature being inserted/updated
     * @return {geojson}                Feature data in geojson format
     */
    getChanges(feature) {
        const featureData = {};

        featureData.type = 'Feature';
        featureData.properties = Object.assign({}, feature.properties, featureData.properties);

        let editorValues;
        //get changes from each of the forms and merge them
        for (let fieldPanel of this.fieldPanels) {
            editorValues = fieldPanel.getValues(feature);
            Object.assign(featureData.properties, editorValues);
        }
        feature.properties = featureData.properties;
        return feature;
    }

    /* ************************ Data Validation ********************* */

    /**
     * Validates the field values according to the data dictionary
     * If a value is invalid this information is presented to the user
     * @param  {geojson}    featureJson Feature data to be validated
     * @return {boolean}                Whether the provided data is valid or not
     */
    async validateChanges(featureJson) {
        let validFormData = true;
        let isValid;

        this.fieldPanels.forEach(fieldPanel => {
            isValid = fieldPanel.validateChanges(featureJson);
            validFormData = validFormData && isValid;

            if (fieldPanel.button) {
                if (!isValid) fieldPanel.button.addClass('invalid-tab-content');
                else fieldPanel.button.removeClass('invalid-tab-content');
            }
        });

        return isValid;
    }

    /* ************************ Database operations********************* */

    /**
     * Handler for the save button.
     * Gets the changes, validates them and if valid sends them to the handleOk method
     */
    async handleOk() {
        const featureJson = this.getChanges(this.feature);

        const validated = await this.validateChanges(featureJson);

        if (validated) {
            this.options.handleOk(featureJson);
            this.dialog?.close();
        }
    }
}

export default SubFeatureEditor;
