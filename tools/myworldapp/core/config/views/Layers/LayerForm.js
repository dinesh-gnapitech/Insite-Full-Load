import React, { useEffect, useState } from 'react';
import { Card, Tabs, Button, Form, message } from 'antd';
import { observer } from 'mobx-react';
import { useHistory, useLocation, useRouteMatch } from 'react-router-dom';
import { datasourceTypes } from 'myWorld/datasources';
import { ScrollableView, ErrorMsg, DeleteButton, LanguageSelect, utils } from '../../shared';
import { LayerPropertiesForm } from './LayerPropertiesForm';
import { LayerFeaturesForm } from './LayerFeaturesForm';
import { CodeInput } from './CodeInput';
import {
    CloseOutlined,
    CopyOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
    SaveOutlined
} from '@ant-design/icons';
import { useLocale } from '../../shared/Hooks/useLocale';
import { useStore } from '../../shared/Hooks/useStore';

//Functional Component for creating/editing a Layer, including Properties and Features tabs
export const LayerForm = observer(props => {
    const msg = useLocale('layers');
    const { allStores, permissionStore, layerStore, myWorldStore, datasourceStore } = useStore();
    const location = useLocation();
    const match = useRouteMatch();
    const history = useHistory();
    //  canSaveObject: false,
    // canDeleteObject: false,
    const [hasManagePerm, setHasManagePerm] = useState(false);
    const [currentObj, setCurrentObj] = useState();
    const [hideUnselected, setHideUnselected] = useState(true);
    const [updated, setUpdated] = useState(false);
    const [activeTab, setActiveTab] = useState('properties');

    const [formRef] = Form.useForm();

    message.config({
        maxCount: 1
    });
    const { edit, resource, tabName } = props;
    const currentStore = layerStore;
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
            if (edit) {
                const currentObj = await layerStore.get(match.params.id);
                await layerStore.setCurrent(match.params.id);
                setCurrentObj(currentObj);
            } else if (!currentStore.current.isDuplicate) {
                await layerStore.setCurrent(null);
                await setHideUnselected(false);
                setDefaultData();
            }
            await Promise.all([myWorldStore.getLayerFeatureItems(), datasourceStore.getAll()]);
        }
        fetchData();
    }, [match.params.id]);

    // Reset the current layer in store when user leaving the page
    // when processing duplicate, will not trigger clean up function
    // although the url is changed but still using this component.
    useEffect(() => {
        return () => {
            //Since the current layer is used to keep track of all the updates,
            // 'cancel' and 'go back' actions should remove the current layer from the store
            layerStore.setCurrent(null);
        };
    }, []);
    //----------------------------Helper methods-----------------------------

    const handleSave = () => {
        formRef.submit();
    };

    const onFinish = async values => {
        //merge form values into record info from store
        const layerRec = layerStore.current;
        values = { ...layerRec, ...values };

        // remove duplicate flag before submit to server
        delete values['isDuplicate'];

        if (values.code) {
            //If not unique show an error message
            const isUnique = CodeInput.isCodeUnique(
                values.code,
                layerStore.store,
                layerStore.current
            );
            if (!isUnique) {
                message.error(msg('code_already_used', { code: values.code }));
                return;
            }
        }
        if (edit) {
            await layerStore
                .update(match.params.id, values)
                .then(async () => {
                    message.success(msg('saved'));
                    setUpdated(true);
                })
                .catch(error => {
                    utils.showErrorMsg(error, message.error(ErrorMsg.getMsgFor(error, edit, msg)));
                });
        } else {
            if (!values.code)
                values.code = CodeInput.generateLayerCode(values.name, layerStore.store);
            await layerStore
                .save(values)
                .then(async id => {
                    message.success(msg('created'));
                    const currentObj = await layerStore.get(id);
                    setCurrentObj(currentObj);

                    history.push(`/${resource}/${id}/edit`);
                    setUpdated(true);
                })
                .catch(error => {
                    utils.showErrorMsg(
                        error,
                        ErrorMsg.getMsgFor(error, edit, msg, 'Layer', values.name)
                    );
                });
        }
    };

    // set default data when adding new layer
    const setDefaultData = () => {
        const { current } = layerStore;
        const defaultData = { ...layerStore.defaults };
        if (!current.spec) {
            defaultData.spec = layerStore.defaultValuesFor('myworld', 'myworld', allStores).spec;
        }
        layerStore.modifyCurrent(defaultData);
    };

    /**
     * Store a copy in the store and redirect to the new form view
     */
    const handleDuplication = () => {
        currentStore.duplicate(match.params.id);
        const regex = /\/\w+\//gi;
        const path = `${regex.exec(location.pathname)[0]}new`;
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
    const propertiesData = layerStore.current;

    let dsDef = { ...datasourceStore.store[propertiesData.datasource] };
    let dsType = dsDef?.type;
    if (!edit && !dsDef.type) {
        dsType = 'myworld';
    }

    const showFeaturesTab = datasourceTypes[dsType]?.supportsFeatureDefs;

    const title = edit
        ? `${msg('layer')}: ${propertiesData.name}`
        : `${msg('create_new_obj_title', { objName: msg('layer') })}`;

    //Adding a key to the feature form makes react create a new component instance as and when they key changes
    //We need a new instance so its state can be recalculated.
    const featureFormKey = propertiesData.spec?.rendering
        ? `${propertiesData.spec.rendering}:${propertiesData.spec.nativeAppVector}`
        : propertiesData.datasource;

    const tabItems = [
        {
            label: msg('properties'),
            key: 'properties',
            children: (
                <ScrollableView topOffset={240} bottomOffset={10}>
                    <LayerPropertiesForm
                        store={allStores}
                        data={propertiesData}
                        formRef={formRef}
                        edit={edit}
                        onFinish={handleSave}
                        // onMount={comp => (this.form = comp.props.formRef)}
                    />
                </ScrollableView>
            )
        }
    ];

    if (showFeaturesTab)
        tabItems.push({
            label: msg('features'),
            key: 'features',
            children: (
                <LayerFeaturesForm
                    key={featureFormKey}
                    edit={edit}
                    hideUnselected={hideUnselected}
                    dsDef={dsDef}
                    data={propertiesData}
                    formRef={formRef}
                />
            )
        });

    return (
        <Form.Provider
            onFormFinish={(name, { values, forms }) => {
                onFinish(values);
            }}
        >
            <Card
                className="card-with-tabs"
                title={<span className="list-title">{title}</span>}
                extra={<LanguageSelect />}
                bordered={false}
            >
                <Tabs
                    animated={false}
                    activeKey={activeTab}
                    onChange={activeTab => {
                        setActiveTab(activeTab);
                    }}
                    items={tabItems}
                />

                <div className="myw-bottom-btns">
                    {activeTab === 'features' && (
                        <Button
                            icon={hideUnselected ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            onClick={() => setHideUnselected(!hideUnselected)}
                            type="primary"
                        >
                            {hideUnselected ? msg('show_all_btn') : msg('show_selected_btn')}
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
                            <DeleteButton
                                currentObj={currentObj}
                                disabled={!hasManagePerm}
                                goBackToList={goBackToList}
                                id={match.params.id}
                                msg={msg}
                                store={allStores}
                                storeName={'layerStore'}
                            />
                        </>
                    )}
                    &nbsp;
                    <Button icon={<CloseOutlined />} onClick={goBackToList}>
                        {updated ? msg('close_btn') : msg('cancel_btn')}
                    </Button>
                </div>
            </Card>
        </Form.Provider>
    );
});
