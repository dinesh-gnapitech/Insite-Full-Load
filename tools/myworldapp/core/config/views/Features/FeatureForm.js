import React, { Component } from 'react';
import { Card, Tabs, Button, Form, message } from 'antd';
import { DownloadOutlined, SaveOutlined, CopyOutlined, CloseOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import {
    localise,
    ScrollableView,
    ErrorMsg,
    DeleteButton,
    PopConfirm,
    utils,
    LanguageSelect,
    Validators
} from '../../shared';
import { FeatureBasicForm } from './FeatureBasicForm';
import { FeatureGeomFields, FeatureStoredFields, FeatureCalculatedFields } from './Fields';
import { FeatureFieldGroups } from './FieldGroups';
import { FeatureSearches } from './FeatureSearches';
import { FeatureQueries } from './FeatureQueries';
import { FeatureFilters } from './FeatureFilters';
import { RestClient } from '../../stores/RestClient';
import { CopyToOtherLangsBtn } from './CopyToOtherLangsBtn';
import { datasourceTypes } from 'myWorld/datasources';

//Component for editing a Feature type, including the several tabs
//Note that creation is done via a dialog with just name and geom type and then editing the newly created record
@withRouter //provides history prop
@inject('store') //provides store (RootStore) prop
@localise('features') //provides msg prop
@observer //re-renders on prop or state changes
class FeatureForm extends Component {
    state = {
        hasManagePerm: false,
        canSaveObject: false,
        canDeleteObject: false,
        updated: false,
        tab: ''
    };

    constructor(props) {
        super(props);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.saveButton = React.createRef();

        message.config({
            maxCount: 1
        });
    }

    async componentDidMount() {
        document.addEventListener('keydown', this.onKeyDown);
        const { store, match } = this.props;
        const { dsname, id } = match.params;
        await store.datasourceStore.getAll();
        if (id) {
            const currentObj = await store.ddStore.get(dsname, id); //fetches
            await store.ddStore.setCurrent(dsname, id); //sets as current
            this.setState({ currentObj: currentObj });
        }
        const hasPerm = await store.permissionStore.userHasPermission('features');

        const canSaveObject = !hasPerm ? await this.getConfigPermission() : hasPerm;
        this.setState({
            hasManagePerm: hasPerm,
            canSaveObject: canSaveObject,
            canDeleteObject: hasPerm
        });
    }

    /**
     * Checks if the user has the manageFeatureConfig right and accordingly sets the options.canSaveObject property
     * @return {Promise}  Promise to set the options.canSaveObject property
     */
    async getConfigPermission() {
        return this.props.store.permissionStore.permissionForRight('manageFeatureConfig');
    }

    async componentWillUnmount() {
        document.removeEventListener('keydown', this.onKeyDown);
        //  We need to reset the current feature once we leave this page
        //  Note that if its a duplicate, it crashes, so perform the check here
        const { store } = this.props;
        const currentFeature = store.ddStore.current;
        if (!currentFeature.isDuplicate) {
            await store.ddStore.setCurrent(null, null);
        }
    }

    async onKeyDown(event) {
        let charCode = String.fromCharCode(event.which).toLowerCase();
        // hand save on ctrl+S, for MAC we can use metaKey to detect cmd key
        if ((event.ctrlKey && charCode === 's') || (event.metaKey && charCode === 's')) {
            event.preventDefault();
            // instead of call handleSave(), trigger save button click to consolidate the flow control
            this.saveButton?.current.click();
        }
    }

    render() {
        const { msg, history, store } = this.props;
        const featureDD = this.props.store.ddStore.current;
        if (!featureDD.datasource) return null;
        const { dsname = featureDD.datasource, id } = this.props.match.params;
        const dsDef = { ...store.datasourceStore.store[dsname] };
        const dsType = dsDef?.type;
        const dsClass = datasourceTypes[dsType];

        const urlParams = new URLSearchParams(this.props.location.search.substring(1));
        const activeTab = urlParams.get('tab') || 'basic';
        const isDuplicate = featureDD.isDuplicate;

        const tabItems = [
            {
                label: msg('basic'),
                key: 'basic',
                children: (
                    <ScrollableView topOffset={250} bottomOffset={0}>
                        <FeatureBasicForm
                            store={this.props.store}
                            data={featureDD}
                            onMount={comp => (this.form = comp.formRef)}
                            modifyCurrent={this.modifyCurrent}
                            dsClass={dsClass}
                        />
                    </ScrollableView>
                )
            },
            {
                label: msg('geometry_fields_tab'),
                key: 'geoms',
                children: (
                    <div className="myw-list-view">
                        <ScrollableView topOffset={250} bottomOffset={0}>
                            <FeatureGeomFields
                                store={this.props.store}
                                data={featureDD}
                                dsType={dsType}
                                dsClass={dsClass}
                            />
                        </ScrollableView>
                    </div>
                )
            },
            {
                label: msg('stored_fields_tab'),
                key: 'stored',
                children: (
                    <div className="myw-list-view">
                        <FeatureStoredFields
                            key={featureDD.editable}
                            store={this.props.store}
                            data={featureDD}
                            dsType={dsType}
                            dsClass={dsClass}
                        />
                    </div>
                )
            },
            {
                label: msg('calculated_fields_tab'),
                key: 'calculated',
                children: (
                    <div className="myw-list-view">
                        <FeatureCalculatedFields
                            store={this.props.store}
                            data={featureDD}
                            dsType={dsType}
                        />
                    </div>
                )
            },
            {
                label: msg('layout_tab'),
                key: 'layout',
                children: (
                    <ScrollableView topOffset={250} bottomOffset={0}>
                        <FeatureFieldGroups store={this.props.store} data={featureDD} />
                    </ScrollableView>
                )
            },
            {
                label: msg('searches'),
                key: 'searches',
                children: (
                    <ScrollableView topOffset={250} bottomOffset={0}>
                        <FeatureSearches store={this.props.store} data={featureDD} />
                    </ScrollableView>
                )
            },
            {
                label: msg('queries'),
                key: 'queries',
                children: (
                    <ScrollableView topOffset={250} bottomOffset={0}>
                        <FeatureQueries store={this.props.store} data={featureDD} />
                    </ScrollableView>
                )
            }
        ];
        if (dsClass?.supportsFeatureFilters)
            tabItems.push({
                label: msg('filters'),
                key: 'filters',
                children: (
                    <ScrollableView topOffset={250} bottomOffset={0}>
                        <FeatureFilters />
                    </ScrollableView>
                )
            });

        return (
            <Form.Provider
                onFormFinish={(name, { values, forms }) => {
                    this.onFinish(values);
                }}
            >
                <>
                    <Card
                        className="card-with-tabs"
                        title={
                            <span className="list-title">
                                {' '}
                                {msg('existing_title', { name: featureDD.name || '' })}
                            </span>
                        }
                        extra={
                            <>
                                <LanguageSelect />
                                <CopyToOtherLangsBtn />
                            </>
                        }
                        bordered={false}
                    >
                        <Tabs
                            className="feature-edit-tabs"
                            animated={false}
                            activeKey={activeTab}
                            items={tabItems}
                            onChange={activeTab => {
                                this.setState({ tab: activeTab });
                                if (isDuplicate)
                                    history.push(`/features/${dsname}/new?tab=${activeTab}`);
                                else
                                    history.push(`/features/${dsname}/${id}/edit?tab=${activeTab}`);
                            }}
                        />
                    </Card>
                    <div className="myw-bottom-btns">
                        {this.renderControls(isDuplicate, dsClass)}
                    </div>
                </>
            </Form.Provider>
        );
    }

    // Check the geometry fields “rotatable” or “internal worlds” checkboxes is unchecked,
    // because column will be removed from database, all data will be lost.
    checkGeomFieldDataWillDiscard() {
        const { store, match } = this.props;
        if (store.ddStore.current === null) return [];

        const { dsname, id } = match.params;
        // datasource and id will not exist when duplicating a feature
        if (dsname === undefined && id === undefined) return [];

        const currentFields = store.ddStore.current?.fields ?? [];
        const originalFields = store.ddStore.store[dsname][id]?.fields ?? [];
        const allCurrentFieldNames = currentFields.map(f => f.name);
        const removedGeomFields = originalFields
            .filter(
                ({ name }) =>
                    name === 'myw_geometry_world_name' ||
                    name?.startsWith('myw_gwn_') ||
                    name?.startsWith('myw_orientation_')
            )
            .filter(({ name }) => !allCurrentFieldNames.includes(name));
        const convertedFieldNames = removedGeomFields.map(({ name }) => {
            if (name === 'myw_geometry_world_name') return 'the_geom';
            if (name?.startsWith('myw_gwn_')) return name.replace('myw_gwn_', '');
            if (name?.startsWith('myw_orientation_')) return name.replace('myw_orientation_', '');
            return name;
        });
        return [...new Set(convertedFieldNames)];
    }

    modifyCurrent = data => {
        this.props.store.ddStore.modifyCurrent(data);
        this.forceUpdate();
    };

    handleImportFeatureType = () => {
        this.taskInProgress = true;
        this.task_id = Math.floor(Math.random() * 1000000);

        this.setState({ updating: true, updated: false });

        this.triggerForProgressCheck();

        var urlParams = '?task_id=' + this.task_id;
        const currentFeature = this.props.store.ddStore.current;

        RestClient.put(
            'config/dd/' + currentFeature.datasource + '/import/' + currentFeature.name + urlParams,
            {}
        )
            .then(
                this._handleImportSuccess.bind(this, currentFeature.name, currentFeature.datasource)
            )
            .catch(this._handleImportFailure);
    };
    /**
     * Triggers timely calls to checkProgress
     */
    triggerForProgressCheck = () => {
        if (!this.taskInProgress) return;
        this.checkProgress();
        this.progressPollTimeoutHandle = setTimeout(this.triggerForProgressCheck, 1000);
    };
    /**
     * Queries the database for the status of the current task and displays it using the messageToUser display
     */
    checkProgress() {
        RestClient.get('config/task/' + this.task_id).then(data => {
            const query = data.data.query;
            var taskStatus = query?.status ?? this.props.msg('processing_msg');
            if (this.taskInProgress) message.warning(taskStatus);
        });
    }

    /**
     * Reloads the feature content after a successful import
     */
    async _handleImportSuccess(id, dsname, result) {
        this.taskInProgress = false;
        const { store, msg } = this.props;

        if (result.data.warnings?.length) {
            message.error(result.data.warnings);
        } else {
            message.success(`${msg('import_successful')}`);
        }

        await store.ddStore.get(dsname, id); //fetches
        store.ddStore.setCurrent(dsname, id); //sets as current
        this.setState({
            updated: true,
            updating: false
        });
    }
    /**
     * Parses the error and shows a user message
     * @param  {object} error Error returned by the import service
     */
    _handleImportFailure = error => {
        this.taskInProgress = false;
        utils.showErrorMsg(error, this.props.msg('import_error'));
        this.setState({ updating: false });
    };
    /**
     * Store a copy in the store and redirect to the new form view
     */
    handleDuplication = () => {
        const { dsname, id } = this.props.match.params;
        this.props.store.ddStore.duplicate(dsname, id);
        const regex = /\/\w+\//gi;
        this.props.history.push(`${regex.exec(this.props.location.pathname)[0]}${dsname}/new`);
    };

    handleSave = () => {
        //this.form is instantiated when the basic form is rendered
        if (this.form?.current) this.form?.current?.submit();
        else this.onFinish({}); //For cases when the page is refreshed when on a tab other than basic
    };

    onFinish(values) {
        const { edit, msg, store, match, history } = this.props;
        const { dsname, id } = match.params;

        //merge form values into record info from store
        const featureDDRec = store.ddStore.current;
        values = { ...featureDDRec, ...values };

        try {
            this.inlineValidation(values.fields, ['name', 'type'], 'Fields');
            this.inlineValidation(values.filters, ['name', 'value'], 'Filters');
            this.inlineValidation(values.searches, ['value', 'description'], 'Searches', [
                'Matched Value',
                'Display Value'
            ]);
            this.inlineValidation(values.queries, ['value', 'description'], 'Queries', [
                'Matched Value',
                'Display Value'
            ]);
        } catch (error) {
            return message.error(
                msg(error.message, { tabName: error.tabName, fieldName: error.fieldName })
            );
        }

        if (featureDDRec.isDuplicate) {
            // Omit the isDuplicate property from the values before sending it to the save function
            // eslint-disable-next-line no-unused-vars
            const { isDuplicate, ...data } = values;

            store.ddStore
                .save('myworld', data)
                .then(name => {
                    message.success(`${msg('created')}`);
                    history.push(`/features/myworld/${name}/edit`);
                    this.setState({ visible: false, updated: true });
                })
                .catch(error => {
                    message.error(ErrorMsg.getMsgFor(error, edit, msg));
                });
        } else {
            store.ddStore
                .update(dsname, id, values)
                .then(() => {
                    message.success(msg('saved'));
                    this.setState({ updated: true });
                })
                .catch(error => {
                    message.error(ErrorMsg.getMsgFor(error, edit, msg));
                });
        }
    }

    handleDelete = async () => {
        const { dsname, id } = this.props.match.params;
        await this.props.store.ddStore.delete(dsname, id);
    };

    handleBeforeDeleteCheck = async () => {
        const currentFeature = this.props.store.ddStore.current;
        const count = await this.props.store.ddStore.count(
            currentFeature.datasource,
            currentFeature.name
        );
        return { showDataConfirmationDialog: count > 0 };
    };

    goBackToList = () => {
        const regex = /\/\w+\//gi;
        const path = this.props.tabName
            ? `${regex.exec(this.props.location.pathname)[0]}${this.props.tabName}`
            : `${regex.exec(this.props.location.pathname)[0]}`;
        this.props.history.push(path);
    };

    handleCancel = () => {
        const route = this.props.match.params.dsname ? this.props.match.params.dsname : 'myworld';
        this.props.history.push(`/features/${route}`);
        this.props.store.ddStore.setCurrent(null);
    };

    inlineValidation(dataToValidate, fieldNames, tabName, optionalFieldName = null) {
        if (!dataToValidate) return;
        const currentFeature = this.props.store.ddStore.current;
        dataToValidate.forEach((dataRow, i) => {
            fieldNames.forEach((fieldName, index) => {
                const val = dataRow[fieldName];
                if (!val)
                    throw {
                        message: `field_blank_error`,
                        tabName: tabName,
                        fieldName: optionalFieldName //optionalFieldName handles when the title of the table is different to the name in the object
                            ? optionalFieldName[index]
                            : utils.capitalise(fieldName)
                    };
                else if (
                    tabName === 'Fields' &&
                    fieldName === 'name' &&
                    currentFeature.datasource === 'myworld' &&
                    !Validators.isInternalName(val)
                )
                    throw {
                        message: `field_invalid_internal_name`,
                        tabName: tabName,
                        fieldName: val
                    };
            });
            //Makes sure that calculated fields have a value
            if (dataRow['fieldType'] === 'calculated' && !dataRow['value'])
                throw {
                    message: `field_blank_error`,
                    tabName: 'Calculated',
                    fieldName: utils.capitalise('value')
                };
        });
    }

    renderControls(isDuplicate, dsClass) {
        const { store, msg } = this.props;
        const geomFieldsRequiredWarning = this.checkGeomFieldDataWillDiscard();
        return (
            <>
                {dsClass?.supportsImportFeatureDefs && (
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={this.handleImportFeatureType}
                        disabled={!this.state.hasManagePerm}
                        type="primary"
                    >
                        {msg('import')}
                    </Button>
                )}
                <PopConfirm
                    ref={this.saveButton}
                    cancelText={msg('confirm_no_btn')}
                    okText={msg('confirm_yes_btn')}
                    title={this.renderSaveWarning.bind(this, geomFieldsRequiredWarning)}
                    onConfirm={this.handleSave}
                    onConfirmCheck={geomFieldsRequiredWarning.length > 0}
                >
                    <Button
                        icon={<SaveOutlined />}
                        type="primary"
                        disabled={!this.state.hasManagePerm && !this.state.canSaveObject}
                    >
                        {msg('save_btn')}
                    </Button>
                </PopConfirm>
                {store.ddStore.current.datasource === 'myworld' && !isDuplicate && (
                    <Button
                        icon={<CopyOutlined />}
                        onClick={this.handleDuplication}
                        disabled={!this.state.hasManagePerm}
                    >
                        {msg('duplicate_btn')}
                    </Button>
                )}
                <DeleteButton
                    currentObj={this.state.currentObj}
                    disabled={!this.state.hasManagePerm && !this.state.canDeleteObject}
                    goBackToList={this.goBackToList}
                    msg={msg}
                    store={store}
                    storeName={'ddStore'}
                    onDelete={this.handleDelete}
                    onDoubleConfirmCheck={this.handleBeforeDeleteCheck}
                />
                <Button icon={<CloseOutlined />} onClick={this.handleCancel}>
                    {this.state.updated ? msg('close_btn') : msg('cancel_btn')}
                </Button>
            </>
        );
    }

    renderSaveWarning(fieldNames) {
        const { msg, store } = this.props;
        const featureDD = store.ddStore.current;
        return (
            <div>
                {msg('save_confirm_warning_title')}
                <ul>
                    {fieldNames.map(fieldName => (
                        <li key={`warning-field-${fieldName}`}>{fieldName}</li>
                    ))}
                </ul>
                {msg('save_confirm_warning_msg', {
                    external_name: featureDD.name ?? ''
                })}
            </div>
        );
    }
}

export { FeatureForm };
