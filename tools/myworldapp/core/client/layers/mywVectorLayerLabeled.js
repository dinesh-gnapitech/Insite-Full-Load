// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import { MywVectorLayer } from 'myWorld/layers/mywVectorLayer';

/**
 * Layer where myWorld features are rendered using vectors and with a labeled that displayed when the user hovers the mouse over the vector
 * @extends {MywVectorLayer}
 */
export class MywVectorLayerLabeled extends MywVectorLayer {
    /**
     * Creates and returns a representation for a feature
     * @param  {Feature} feature [description]
     * @return {FeatureRepresentation}
     */
    createRepForFeature(feature, ...args) {
        const rep = super.createRepForFeature(feature, ...args);
        if (!rep) return;

        // we don't want the labels to be displayed on touch events
        if (!myw.isTouchDevice) rep.bindTooltip(this.getLabelTextFor(feature));

        return rep;
    }

    /**
     * Text to use as label for a feature
     * @param  {Feature} feature
     * @return {string}      The text to use as label
     */
    getLabelTextFor(feature) {
        return `${feature.getTitle()} - ${feature.getShortDescription()}`;
    }
}

export default MywVectorLayerLabeled;
