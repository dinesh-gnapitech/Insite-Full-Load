import React, { Component } from 'react';
import { Input } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise, Validators, KeyValueView } from '../../shared';

const valuesValidator = async (options, value, cb) => {
    const msg = options.msg;
    if (!value) throw new Error(msg('enter_at_least_one'));
};

@inject('store')
@localise('enumerators')
@observer
export class PickListForm extends Component {
    render() {
        const { edit } = this.props;
        const { formRef, msg, data } = this.props;

        const formItemLayout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'name',
                component: <Input disabled={edit} />,
                rules: [{ required: true }, { validator: Validators.internalName, msg }]
            },
            {
                id: 'description',
                component: <Input />,
                initialValue: null
            },
            {
                id: 'values',
                component: (
                    <KeyValueView
                        args={{
                            keyTitle: msg('name'),
                            valueTitle: msg('display_name'),
                            isArray: true,
                            keyProp: 'value',
                            valueProp: 'display_value'
                        }}
                        blankAllowed={true}
                        key={this.props.name}
                        isValueMultiLang={true}
                    />
                ),
                rules: [{ msg, validator: (...args) => valuesValidator(...args) }]
            }
        ];
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
