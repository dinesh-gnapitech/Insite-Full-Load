import React, { Component } from 'react';
import { Input, Checkbox, Select, Card } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise, FormattedDateView } from '../../shared';
const { TextArea } = Input;
const Option = Select.Option;

@inject('store')
@localise('notifications')
@observer
export class NotificationForm extends Component {
    componentDidMount() {
        this.props.store.layerStore.getAll();
    }

    render() {
        const { formRef, data, msg } = this.props;

        const formItemLayout = {
            labelCol: { span: 4 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'type',
                component: (
                    <Select className="input-small">
                        <Option value="alert">{msg('alert')}</Option>
                        <Option value="info">{msg('info')}</Option>
                        <Option value="tip">{msg('tip')}</Option>
                    </Select>
                ),
                rules: [{ required: true }],
                initialValue: 'info'
            },
            {
                id: 'subject',
                component: <Input />,
                rules: [{ required: true }]
            },
            {
                id: 'details',
                component: <TextArea rows={5} />
            },
            {
                id: 'for_online_app',
                component: <Checkbox />,
                valuePropName: 'checked',
                initialValue: true
            },
            {
                id: 'for_native_app',
                component: <Checkbox />,
                valuePropName: 'checked',
                initialValue: true
            },
            {
                id: 'created',
                component: <FormattedDateView disabled={true} />
            }
        ];

        return (
            <>
                <FormBuilder
                    msg={msg}
                    form={formRef}
                    data={data}
                    fields={fields}
                    formItemLayout={formItemLayout}
                />
                <div className="queries-info" style={{ padding: '14px' }}>
                    <Card style={{ padding: '24px' }}>
                        <b>{msg('subject_and_details_html_syntax')}: </b>
                        <ul>
                            <li>{msg('html_help1')}</li>

                            <li>{msg('html_help2')}</li>
                        </ul>
                    </Card>
                </div>
            </>
        );
    }
}
