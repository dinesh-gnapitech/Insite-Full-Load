import React, { useEffect, useState } from 'react';
import { Form, Card, Button, message } from 'antd';
import { SaveOutlined, CopyOutlined, CloseOutlined } from '@ant-design/icons';
import { observer } from 'mobx-react';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { ScrollableView, ErrorMsg, DeleteButton, LanguageSelect } from './';
import { useStore } from './Hooks/useStore';
import { utils } from './';

export const CommonFormView = observer(props => {
    const { allStores, permissionStore } = useStore();
    const location = useLocation();
    const match = useRouteMatch();
    const history = useHistory();

    const [hasManagePerm, setHasManagePerm] = useState(false);
    const [currentObj, setCurrentObj] = useState();
    const [updated, setUpdated] = useState(false);

    const [formRef] = Form.useForm();

    message.config({
        maxCount: 1
    });

    const {
        msg,
        edit,
        storeName,
        form,
        resource,
        resourceName,
        showLangSelect,
        tabName,
        checkDuplicate,
        showDuplicateBtn = true,
        showDeleteBtn = true
    } = props;

    const currentStore = allStores[storeName];

    //----------------------------Side effects-----------------------------

    //Save on ctrl+s
    useEffect(() => {
        async function onKeyDown(event) {
            let charCode = String.fromCharCode(event.which).toLowerCase();
            // hand save on ctrl+S, for MAC we can use metaKey to detect cmd key
            if ((event.ctrlKey && charCode === 's') || (event.metaKey && charCode === 's')) {
                event.preventDefault();
                handleSave();
            }
        }
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    //Get permissions
    useEffect(() => {
        async function fetchPerm() {
            const hasPerm = await permissionStore.userHasPermission(resource);
            setHasManagePerm(hasPerm);
        }
        fetchPerm();
    }, [resource]);

    //Fetches data for the form
    useEffect(() => {
        async function fetchData() {
            const currentObj = await allStores[storeName].get(match.params.id);
            setCurrentObj(currentObj);
        }
        if (edit) fetchData();
    }, [match.params.id]);

    //----------------------------Helper methods-----------------------------

    const handleSave = () => {
        if (formRef.current) formRef.current.submit();
        else formRef.submit();
    };

    const onFinish = async values => {
        const checkDuplicateValue = values[checkDuplicate] || values.name;
        if (edit) {
            currentStore
                .update(match.params.id, values)
                .then(async () => {
                    message.success(msg('saved'));
                    await currentStore.get(match.params.id);
                    setUpdated(true);
                })
                .catch(error => {
                    utils.showErrorMsg(
                        error,
                        ErrorMsg.getMsgFor(error, edit, msg, resourceName, checkDuplicateValue)
                    );
                });
            return;
        }
        currentStore
            .save(values)
            .then(async id => {
                message.success(`${msg('created')}`);
                await currentStore.get(id);
                history.push(`/${resource}/${id}/edit`);
                setUpdated(true);
            })
            .catch(error => {
                utils.showErrorMsg(
                    error,
                    ErrorMsg.getMsgFor(error, edit, msg, resourceName, checkDuplicateValue)
                );
            });
    };

    /**
     * Store a copy in the store and redirect to the new form view
     */
    const handleDuplication = () => {
        currentStore.duplicate(match.params.id);
        const regex = /\/\w+\//gi;
        const path = tabName
            ? `${regex.exec(location.pathname)[0]}${tabName}/new`
            : `${regex.exec(location.pathname)[0]}new`;
        history.push(path);
    };

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
            <>
                <Button
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    type="primary"
                    htmlType="submit"
                    disabled={!hasManagePerm}
                >
                    {msg('save_btn')}
                </Button>
                &nbsp;
                {(() => {
                    if (showDuplicateBtn) {
                        return (
                            <Button
                                icon={<CopyOutlined />}
                                onClick={handleDuplication}
                                disabled={!hasManagePerm}
                            >
                                {msg('duplicate_btn')}
                            </Button>
                        );
                    }
                })()}
                &nbsp;
                {(() => {
                    if (showDeleteBtn) {
                        return (
                            <DeleteButton
                                currentObj={currentObj}
                                disabled={!hasManagePerm}
                                goBackToList={goBackToList}
                                id={match.params.id}
                                msg={msg}
                                store={allStores}
                                storeName={storeName}
                            />
                        );
                    }
                })()}
                &nbsp;
                <Button icon={<CloseOutlined />} onClick={goBackToList}>
                    {updated ? msg('close_btn') : msg('cancel_btn')}
                </Button>
            </>
        );
    } else {
        controls = (
            <>
                <Button icon={<SaveOutlined />} onClick={handleSave} type="primary">
                    {msg('save_btn')}
                </Button>
                &nbsp;
                <Button icon={<CloseOutlined />} onClick={history.goBack}>
                    {updated ? msg('close_btn') : msg('cancel_btn')}
                </Button>
            </>
        );
    }

    const nameField = currentStore.nameField || 'name';
    const title = edit
        ? `${resourceName}: ${data?.[nameField]}`
        : `${msg('create_new_obj_title', { objName: resourceName })}`;

    return (
        <Form.Provider
            onFormFinish={(name, { values, forms }) => {
                onFinish(values);
            }}
        >
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
