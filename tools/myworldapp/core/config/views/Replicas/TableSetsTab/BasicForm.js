import React, { Component } from 'react';
import { Input } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise, Validators } from '../../../shared';
const { TextArea } = Input;

//network new/edit page, including both Properties and Features tabs
//this components fetches the data and passes it to the actual from

@inject('store')
@localise('replicas')
@observer
export class BasicForm extends Component {
    render() {
        const { form, msg, edit, data } = this.props;

        const fields = [
            {
                id: 'name',
                component: <Input disabled={edit} />,
                rules: [{ required: true }, { validator: Validators.internalName, msg }]
            },
            {
                id: 'description',
                component: <TextArea rows={2} />
            }
        ];

        const formItemLayout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 }
        };

        return (
            <FormBuilder
                msg={msg}
                form={form}
                fields={fields}
                formItemLayout={formItemLayout}
                data={data}
            />
        );
    }
}
