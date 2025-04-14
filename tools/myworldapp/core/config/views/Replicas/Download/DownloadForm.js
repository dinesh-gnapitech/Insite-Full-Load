import React, { Component } from 'react';
import { Input, Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise, DateTimePicker } from '../../../shared';
import { DownloadRolesList } from './DownloadRolesList';

@inject('store')
@localise('replicas')
@observer
export class DownloadForm extends Component {
    render() {
        const { formRef, data, msg } = this.props;

        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'name',
                label: msg('extract_name'),
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
                id: 'writable_by_default',
                component: <Checkbox />,
                valuePropName: 'checked',
                help: msg('writable_by_default_help')
            },
            {
                id: 'expiry_time',
                component: <DateTimePicker />,
                help: msg('expiry_time_help')
            },
            {
                id: 'folder_name',
                component: <Input />,
                help: msg('folder_name_help')
            },
            {
                id: 'roles',
                help: msg('roles_help'),
                initialValue: [],
                component: (
                    <DownloadRolesList
                        onAllFieldChange={this.onAllFieldChange}
                        roles={this.props.store.roleStore.filter('')}
                        disabledRoles={formRef?.current?.getFieldValue('god_roles') || []}
                        valProp="name"
                    />
                )
            }
        ];

        let displayData = {};
        if (data) {
            Object.entries(data).forEach(([field, value]) => {
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

    onAllFieldChange = e => {
        this.props.formRef.setFieldsValue({ roles: e.target.checked ? ['all'] : [] });
    };
}
