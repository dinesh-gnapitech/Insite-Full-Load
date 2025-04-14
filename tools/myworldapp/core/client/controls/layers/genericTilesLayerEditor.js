// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-base';
import { LayerEditor } from './layerEditor';

export class GenericTilesLayerEditor extends LayerEditor {
    static {
        this.prototype.messageGroup = 'DefineLayerControl';
    }

    formValuesToLayerDef(formValues) {
        const def = super.formValuesToLayerDef(formValues);
        delete def.url;
        Object.assign(def.datasource_spec, { baseUrl: '' });
        def.relativeUrl = formValues.url;
        def.tileType = 'raster';
        return def;
    }

    layerDefToFormValues(layerDef) {
        const values = super.layerDefToFormValues(layerDef);
        values.url = layerDef.relativeUrl;
        return values;
    }
}

myw.layerEditors['generic_tiles'] = GenericTilesLayerEditor;

export default GenericTilesLayerEditor;
