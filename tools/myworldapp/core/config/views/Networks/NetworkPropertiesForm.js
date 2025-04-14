import React, { Component } from 'react';
import { Input, Select, Checkbox } from 'antd';
import { FormBuilder, Validators } from '../../shared';
import { MultiLanguageInput } from '../../shared/FieldEditors';
const { TextArea } = Input;
const { Option } = Select;

export class NetworkPropetiesForm extends Component {
    render() {
        const { formRef, msg, edit, data } = this.props;

        const fields = [
            {
                id: 'name',
                tooltip: msg('name_help'),
                component: <Input disabled={edit} />,
                rules: [{ required: true }, { validator: Validators.internalName, msg }]
            },
            {
                id: 'external_name',
                tooltip: msg('external_name_help'),
                component: <MultiLanguageInput style={{ width: 300 }} className={'external_name'} />
            },
            {
                id: 'description',
                tooltip: msg('description_help'),
                component: <TextArea rows={5} />
            },
            {
                id: 'topology',
                tooltip: msg('topology_help'),
                component: (
                    <Select className="input-small">
                        <Option value="tree">{msg('tree')}</Option>
                        <Option value="mesh">{msg('mesh')}</Option>
                    </Select>
                ),
                rules: [{ required: true }]
            },
            {
                id: 'directed',
                tooltip: msg('directed_help'),
                component: <Checkbox />,
                valuePropName: 'checked'
            },
            {
                id: 'engine',
                tooltip: msg('engine_help'),
                component: <Input />
            }
        ];

        const formItemLayout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 }
        };

        return (
            <FormBuilder
                msg={msg}
                form={formRef}
                fields={fields}
                formItemLayout={formItemLayout}
                data={data}
            />
        );
    }
}
