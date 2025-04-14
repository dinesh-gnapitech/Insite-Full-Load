import React, { Component } from 'react';
import { Input, Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise, MultiLanguageInput } from '../../shared';
import { LayerGroupLayerList } from './LayerGroupLayerList';
import { AvailableLayers } from './AvailableLayers';

@inject('store')
@localise('layergroups')
@observer
export class LayerGroupForm extends Component {
    componentDidMount() {
        this.props.store.layerStore.getAll();
    }

    render() {
        const { formRef, msg, store, data } = this.props;

        const formItemLayout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'name',
                component: <Input />,
                rules: [{ required: true }]
            },
            {
                id: 'display_name',
                component: <MultiLanguageInput style={{ width: 300 }} />
            },
            {
                id: 'description',
                initialValue: '',
                component: <MultiLanguageInput rows={5} style={{ width: 500 }} />
            },
            {
                id: 'thumbnail',
                initialValue: '',
                component: <Input />
            },
            {
                id: 'exclusive',
                valuePropName: 'checked',
                initialValue: false,
                component: <Checkbox />
            },
            {
                id: 'layers',
                initialValue: [],
                component: <LayerGroupLayerList onLayerChange={this.update} />,
                type: 'number'
            }
        ];

        const usedLayers = formRef?.current?.getFieldValue('layers') || data?.layers;
        const layers = Object.values(store.layerStore.store);
        return (
            <div style={{ position: 'relative' }}>
                <FormBuilder
                    msg={msg}
                    form={formRef}
                    data={data}
                    fields={fields}
                    formItemLayout={formItemLayout}
                />
                <AvailableLayers layers={layers} usedLayers={usedLayers} />
            </div>
        );
    }

    update = () => {
        this.forceUpdate();
    };
}
