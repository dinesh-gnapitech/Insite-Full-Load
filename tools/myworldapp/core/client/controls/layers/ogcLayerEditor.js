// Copyright: IQGeo Limited 2010-2023
import { pick } from 'underscore';
import myw from 'myWorld-base';
import { Dropdown, Input, Checkbox } from 'myWorld/uiComponents';
import { LayerEditor } from './layerEditor';

export class OgcLayerEditor extends LayerEditor {
    static {
        this.prototype.messageGroup = 'DefineLayerControl';

        this.prototype.tabs = [
            {
                id: 'properties-layers-tab',
                title: '{:properties}'
            },
            {
                id: 'advanced-layers-tab',
                title: '{:advanced}'
            },
            {
                id: 'general-layers-tab',
                title: '{:general}'
            }
        ];
    }

    renderAdvanced(table) {
        const rowDefs = [
            {
                label: '{:wmsLayerGroup}:',
                components: [new Input({ name: 'wmsLayerGroup' })]
            },
            {
                label: '{:wfsUrl}:',
                components: [new Input({ name: 'wfsUrl', cssClass: 'block' })]
            },
            {
                label: '{:wfsVersion}:',
                components: [
                    new Dropdown({
                        name: 'wfsVersion',
                        options: ['1.0.0', '1.1.0', '2.0.0'],
                        minWidth: '60px'
                    })
                ]
            },
            {
                label: '{:tunnelled}:',
                components: [new Checkbox({ name: 'tunnelled' })]
            },
            {
                name: 'control_item_legend',
                label: '{:control_item_legend}:',
                components: [new Checkbox({ name: 'control_item_legend' })]
            }
        ];

        this._renderRows(table, rowDefs);
    }

    formValuesToLayerDef(formValues) {
        const def = super.formValuesToLayerDef(formValues);
        Object.assign(def.datasource_spec, pick(formValues, 'wfsUrl', 'wfsVersion', 'tunnelled'));
        def.datasource_spec.wmsUrl = formValues.url;
        def.wmsLayerGroup = formValues.wmsLayerGroup;
        return def;
    }

    layerDefToFormValues(layerDef) {
        const values = super.layerDefToFormValues(layerDef);
        values.url = layerDef.datasource_spec.wmsUrl;
        return values;
    }

    onUrlChange() {
        const url = this.formInputs['url'].getValue();
        if (url.includes('wms')) {
            const wfsUrl = url.replace('wms', 'wfs');
            this.formInputs['wfsUrl'].setValue(wfsUrl);
        }
    }

    validate(def) {
        const res = super.validate(def);
        if (!res.isValid) return res;

        if (!def.wmsLayerGroup) {
            this.$("input[name='wmsLayerGroup']").addClass('validationHighlight');
            return { isValid: false, msg: 'no_layer_specified' };
        }

        return { isValid: true };
    }
}

myw.layerEditors['ogc'] = OgcLayerEditor;

export default OgcLayerEditor;
