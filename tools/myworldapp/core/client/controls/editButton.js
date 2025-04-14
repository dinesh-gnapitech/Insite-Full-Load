// Copyright: IQGeo Limited 2010-2023
import { PluginButton } from 'myWorld/base/pluginButton';
import editImg from 'images/actions/edit.svg';

export class EditButton extends PluginButton {
    static {
        this.prototype.id = 'details-editable';
        this.prototype.imgSrc = editImg;
        this.prototype.inactiveImgSrc = editImg;
        this.prototype.titleMsg = 'edit_details';
    }

    /**
     * Creates a 'Edit' button for features
     * The button puts the current feature in 'edit' mode
     * @constructs
     * @extends {PluginButton}
     */
    constructor(...args) {
        super(...args);
        this.app.userHasPermission('editFeatures').then(hasPerm => {
            if (!hasPerm) this.remove();
        });
    }

    render() {
        const feature = this.app.currentFeature;
        const active =
            feature &&
            feature.isEditable() &&
            !this.owner.editor &&
            this.app.isFeatureEditable(feature.type, feature);
        this.setActive(active);
    }

    action() {
        this.owner.setMode('edit');
        this.app.recordFunctionalityAccess('core.details_tab.edit_feature');
    }
}

export default EditButton;
