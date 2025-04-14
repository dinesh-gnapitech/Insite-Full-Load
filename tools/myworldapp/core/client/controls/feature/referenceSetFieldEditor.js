// Copyright: IQGeo Limited 2010-2023
import ReferenceFieldEditor from './referenceFieldEditor';
import FeatureSetSelectionDialog from './featureSetSelectionDialog';
import FeatureSetViewerDialog from './featureSetViewerDialog';

/**
 * Field editor to chose features via map selection. For fields of type reference_set
 * @name ReferenceSetFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class ReferenceSetFieldEditor extends ReferenceFieldEditor {
    static {
        this.prototype.messageGroup = 'ReferenceFieldEditor';
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.editButton.css('display', 'block'); //We always want to see this control.  It will toggle between edit/view depending on this._isReadonly
    }

    /**
     * Sets(changes) the current value
     * @param value new value
     */
    setValue(features) {
        this._referencedFeatures = features;
        if (!features) {
            this._setInternalValue(null);
            this.feature.displayValues[this.fieldDD.internal_name] = '';
        } else {
            this._setInternalValue(features.map(item => item.getUrn()));
            this.feature.displayValues[this.fieldDD.internal_name] = features.length;
        }
        this.control.setValue(this.convertValueForDisplay(''));
        this.render();
    }

    /**
     * Enables or disables the associated inputs to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        this._isReadonly = readonly;
        if (!readonly) {
            //Note: We don't hide the button is subsequent calls to avoid confusing users
            this.control.$el.removeClass('read-only');
        }

        this.editButton
            .prop('title', readonly ? this.msg('view_featureset') : this.msg('edit_featureset'))
            .toggleClass('read-only', readonly);
    }

    /**
     * Opens a selection or viewer dialog depending on this._isReadonly status.
     */
    async openDialog() {
        if (!this._isReadonly && !this.selectDialog) {
            this.selectDialog = await this._initialiseSelectionDialog();
        } else if (this._isReadonly && !this.viewDialog) {
            this.viewDialog = await this._initialiseViewDialog();
        }
        if (!this._isReadonly && !this.selectDialog?.isOpen()) {
            this.app.fire('reference-selection-opening', { origin: this });
            this.selectDialog.setFeatures(this._referencedFeatures);
            this.selectDialog.open();
        } else if (this._isReadonly && !this.viewDialog?.isOpen()) {
            this.viewDialog.setFeatures(this._referencedFeatures);
            this.viewDialog.open();
        }
    }

    async _initialiseSelectionDialog() {
        const onDone = (features = []) => {
            this.setValue(features);
            return true;
        };

        //obtain referenced features. "if" check is required in case they have been set beforehand via a call to setValue()
        if (!this._referencedFeatures)
            this._referencedFeatures = await this._getRelationshipFeatures();

        const typeConstraints = await this.app.database.getDDInfoFor(this.fieldDD.typeParams);
        this.app.fire('reference-selection-opening', { origin: this });
        const dialog = new FeatureSetSelectionDialog(this, {
            title: this.msg('selection_dialog_title', {
                field_name: this.fieldDD.external_name
            }),
            features: this._referencedFeatures,
            typeConstraints,
            onDone
        });
        return dialog;
    }

    async _initialiseViewDialog() {
        //obtain referenced features. "if" check is required in case they have been set beforehand via a call to setValue()
        if (!this._referencedFeatures)
            this._referencedFeatures = await this._getRelationshipFeatures();

        const typeConstraints = await this.app.database.getDDInfoFor(this.fieldDD.typeParams);
        return new FeatureSetViewerDialog(this, {
            title: this.msg('view_dialog_title', {
                field_name: this.fieldDD.external_name
            }),
            features: this._referencedFeatures,
            typeConstraints
        });
    }
}

export default ReferenceSetFieldEditor;
