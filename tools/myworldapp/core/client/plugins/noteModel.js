import myw from 'myWorld/base/core';
import { FeatureEditor } from 'myWorld/controls';
import { MyWorldFeature } from 'myWorld/features/myWorldFeature';

class NoteEditor extends FeatureEditor {
    constructor(...args) {
        super(...args);

        if (this.feature.isNew) {
            this.on('ready', this.setDefaults, this);
        }
    }

    setDefaults() {
        const prevFeature = this.app.prevCurrentFeature;
        if (prevFeature) this.setValue('referenced_feature', prevFeature);
    }
}

class NoteModel extends MyWorldFeature {
    static {
        this.prototype.editorClass = NoteEditor;
    }
}

myw.featureModels['note'] = NoteModel;

export default NoteModel;
