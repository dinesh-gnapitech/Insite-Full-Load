import React, { Component } from 'react';
import { Input, Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { FormBuilder, localise } from '../../../shared';
import myw from 'myWorld-base';

@inject('store')
@localise('replicas')
@withRouter //provides history prop
@observer
export class ExtractForm extends Component {
    async componentDidMount() {
        await this.props.store.extractStore.getAll();
    }

    render() {
        const { formRef, msg, data } = this.props;

        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'name',
                component: <Input disabled={true} />,
                help: msg('name_help')
            },
            {
                id: 'region',
                component: <Input disabled={true} />,
                help: msg('region_help')
            },
            {
                id: 'table_set',
                component: <Input disabled={true} />,
                help: msg('table_set_help')
            },
            {
                id: 'include_deltas',
                component: <Checkbox disabled={true} />,
                valuePropName: 'checked',
                help: msg('include_deltas_help')
            },
            {
                id: 'last_export',
                component: <Input disabled={true} />,
                help: msg('last_export_help')
            },
            {
                id: 'last_export_time',
                component: <Input disabled={true} />,
                help: msg('last_export_time_help')
            }
        ];

        //Modify the data before sending it to the form builder
        let displayData = {};
        if (data) {
            Object.entries(data).forEach(([field, value]) => {
                if (field === 'last_export_time') {
                    value = myw.Util.formatDate(value);
                }
                displayData[field] = value;
            });
        }

        return (
            <FormBuilder
                msg={msg}
                form={formRef}
                fields={fields}
                formItemLayout={formItemLayout}
                data={displayData}
            />
        );
    }
}
