import React, { useEffect, useState } from 'react';
import { Form, message, Tabs, Button, Card } from 'antd';
import { observer } from 'mobx-react';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { ScrollableView, ErrorMsg, DeleteButton, LanguageSelect, utils } from '../../shared';
import { NetworkPropetiesForm } from './NetworkPropertiesForm';
import { NetworkFeaturesForm } from './NetworkFeaturesForm';
import {
    CloseOutlined,
    CopyOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    SaveOutlined
} from '@ant-design/icons';
import { useLocale } from '../../shared/Hooks/useLocale';
import { useStore } from '../../shared/Hooks/useStore';

//form in Properties tab of Network new/edit page
export const NetworkForm = observer(props => {
    const msg = useLocale('networks');
    const { allStores, permissionStore, networkStore } = useStore();
    const location = useLocation();
    const match = useRouteMatch();
    const history = useHistory();

    const [hasManagePerm, setHasManagePerm] = useState(false);
    const [currentObj, setCurrentObj] = useState();
    const [hideUnselected, setHideUnselected] = useState(props.edit);
    const [updated, setUpdated] = useState(false);
    const [activeTab, setActiveTab] = useState('properties');

    const [formRef] = Form.useForm();

    message.config({
        maxCount: 1
    });

    const { edit, resource, resourceName, tabName, checkDuplicate } = props;

    const currentStore = networkStore;

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
            const currentObj = await networkStore.get(match.params.id);
            setCurrentObj(currentObj);
        }
        if (edit) fetchData();
    }, [match.params.id]);

    //----------------------------Helper methods-----------------------------

    const handleSave = () => {
        formRef.submit();
    };

    const onFinish = async values => {
        //merge form values into record info from store
        const record = currentStore.current;
        values = { ...record, ...values };
        if (edit) {
            currentStore
                .update(match.params.id, values)
                .then(async () => {
                    message.success(msg('saved'));
                    await currentStore.get(match.params.id);
                    setUpdated(true);
                })
                .catch(error => {
                    const checkDuplicateValue = values[checkDuplicate] || values.name;
                    const errorMsg = message.error(
                        ErrorMsg.getMsgFor(error, edit, msg, resourceName, checkDuplicateValue)
                    );
                    utils.showErrorMsg(error, errorMsg);
                });
            return;
        }
        currentStore
            .save(values)
            .then(async id => {
                message.success(`${msg('created')}`);
                await currentStore.get(id);
                history.push(`/networks/${id}/edit`);
                setUpdated(true);
            })
            .catch(error => {
                utils.showErrorMsg(
                    error,
                    message.error(ErrorMsg.getMsgFor(error, edit, msg, 'Network', values.name))
                );
            });
    };

    /**
     * Store a copy in the store and redirect to the new form view
     */
    const handleDuplication = () => {
        networkStore.duplicate(match.params.id);
        history.push('/networks/new');
    };

    const goBackToList = () => {
        const regex = /\/\w+\//gi;
        const path = tabName
            ? `${regex.exec(location.pathname)[0]}${tabName}`
            : `${regex.exec(location.pathname)[0]}`;
        history.push(path);
    };

    //----------------------------JSX-----------------------------
    let controls = <div></div>;
    if (edit) {
        controls = (
            <>
                {activeTab === 'features' && (
                    <>
                        <Button
                            icon={hideUnselected ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            onClick={() => setHideUnselected(!hideUnselected)}
                            type="primary"
                        >
                            {hideUnselected ? msg('show_all_btn') : msg('show_selected_btn')}
                        </Button>
                        &nbsp;
                    </>
                )}
                <Button
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    type="primary"
                    disabled={!hasManagePerm}
                >
                    {msg('save_btn')}
                </Button>
                &nbsp;
                <Button
                    icon={<CopyOutlined />}
                    onClick={handleDuplication}
                    disabled={!hasManagePerm}
                >
                    {msg('duplicate_btn')}
                </Button>
                &nbsp;
                <DeleteButton
                    currentObj={currentObj}
                    disabled={!hasManagePerm}
                    goBackToList={goBackToList}
                    id={match.params.id}
                    msg={msg}
                    store={allStores}
                    storeName={'networkStore'}
                />
                &nbsp;
                <Button icon={<CloseOutlined />} onClick={goBackToList}>
                    {updated ? msg('close_btn') : msg('cancel_btn')}
                </Button>
            </>
        );
    } else {
        controls = (
            <>
                {activeTab === 'features' && (
                    <>
                        <Button
                            icon={hideUnselected ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            onClick={() => setHideUnselected(!hideUnselected)}
                            type="primary"
                        >
                            {hideUnselected ? msg('show_all_btn') : msg('show_selected_btn')}
                        </Button>
                        &nbsp;
                    </>
                )}
                <Button
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    type="primary"
                    disabled={!hasManagePerm}
                >
                    {msg('save_btn')}
                </Button>
                &nbsp;
                <Button icon={<CloseOutlined />} onClick={history.goBack} disabled={!hasManagePerm}>
                    {msg('cancel_btn')}
                </Button>
            </>
        );
    }

    let data = currentStore.current;
    if (edit) {
        data = currentStore.store[match.params.id];
    }

    const title = edit
        ? `${resourceName}: ${networkStore.current.name || data?.name || ''}`
        : `${msg('create_new_obj_title', { objName: resourceName })}`;
    const tabItems = [
        {
            label: msg('properties'),
            key: 'properties',
            children: (
                <ScrollableView topOffset={250}>
                    <NetworkPropetiesForm
                        edit={edit}
                        msg={msg}
                        formRef={formRef}
                        data={data}
                        showLangSelect={true}
                        onFinish={handleSave}
                    />
                </ScrollableView>
            )
        },
        {
            label: msg('features'),
            key: 'features',
            children: (
                <div className="myw-network-scroll-view">
                    <ScrollableView topOffset={250}>
                        <NetworkFeaturesForm
                            msg={msg}
                            formRef={formRef}
                            data={data}
                            hideUnselected={hideUnselected}
                            onFinish={handleSave}
                        />
                    </ScrollableView>
                </div>
            )
        }
    ];
    return (
        <Form.Provider
            onFormFinish={(name, { values, forms }) => {
                onFinish(values);
            }}
        >
            <Card
                className="card-with-tabs"
                extra={<LanguageSelect />}
                title={<span className="list-title">{title}</span>}
                bordered={false}
            >
                <Tabs
                    activeKey={activeTab}
                    animated={false}
                    onChange={activeTab => {
                        setActiveTab(activeTab);
                    }}
                    items={tabItems}
                />
                <div className="myw-bottom-btns">{controls}</div>
            </Card>
        </Form.Provider>
    );
});
