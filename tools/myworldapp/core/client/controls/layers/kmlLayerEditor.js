// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-base';
import { LayerEditor } from './layerEditor';

export class KmlLayerEditor extends LayerEditor {
    static {
        this.prototype.messageGroup = 'DefineLayerControl';
        this.prototype.supportsRenderFromFile = true;
    }

    formValuesToLayerDef(formValues) {
        const def = super.formValuesToLayerDef(formValues);
        delete def.url;
        if (def.source == 'feature') {
            def.feature = this.getValue('feature');
        } else {
            def.relativeUrl = formValues.url;
        }
        Object.assign(def.datasource_spec, { baseUrl: '' });

        return def;
    }

    layerDefToFormValues(layerDef) {
        const values = super.layerDefToFormValues(layerDef);
        if (values.source == 'feature') {
            //  Do nothing
        } else {
            values.url = layerDef.relativeUrl;
        }
        return values;
    }
}

myw.layerEditors['kml'] = KmlLayerEditor;

export default KmlLayerEditor;
