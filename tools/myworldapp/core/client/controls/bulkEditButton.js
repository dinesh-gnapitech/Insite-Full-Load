// Copyright: IQGeo Limited 2010-2023
import { PluginButton } from 'myWorld/base/pluginButton';
import editImg from 'images/actions/edit.svg';

export class BulkEditButton extends PluginButton {
    static {
        this.prototype.id = 'bulk-edit';
        this.prototype.imgSrc = editImg;
        this.prototype.inactiveImgSrc = editImg;
        this.prototype.titleMsg = 'bulk_edit';
    }

    /**
     * Creates a 'Bulk Edit' button for the selected list of features
     * The button puts the current set of features into 'edit' mode
     * @constructs
     * @extends {PluginButton}
     */
    constructor(...args) {
        super(...args);
        this.app.userHasPermission('bulkEditFeatures').then(hasPerm => {
            if (!hasPerm) this.remove();
        });
    }

    render() {
        const features = this.app.currentFeatureSet.items;

        const active =
            !this.owner.editor &&
            features.every(
                feature => feature.isEditable() && this.app.isFeatureEditable(feature.type, feature)
            );
        this.setActive(active);
    }

    action() {
        this.owner.setMode('edit');
        this.app.recordFunctionalityAccess('core.details_tab.bulk_edit');
    }
}
