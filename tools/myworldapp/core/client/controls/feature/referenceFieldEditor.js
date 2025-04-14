// Copyright: IQGeo Limited 2010-2023
import { ObjectNotFoundError, UnauthorizedError, MissingFeatureDD } from 'myWorld/base';
import { Input } from 'myWorld/uiComponents';
import { FieldEditor } from './fieldEditor';
import FeatureSelectionDialog from './featureSelectionDialog';
import $ from 'jquery';

/**
 * Field editor to chose features via map selection. For fields of type reference, foreign_key.
 * @name ReferenceFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class ReferenceFieldEditor extends FieldEditor {
    static {
        this.prototype.className = 'text disabled-input';
        this.prototype.attributes = { disabled: 'true' };

        this.prototype.events = {
            'click #reference-field-selector': 'openDialog'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this._internalValue = this.feature.getProperties()[fieldDD.internal_name];

        const container = $('<div>', { id: 'related-field-container' });

        //Disabled input field
        this.control = new Input({
            value: this.fieldValue,
            cssClass: 'disabled-input ui-reference-feature',
            disabled: 'disabled'
        });

        this.editButton = $('<button/>', {
            id: 'reference-field-selector',
            class: 'field-edit-btn feature-edit-btn',
            title: this.msg('edit_feature')
        })
            .button()
            .appendTo(this.$el);

        // Add input field to container
        container.append(this.control.$el);
        container.append(this.editButton);

        //Initially assume readonly and hide edit button, setReadOnly will be called later
        this._isReadonly = true;
        this.control.$el.addClass('read-only');
        this.editButton.css('display', 'none');

        this.setElement(container);

        //enable firing 'change' event
        this.control.$el.on('input', this._changed.bind(this));
    }

    // Close any owned dialogs when removed.
    remove() {
        if (this.selectDialog) {
            if (this.selectDialog.isOpen()) this.selectDialog.close();
        }
        super.remove();
    }

    convertValueForDisplay(fieldValue) {
        const fieldDD = this.fieldDD;
        const displayValues = this.feature.displayValues;

        if (displayValues && fieldDD.internal_name in displayValues) {
            fieldValue = displayValues[fieldDD.internal_name];
        }
        return fieldValue;
    }

    getValue() {
        return this._internalValue ?? null;
    }

    /**
     * Returns true since we don't provide the user a way to set a reference feature.
     * which means we don't need to validate it.
     * @return {boolean}  True
     */
    validateValue(value) {
        return true;
    }

    /**
     * Sets(changes) the current value
     * @param value new value
     */
    setValue(rec) {
        this._referencedFeatures = [rec];
        if (!rec) {
            this._referencedFeatures = [];
            this._setInternalValue(null);
            this.feature.displayValues[this.fieldDD.internal_name] = '';
        } else {
            this._referencedFeatures = [rec];
            this._setInternalValue(this._isReference() ? rec.getUrn() : rec.getId());
            this.feature.displayValues[this.fieldDD.internal_name] = rec.getTitle() || '';
        }
        this.control.setValue(this.convertValueForDisplay(''));
        this.render();
    }

    /**
     * Sets value internally (not in UI)
     * @param {obj} value
     * @private
     */
    _setInternalValue(value) {
        this._internalValue = value;
    }

    /**
     * Sets related to field to null on clear button click
     */
    reset() {
        if (this._isReadonly) return;

        this.setValue(null); //sets display value
    }

    /**
     * Enables or disables the associated inputs to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        //Overriding whole behavior so we're not calling super implementation
        if (this._isReadonly === readonly) return;
        this._isReadonly = readonly;
        if (!readonly) {
            //Note: We don't hide the button is subsequent calls to avoid confusing users
            this.control.$el.removeClass('read-only');
            this.editButton.css('display', 'block');
        }

        this.editButton
            .toggleClass('inactive', readonly)
            .prop('disabled', readonly)
            .css('opacity', readonly ? 0.5 : 1);
    }

    async openDialog() {
        if (!this.selectDialog) {
            this.selectDialog = await this._initialiseSelectionDialog();
        }

        if (!this.selectDialog?.isOpen()) {
            this.app.fire('reference-selection-opening', { origin: this });
            this.selectDialog.open();
            this.selectDialog.setFeatures(this._referencedFeatures);
        }
    }

    async _initialiseSelectionDialog() {
        const onDone = feature => {
            this.setValue(feature);
            return true;
        };

        //obtain referenced features. "if" check is required in case they have been set beforehand via a call to setValue()
        if (!this._referencedFeatures)
            this._referencedFeatures = await this._getRelationshipFeatures();

        const typeConstraints = await this.app.database.getDDInfoFor(this.fieldDD.typeParams);
        this.app.fire('reference-selection-opening', { origin: this });
        const dialog = new FeatureSelectionDialog(this, {
            title: this.msg('selection_dialog_title', {
                field_name: this.fieldDD.external_name
            }),
            features: this._referencedFeatures,
            typeConstraints,
            onDone
        });
        return dialog;
    }

    async _getRelationshipFeatures() {
        const app = this.app;
        try {
            const features = await this.feature.followRelationship(this.fieldDD.internal_name); //await is necessary for catching async errors below
            return features;
        } catch (e) {
            if (
                e instanceof ObjectNotFoundError ||
                e instanceof UnauthorizedError ||
                e instanceof MissingFeatureDD
            )
                app.message(app.msg('missing_object_error'));
            else {
                app.message(`${app.msg('unexpected_error')}: ${e.message}`);
                console.error(e);
            }
            return [];
        }
    }

    _isReference() {
        const reference_types = ['reference', 'reference_set'];
        return reference_types.includes(this.fieldDD.baseType);
    }
}

export default ReferenceFieldEditor;
