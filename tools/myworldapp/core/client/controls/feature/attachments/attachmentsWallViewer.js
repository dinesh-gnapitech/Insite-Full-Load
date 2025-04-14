// Copyright: IQGeo Limited 2010-2023
import { ReferenceSetFieldViewer } from '../referenceSetFieldViewer';
import { AttachmentWallControl } from './attachmentControls';

/**
 * Displays contents of a attachment reference_set field in a collapsable panel
 * @constructor
 * @extends {FieldViewer}
 */
export class AttachmentsWallViewer extends ReferenceSetFieldViewer {
    static featureListClass = AttachmentWallControl;
}

export default AttachmentsWallViewer;
