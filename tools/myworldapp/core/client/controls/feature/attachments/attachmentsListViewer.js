// Copyright: IQGeo Limited 2010-2023
import { ReferenceSetFieldViewer } from '../referenceSetFieldViewer';
import { AttachmentListControl } from './attachmentControls';

/**
 * Displays contents of a attachment reference_set field in a collapsable panel
 * @constructor
 * @extends {FieldViewer}
 */
export class AttachmentsListViewer extends ReferenceSetFieldViewer {
    static featureListClass = AttachmentListControl;
}

export default AttachmentsListViewer;
