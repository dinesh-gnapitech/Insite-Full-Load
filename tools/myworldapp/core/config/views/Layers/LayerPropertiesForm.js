import React, { Component } from 'react';
import { Input, Select } from 'antd';
import { inject, observer } from 'mobx-react';
import {
    FormBuilder,
    localise,
    DatasourceEditor,
    SelectWithInput,
    MultiLanguageInput
} from '../../shared';
import { CodeInput } from './CodeInput';

const Option = Select.Option;

const scale = [...Array(31).keys()];

//Create an array of numbers from -50 to 50 to be used in the render order select box
const array51 = [...Array(51).keys()];
const negativeArray51 = array51.map(num => num * -1);
negativeArray51.shift(); //Remove 0
const renderOrder = [...negativeArray51.reverse(), ...array51];

//Component for the Properties tab of the Layer editor
@inject('store')
@localise('layers')
@observer
export class LayerPropertiesForm extends Component {
    constructor(props) {
        super(props);
    }

    async componentDidMount() {
        this.props.store.datasourceStore.getAll();
        await this.props.store.layerStore.getAll();

        this.props.onMount?.(this);
    }

    render() {
        const { msg, formRef, store, data, edit } = this.props; //form is an antd form that includes the data and api

        const layout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };

        const dsStore = this.props.store.datasourceStore.store;
        if (!Object.keys(dsStore).length || !data.spec) return null;

        const defaults = store.layerStore.defaults;

        const onCategoryChange = this.onCategoryChange;
        const onDSChange = this.onDSChange;
        const onSpecFieldChange = this.onSpecFieldChange;

        //create field schema to pass to form builder
        let fields = [
            {
                id: 'name',
                tooltip: msg('name_help'),
                component: <Input disabled={edit} />,
                rules: [{ required: true }]
            },
            {
                id: 'display_name',
                tooltip: msg('display_name_help'),
                component: <MultiLanguageInput style={{ width: 300 }} />
            },
            {
                id: 'description',
                tooltip: msg('description_help'),
                component: <MultiLanguageInput style={{ width: 300 }} />
            },
            {
                id: 'category',
                tooltip: msg('category_help'),
                initialValue: defaults['category'],
                component: (
                    <SelectWithInput
                        msg={msg}
                        value={
                            store.layerStore.current.category || store.layerStore.defaults.category
                        }
                        items={store.layerStore.all_categories}
                        placeholderText={'category_field_placeholder'}
                        onChange={onCategoryChange}
                    />
                )
            },
            {
                id: 'code',
                tooltip: msg('code_help'),
                component: (
                    <CodeInput
                        msg={msg}
                        layers={this.props.store.layerStore.store}
                        currentLayerName={store.layerStore.current.name}
                    />
                )
            }
        ];

        //fields from datasource configuration
        fields.push(
            FormBuilder.createFieldFromDef('tableGroup1', {
                viewClass: 'FieldDivider',
                args: { label: msg('datasource_config') }
            })
        );

        let dsDef = { ...dsStore[data['datasource'] ?? defaults['datasource']] };
        const dsType = dsDef?.type;
        const dsName = dsDef?.name || defaults['datasource'];

        fields.push({
            id: 'datasource',
            help: msg('datasource_help'),
            initialValue: defaults['datasource'],
            component: (
                <DatasourceEditor
                    msg={msg}
                    options={Object.keys(dsStore).sort()}
                    dsType={dsType}
                    onChange={onDSChange}
                />
            )
        });

        const dsSpecificFields = store.layerStore.evaluateDefaultsFor(dsType, dsName, store);

        dsSpecificFields.forEach(fieldDef => {
            fieldDef = { ...fieldDef, dsName };
            const add = !fieldDef.condition || fieldDef.condition(data);

            if (add)
                fields.push(
                    FormBuilder.createFieldFromDef(
                        'spec.',
                        { ...fieldDef, ...{ store: this.props.store.layerStore } },
                        msg,
                        onSpecFieldChange
                    )
                );
        });

        //fields that control layer display
        fields.push(
            FormBuilder.createFieldFromDef('tableGroup2', {
                viewClass: 'FieldDivider',
                args: { label: msg('display') }
            })
        );
        fields = [
            ...fields,
            {
                id: 'min_scale',
                help: msg('min_scale_help'),
                component: (
                    <Select showSearch style={{ width: 100 }}>
                        {scale.map(v => (
                            <Option key={v} value={v}>
                                {v}
                            </Option>
                        ))}
                    </Select>
                ),
                initialValue: defaults['min_scale']
            },
            {
                id: 'max_scale',
                help: msg('max_scale_help'),
                component: (
                    <Select showSearch style={{ width: 100 }}>
                        {scale.map(v => (
                            <Option key={v} value={v}>
                                {v}
                            </Option>
                        ))}
                    </Select>
                ),
                initialValue: defaults['max_scale']
            },
            {
                id: 'transparency',
                help: msg('transparency_help'),
                component: <Input style={{ width: 100 }} suffix="%" />,
                initialValue: defaults['transparency']
            },
            {
                id: 'render_order',
                help: msg('render_order_help'),
                component: (
                    <Select
                        showSearch
                        style={{ width: 100 }}
                        disabled={store.layerStore.current.category === 'basemap'}
                    >
                        {renderOrder.map(order => (
                            <Option key={order} value={order}>
                                {order}
                            </Option>
                        ))}
                    </Select>
                ),
                initialValue: defaults['render_order']
            },
            {
                id: 'control_item_class',
                help: msg('control_item_class_help'),
                component: <Input />
            },
            {
                id: 'thumbnail',
                help: msg('thumbnail_help'),
                component: <Input />
            },
            {
                id: 'attribution',
                help: msg('attribution_help'),
                component: <Input />
            }
        ];

        return (
            <FormBuilder
                msg={msg}
                form={formRef}
                fields={fields}
                formItemLayout={layout}
                data={data}
                onValuesChange={this.onValuesChange}
            />
        );
    }

    onCategoryChange = value => {
        this.props.data['category'] = value;
        this.forceUpdate();
    };
    onDSChange = value => {
        this.props.data['datasource'] = value;
        this.forceUpdate();
    };

    onSpecFieldChange = (value, specField) => {
        this.props.data.spec[specField] = value;
        this.forceUpdate();
    };

    onValuesChange = (changedValues, allValues) => {
        const { store } = this.props;
        if (changedValues.datasource) {
            const dsName = changedValues.datasource;
            let dsDef = { ...store.datasourceStore.store[dsName] };
            const dsType = dsDef?.type;
            allValues.spec = store.layerStore.defaultValuesFor(dsType, dsName, store).spec;
            allValues.feature_types = [];
        }
        //If esriMap change, deselect all features
        else if (changedValues['spec.esriMap']) {
            const data = { ...this.props.data };
            data.feature_types = [];
            store.layerStore.modifyCurrent(data);
        }
        store.layerStore.modifyCurrent(allValues);
    };
}
