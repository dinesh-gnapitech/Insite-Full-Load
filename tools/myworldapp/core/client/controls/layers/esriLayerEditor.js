// Copyright: IQGeo Limited 2010-2023
import { pick } from 'underscore';
import myw from 'myWorld-base';
import { Dropdown, Input, Checkbox } from 'myWorld/uiComponents';
import { LayerEditor } from './layerEditor';

export class EsriLayerEditor extends LayerEditor {
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
                label: '{:esriMap}:',
                components: [new Input({ name: 'esriMap' })]
            },
            {
                label: '{:authType}:',
                components: [new Dropdown({ name: 'authType', options: ['', 'token', 'ntlm'] })]
            },
            {
                label: '{:username}:',
                components: [new Input({ name: 'username' })]
            },
            {
                label: '{:password}:',
                components: [new Input({ name: 'password' })]
            },
            {
                label: '{:verifySsl}:',
                components: [new Checkbox({ name: 'verifySsl' })]
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
        Object.assign(
            def.datasource_spec,
            pick(formValues, 'url', 'verifySsl', 'username', 'password', 'authType')
        );
        def.esriMap = formValues.esriMap;
        return def;
    }

    validate(def) {
        const res = super.validate(def);
        if (!res.isValid) return res;

        if (!def.esriMap) {
            this.$("input[name='esriMap']").addClass('validationHighlight');
            return { isValid: false, msg: 'no_map_name_specified' };
        }

        return { isValid: true };
    }
}

myw.layerEditors['esri'] = EsriLayerEditor;

export default EsriLayerEditor;
