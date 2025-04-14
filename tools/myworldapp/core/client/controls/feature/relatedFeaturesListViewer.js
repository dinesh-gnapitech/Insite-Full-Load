// Copyright: IQGeo Limited 2010-2023
import ReferenceSetFieldViewer from './referenceSetFieldViewer';
import FeatureListControl from './featureListControl';

/**
 * Displays contents of a reference_set field in a collapsable panel
 * @constructor
 * @extends {FieldViewer}
 */
export class RelatedFeaturesListViewer extends ReferenceSetFieldViewer {
    static featureListClass = FeatureListControl;
}

export default RelatedFeaturesListViewer;
