import React, { Component } from 'react';
import { Input } from 'antd';
import { inject, observer } from 'mobx-react';
import { FormBuilder, localise } from '../../shared';
import { PermissionSelector } from './PermissionSelector';
const { TextArea } = Input;

@inject('store')
@localise('roles')
@observer
export class RoleForm extends Component {
    constructor(props) {
        super(props);

        this.state = {
            showLink: false
        };
    }
    async componentDidMount() {
        const { store } = this.props;
        await store.applicationStore.getAll();
        await store.rightStore.getAll();
        const showLink = await store.permissionStore.userCurrentlyHasPermission('applications');
        this.setState({ showLink });
    }

    render() {
        const { formRef, msg, store, data } = this.props;
        const { showLink } = this.state;
        const applications = store.applicationStore.store;
        const rights = store.rightStore.store;

        const fields = [
            {
                id: 'name',
                component: <Input disabled={this.props.edit} />,
                rules: [{ required: true }]
            },
            {
                id: 'description',
                component: <TextArea rows={2} />,
                initialValue: ''
            },
            {
                id: 'permissions',
                component: (
                    <PermissionSelector
                        applications={applications}
                        rights={rights}
                        msg={msg}
                        showLink={showLink}
                    />
                ),
                rules: [],
                initialValue: []
            }
        ];

        return <FormBuilder msg={msg} form={formRef} fields={fields} data={data} />;
    }
}
