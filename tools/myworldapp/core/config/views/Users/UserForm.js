import React, { useEffect } from 'react';
import { Input, Checkbox } from 'antd';
import { observer } from 'mobx-react';
import { FormBuilder, RolesList } from '../../shared';
import { useStore } from '../../shared/Hooks/useStore';
import { useLocale } from '../../shared/Hooks/useLocale';

export const UserForm = observer(props => {
    const { roleStore } = useStore();
    const msg = useLocale('users');

    const { data, edit, formRef } = props;
    useEffect(() => {
        if (!roleStore.loadedAll) roleStore.getAll();
    }, []);

    const formItemLayout = {
        labelCol: { span: 4 },
        wrapperCol: { span: 10 }
    };
    const passwordToDisplay = edit ? 'xxxxxx' : '';

    const fields = [
        {
            id: 'username',
            component: <Input disabled={edit} />,
            rules: [{ required: true }]
        },
        {
            id: 'email',
            initialValue: '',
            component: <Input />
        },
        {
            id: 'password',
            rules: [{ required: !edit }],
            component: <Input type="password" className="input-small" />,
            initialValue: passwordToDisplay
        },
        {
            id: 'roles',
            initialValue: [],
            component: <RolesList roles={roleStore.filter('')} msg={msg} valProp="id" />
        },
        {
            id: 'locked_out',
            initialValue: false,
            valuePropName: 'checked',
            component: <Checkbox />
        }
    ];

    return (
        <FormBuilder
            msg={msg}
            fields={fields}
            formItemLayout={formItemLayout}
            data={data}
            form={formRef}
        />
    );
});
