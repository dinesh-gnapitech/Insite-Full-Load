import React, { Component } from 'react';
import { Input } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise } from '../../../shared';
import { ExtractCheckboxList } from './ExtractCheckboxList';

const nameComp = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
@inject('store')
@localise('replicas')
@observer
export class RoleForm extends Component {
    render() {
        const { formRef, msg, store, data } = this.props;

        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'name',
                label: msg('role_name'),
                component: <Input disabled={true} />
            },
            {
                id: 'extracts',
                initialValue: [],
                component: (
                    <ExtractCheckboxList
                        options={Object.values(store.extractStore.store)
                            .sort(nameComp)
                            .map(item => {
                                return { label: item.name, value: item.name };
                            })}
                        extractsForAll={store.extractRoleStore.extractsForAll}
                        itemRepresents="replicas/downloads/extract"
                        onAllFieldChange={this.onAllFieldChange}
                    />
                )
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

    onAllFieldChange = e => {
        const { formRef } = this.props;
        if (e.target.checked) {
            formRef.setFieldsValue({ extracts: ['all'] });
        } else {
            formRef.setFieldsValue({ extracts: [] });
        }
    };
}
