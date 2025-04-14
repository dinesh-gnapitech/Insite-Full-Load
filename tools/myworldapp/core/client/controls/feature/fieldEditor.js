// Copyright: IQGeo Limited 2010-2023
import { Control } from 'myWorld/base/control';

/**
 * Options for FieldEditor instances
 * @typedef fieldEditorOptions
 * @property {boolean}  [expandedMode=false]    Whether the input should use more space if useful (ex: button instead of dropdown)<br/>
 *                                               or if it should remain compact
 */

export class FieldEditor extends Control {
    static {
        this.mergeOptions({
            expandedMode: false
        });
    }

    /**
     * @class An input element apropriate to edit the value of a given feature's field <br/>
     *        Super-class for: <br/>
     *        {@link BooleanFieldEditor} <br/>
     *        {@link DateFieldEditor} <br/>
     *        {@link LinkFieldEditor} <br/>
     *        {@link NumberFieldEditor} <br/>
     *        {@link ReferenceFieldEditor} <br/>
     *        {@link CurrentReferenceFieldEditor} <br/>
     *        {@link StringFieldEditor} <br/>
     *        {@link TimeFieldEditor} <br/>
     *        {@link AttachmentsFieldEditor} <br/>
     * @param  {DDFeature}          feature
     * @param  {FieldDD}                fieldDD     Data dictionary information of the field to edit
     * @param  {fieldEditorOptions}     options
     * @constructs
     */
    constructor(owner, feature, fieldDD, options) {
        super(owner, options);
        this.feature = feature;
        this.fieldDD = fieldDD;

        //ENH: remove this convertValueForDisplay call & method - should be defined only in subclasses
        this.fieldValue = this.convertValueForDisplay(
            this.feature.getProperties()[fieldDD.internal_name]
        );
        this.isKeyField = fieldDD.internal_name === feature.keyFieldName;
        this._isReadonly = false;

        this.render();
    }

    get required() {
        const fieldEditorValues = this.owner?.getFieldEditorValues?.() ?? {};
        const featureData = {
            properties: {
                ...this.feature.properties,
                ...fieldEditorValues
            }
        };
        const sessionVars = this.feature.database.getSessionVars();
        return this.isKeyField || this.fieldDD.mandatory.matches(featureData, sessionVars);
    }

    /**
     * Updates the UI to match the current value
     * Override in subclasses
     * Called when the value is modified with setValue()
     */
    render() {}

    /**
     * Returns the given value <br/>
     * Override to converts a value to its apropriate representation on the screen
     * Example: by using the features displayValues information
     * @param  fieldValue
     */
    convertValueForDisplay(fieldValue) {
        return fieldValue;
    }

    /**
     * Returns the value currently set in the UI.
     * If undefined is returned, value won't be included in changes
     */
    getValue() {
        if (this.control) {
            return this.control.getValue();
        }
        return this.$el.val();
    }

    /**
     * Sets(changes) the current value
     * @param value new value
     */
    setValue(value) {
        if (this.control) {
            this.control.setValue(value);
            return;
        }
        this.fieldValue = value;
        this.render();
    }

    /**
     * Called when the UI informs that the value as been changed by the user
     * @param  ev [description]
     * @private
     */
    _changed(ev) {
        ev = ev || {};
        ev.fieldName = this.fieldDD.internal_name;
        this.trigger('change', ev);
    }

    /**
     * Checks if the provided value is valid. <br/>
     * Responsible for mandatory value check. Remaining checks delegated to validateValue()
     * @param  value Value to check
     * @return {boolean|string}       True if the value is valid or an error message if not
     */
    validate(value) {
        const missing =
            typeof value === 'undefined' || value === null || value.toString().length === 0;

        if (this.required && missing) {
            return this.msg('value_required');
        } else if (missing) {
            // a null value is always valid for a non-mandatory field
            return true;
        } else {
            return this.validateValue(value);
        }
    }

    /**
     * Returns true<br/>
     * Override with the logic to check if the provided value is valid
     * @param  value Value to check
     * @return {boolean}       Whether the value is valid or not
     */
    validateValue(value) {
        if (this.isKeyField) {
            //Makes sure '/' and '?' are not permitted in natural keys
            const hasSlash = value.includes('/');
            const hasQuestionMark = value.includes('?');
            if (!hasSlash && !hasQuestionMark) return true;
            else {
                const char = hasSlash ? '/' : '?';
                return this.msg('char_not_permitted_in_key_field', { char });
            }
        } else return true;
    }

    /**
     * Determines whether the validators specified in the config page are all valid
     * @returns {boolean|String} Returns true if all validators are valid, else an error message
     */
    validatePredicates() {
        const validators = this.fieldDD.validators;
        if (!validators.length) return true;

        const fieldEditorValues = this.owner?.getFieldEditorValues?.() ?? {};
        const featureData = {
            properties: {
                ...this.feature.properties,
                ...fieldEditorValues
            }
        };
        const sessionVars = this.feature.database.getSessionVars();

        let ret = true;
        validators.every(validator => {
            const { predicate, message } = validator;
            if (predicate.matches(featureData, sessionVars)) {
                ret = message;
                return false;
            }
            return true;
        });
        return ret;
    }

    /**
     * Update self for changes to the state of other field editors
     * Does nothing, to be overridden in child classes
     * @param {featureData} featureData data from the current value of other field editors
     * @param {object} sessionVars Session variables
     */
    updateFor(featureData, sessionVars) {}

    /**
     * Enables or disables the associated inputs to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        if (this._isReadonly === readonly) return;
        this._isReadonly = readonly;
        let $el;
        if (this.control) {
            if (this.control.setReadonly) return this.control.setReadonly(readonly);
            else if (this.control.$el) $el = this.control.$el;
        } else {
            $el = this.$el;
        }
        $el?.prop('disabled', readonly).toggleClass('disabled-input', readonly);
        $el?.find('button').prop('disabled', readonly);
    }

    //implement interface for elements of ResizableGridMixin
    putInNewRow() {
        return this.fieldDD.new_row;
    }

    isOwnerAPopup() {
        return this.owner.isOwnerAPopup?.();
    }
}

export default FieldEditor;
