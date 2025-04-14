//Copyright: IQGeo Limited 2010-2020
import $ from 'jquery';
import { FeatureSetSelectionDialog } from './featureSetSelectionDialog';

export class FeatureSelectionDialog extends FeatureSetSelectionDialog {
    static {
        this.prototype.events = {
            'click .result-info-col': '_selectFeature',
            'click .result-remove-col': 'removeFeature',
            'click .mapObjectLabel:not(.not-clickable)': 'hideOwner'
        };
    }

    /**
     * Sets selectedFeatureSet taking into account previous selections
     * @param {Feature[]} features An array with recent list of selectable features
     */
    mapSelectionHandler(features) {
        const constraints = Object.keys(this.typeConstraints);
        features = features.filter(feature => {
            if (constraints?.length && !constraints?.includes(feature.getUniversalType()))
                return false;
            return true;
        });
        if (features.length) this.selectedFeatureSet.removeAll(); //only empty current selection if there are new features

        features.forEach(feature => {
            this.selectedFeatureSet.add(feature);
        });

        this.displaySelectionList();
    }

    displaySelectionList() {
        super.displaySelectionList();
        const isApplyUnavailable = this.selectedFeatureSet.size() > 1;
        this.$el
            .dialog('widget')
            .find('.apply-feature-selection')
            .attr('disabled', isApplyUnavailable);
    }

    /**
     * Finds the clicked on feature and sets it as the current feature
     * @param {event} ev results list row that is clicked on.
     *      Contains attribute featureId which is used to select the feature
     * @private
     */
    onOkClick() {
        this.done();
    }

    done(feature) {
        if (!feature && this.selectedFeatureSet.size() == 1) {
            feature = this.selectedFeatureSet.items[0];
        }
        const { onDone } = this.options;
        onDone(feature);
        this.close();
    }

    /**
     * Finds the clicked on feature and sets it as the current feature
     * @param {event} ev results list row that is clicked on.
     *      Contains attribute featureId which is used to select the feature
     * @private
     */
    _selectFeature(ev) {
        let featureId = undefined;
        if (ev?.currentTarget) featureId = $(ev.currentTarget).parent('tr').attr('id');

        if (featureId) {
            const feature = this.selectedFeatureSet.getFeatureByUrn(
                featureId.substr(3, featureId.length)
            );
            this.done(feature);
        }
    }
}

export default FeatureSelectionDialog;
