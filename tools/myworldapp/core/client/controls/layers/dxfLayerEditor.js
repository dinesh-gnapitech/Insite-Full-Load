// Copyright: IQGeo Limited 2010-2023
import myw, { msg } from 'myWorld-base';
import React, { useState } from 'react';
import { Select, renderReactNode } from 'myWorld/uiComponents/react';
import { LayerEditor } from './layerEditor';
import { FormComponent } from 'myWorld/uiComponents';

class CRSSearch extends FormComponent {
    static {
        this.prototype.messageGroup = 'DefineLayerControl';
    }

    getName() {
        return 'crs';
    }

    constructor(options, reactProps) {
        super(options);
        this.reactProps = reactProps || {};
    }

    render(options) {
        const Searcher = props => {
            const [value, setValue] = useState();
            const [options, setOptions] = useState([]);
            const [fetched, setFetched] = useState(false);
            const [disabled, setDisabled] = useState(false);
            const [status, setStatus] = useState(null);

            Object.assign(this, {
                //  Map the React state to CRSSearch.getValue and setValue
                //  ENH: SetStatus won't do anything until antd 4.19.0
                getValue: () => value,
                setValue,
                setStatus,
                disable: () => setDisabled(true),

                //  Map other React states onto this
                _setOptions: setOptions,
                _fetched: fetched,
                _setFetched: setFetched
            });

            return (
                <Select
                    style={{ width: '300px' }}
                    disabled={disabled}
                    placeholder={msg('DefineLayerControl', 'select_crs')}
                    allowClear={true}
                    showSearch={true}
                    onSearch={() => this._ensureOptions()}
                    value={value}
                    status={status}
                    options={options}
                    notFoundContent={
                        fetched ? (
                            <div>{msg('DefineLayerControl', 'no_matching_crs_found')}</div>
                        ) : null
                    }
                    onChange={val => {
                        setStatus(null);
                        setValue(val);
                    }}
                    {...props}
                />
            );
        };
        const rawNode = options.parent[0];
        renderReactNode(rawNode, Searcher, this.reactProps);
    }

    async _ensureOptions() {
        if (!this._fetched) {
            const res = await this.options.server.getCRSList();
            this._setOptions(
                res.keys.map(val => ({
                    label: `EPSG:${val}`,
                    value: `EPSG:${val}`
                }))
            );
            this._setFetched(true);
        }
    }
}

export class DxfLayerEditor extends LayerEditor {
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

        this.prototype.supportsRenderFromFile = true;
    }

    renderAdvanced(table) {
        const rowDefs = [
            {
                label: '{:crs}:',
                components: [
                    new CRSSearch({
                        server: this.options.system.server
                    })
                ]
            }
        ];

        this._renderRows(table, rowDefs);
    }

    formValuesToLayerDef(formValues) {
        const def = super.formValuesToLayerDef(formValues);
        delete def.url;
        if (def.source == 'feature') {
            def.feature = this.getValue('feature');
        } else {
            def.relativeUrl = formValues.url;
        }
        def.crs = formValues.crs;
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

    validate(def) {
        const res = super.validate(def);
        if (!res.isValid) return res;

        if (!def.crs) {
            this.formInputs.crs.setStatus('error');
            return { isValid: false, msg: 'no_crs_specified' };
        }

        return { isValid: true };
    }
}

myw.layerEditors['dxf'] = DxfLayerEditor;

export default DxfLayerEditor;
