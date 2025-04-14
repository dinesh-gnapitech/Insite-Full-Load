import React, { useState } from 'react';
import { Form, Card, Button, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { observer } from 'mobx-react';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { ScrollableView, LanguageSelect } from '../../../shared';
import { useStore } from '../../../shared/Hooks/useStore';

export const ExtractFormView = observer(props => {
    const { allStores } = useStore();
    const location = useLocation();
    const match = useRouteMatch();
    const history = useHistory();
    const [updated] = useState(false);

    const [formRef] = Form.useForm();

    message.config({
        maxCount: 1
    });

    const { msg, edit, storeName, form, resourceName, showLangSelect, tabName } = props;

    const currentStore = allStores[storeName];

    //----------------------------Helper methods-----------------------------

    const goBackToList = () => {
        const regex = /\/\w+\//gi;
        const path = tabName
            ? `${regex.exec(location.pathname)[0]}${tabName}`
            : `${regex.exec(location.pathname)[0]}`;
        history.push(path);
    };

    //----------------------------JSX-----------------------------

    let data = currentStore.current;
    if (edit) {
        data = currentStore.store[match.params.id];
    }

    let controls = <div></div>;
    if (edit) {
        controls = (
            <Button icon={<CloseOutlined />} onClick={goBackToList}>
                {updated ? msg('close_btn') : msg('cancel_btn')}
            </Button>
        );
    }

    const nameField = currentStore.nameField || 'name';
    const title = edit
        ? `${resourceName}: ${data?.[nameField]}`
        : `${msg('create_new_obj_title', { objName: resourceName })}`;

    return (
        <Form.Provider onFormFinish={(name, { values, forms }) => {}}>
            <Card
                title={<span className="list-title">{title}</span>}
                extra={showLangSelect && <LanguageSelect />}
                bordered={false}
                className="myw-form-page"
            >
                <ScrollableView topOffset={195} bottomOffset={14}>
                    {React.createElement(form, {
                        formRef,
                        data,
                        edit: edit || false
                    })}
                </ScrollableView>
            </Card>
            <div className="myw-bottom-btns" style={{ marginTop: 10 }}>
                {controls}
            </div>
        </Form.Provider>
    );
});
