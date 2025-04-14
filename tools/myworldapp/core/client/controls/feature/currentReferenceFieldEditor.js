// Copyright: IQGeo Limited 2010-2023
import { ReferenceFieldEditor } from './referenceFieldEditor';

/**
 * Input for fields of type reference that auto-populates with the current feature. <br/>
 * Disabled text input with a clear button
 * @name CurrentReferenceFieldEditor
 * @constructor
 * @extends {ReferenceFieldEditor}
 */
export class CurrentReferenceFieldEditor extends ReferenceFieldEditor {
    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        const curFeature = this.app.prevCurrentFeature;
        if (this.feature.isNew && curFeature) {
            this.setValue(curFeature);
        }
    }
}

export default CurrentReferenceFieldEditor;
