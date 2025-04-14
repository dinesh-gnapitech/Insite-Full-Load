import React, { useEffect, useState } from 'react';
import { Form, message, Card, Tabs, Button } from 'antd';
import { observer } from 'mobx-react';
import { useHistory, useRouteMatch } from 'react-router-dom';
import { ErrorMsg, DeleteButton, utils } from '../../../shared';
import { useLocale } from '../../../shared/Hooks/useLocale';
import { useStore } from '../../../shared/Hooks/useStore';
import { BasicForm } from './BasicForm';
import { LayersForm } from './LayersForm';
import { TilesTable } from './TilesTable';
import {
    CloseOutlined,
    CopyOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    SaveOutlined
} from '@ant-design/icons';

//form in Basic tab of Network new/edit page
export const TableSetPage = observer(props => {
    const msg = useLocale('replicas');
    const { allStores, permissionStore, tableSetStore } = useStore();
    const match = useRouteMatch();
    const history = useHistory();

    const [hasManagePerm, setHasManagePerm] = useState(false);
    const [hideUnselectedLayers, setHideUnselectedLayers] = useState(props.edit);
    const [hideUnselectedTiles, setHideUnselectedTiles] = useState(props.edit);
    const [updated, setUpdated] = useState(false);
    const [activeTab, setActiveTab] = useState('basic');

    const [formRef] = Form.useForm();

    message.config({
        maxCount: 1
    });

    const { edit, resource, resourceName } = props;

    const currentStore = tableSetStore;

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
            await tableSetStore.get(match.params.name);
            // setCurrentObj(currentObj);
        }
        if (edit) fetchData();
    }, [match.params.name]);

    //----------------------------Helper methods-----------------------------

    const handleSave = () => {
        tableSetStore.resetCurrent(); // Removes the isDuplicate flag
        formRef.submit();
    };

    const onFinish = async values => {
        const { current } = currentStore;
        //merge form values into record info from store
        values = { ...current, ...values };
        if (edit) {
            currentStore
                .update(match.params.name, values)
                .then(() => {
                    message.success(msg('saved'));
                    //await currentStore.get(match.params.name);
                    setUpdated(true);
                })
                .catch(error => {
                    const errorMsg = ErrorMsg.getMsgFor(error, edit, msg);
                    utils.showErrorMsg(error, errorMsg);
                });
            return;
        }
        currentStore
            .save(values)
            .then(id => {
                message.success(`${msg('created')}`);
                //await currentStore.get(id);
                //next line stops bug where saving a new tableset then immediately going back causes the code to fail
                history.replace({ pathname: '/replicas/tableSets' });
                history.push(`/replicas/tableSets/${id}/edit`);
                setUpdated(true);
            })
            .catch(error => {
                const errorMsg = ErrorMsg.getMsgFor(error, edit, msg, resourceName, current.name);
                utils.showErrorMsg(error, errorMsg);
            });
    };

    /**
     * Store a copy in the store and redirect to the new form view
     */
    const handleDuplication = () => {
        tableSetStore.duplicate(match.params.name);
        history.push('/replicas/tableSets/new');
    };

    const handleDelete = () => {
        tableSetStore.delete(match.params.name);
    };

    const goBackToList = () => {
        history.goBack();
    };

    const handleCancel = () => {
        tableSetStore.resetCurrent();
        history.push('/replicas/tableSets');
    };

    //----------------------------JSX-----------------------------

    let data = tableSetStore.current || {};

    const nameField = tableSetStore.nameField || 'name';
    const title = edit
        ? `${resourceName}: ${data?.[nameField]}`
        : `${msg('create_new_obj_title', { objName: resourceName })}`;

    const tabItems = [
        {
            label: msg('basic'),
            key: 'basic',
            children: <BasicForm edit={edit} msg={msg} form={formRef} data={data} />
        },
        {
            label: msg('layers'),
            key: 'layers',
            children: (
                <LayersForm
                    form={formRef}
                    msg={msg}
                    selectedLayers={data.layers || {}}
                    options={{
                        msg: msg,
                        edit: edit,
                        hideUnselectedLayers: hideUnselectedLayers
                    }}
                />
            )
        },
        {
            label: msg('tiles'),
            key: 'tiles',
            children: (
                <TilesTable
                    edit={edit}
                    selectedTiles={data.tile_files || {}}
                    hideUnselectedTiles={hideUnselectedTiles}
                    msg={msg}
                />
            )
        }
    ];
    return (
        <Form.Provider
            onFormFinish={(name, { values, forms }) => {
                onFinish(values);
            }}
        >
            <Card title={<span className="list-title"> {title}</span>} bordered={false}>
                <Tabs
                    activeKey={activeTab}
                    animated={false}
                    onChange={activeTab => {
                        setActiveTab(activeTab);
                    }}
                    items={tabItems}
                />

                <div className="myw-bottom-btns">
                    {activeTab === 'layers' && (
                        <Button
                            icon={hideUnselectedLayers ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            onClick={() => setHideUnselectedLayers(!hideUnselectedLayers)}
                            type="primary"
                        >
                            {hideUnselectedLayers ? msg('show_all_btn') : msg('show_selected_btn')}
                        </Button>
                    )}
                    &nbsp;
                    {activeTab === 'tiles' && (
                        <Button
                            icon={hideUnselectedTiles ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            onClick={() => setHideUnselectedTiles(!hideUnselectedTiles)}
                            type="primary"
                        >
                            {hideUnselectedTiles ? msg('show_all_btn') : msg('show_selected_btn')}
                        </Button>
                    )}
                    &nbsp;
                    <Button
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        type="primary"
                        disabled={!hasManagePerm}
                    >
                        {msg('save_btn')}
                    </Button>
                    &nbsp;
                    {edit && (
                        <>
                            <Button
                                icon={<CopyOutlined />}
                                onClick={handleDuplication}
                                disabled={!hasManagePerm}
                            >
                                {msg('duplicate_btn')}
                            </Button>
                            &nbsp;
                            <DeleteButton
                                currentObj={tableSetStore.current}
                                disabled={!hasManagePerm}
                                goBackToList={goBackToList}
                                msg={msg}
                                store={allStores}
                                storeName={'tableSetStore'}
                                onDelete={handleDelete}
                            />
                        </>
                    )}
                    &nbsp;
                    <Button icon={<CloseOutlined />} onClick={handleCancel}>
                        {updated ? msg('close_btn') : msg('cancel_btn')}
                    </Button>
                </div>
            </Card>
        </Form.Provider>
    );
});
