import React, { Component } from 'react';
import { Card, Radio, Button, message, Tooltip } from 'antd';
import {
    PlusOutlined,
    DownloadOutlined,
    FilterOutlined,
    BarsOutlined,
    BuildOutlined,
    SearchOutlined,
    QuestionOutlined
} from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { FeaturesTable } from './FeaturesTable';
import { SearchInput, utils, LanguageSelect } from '../../shared';
import { RestClient } from '../../stores/RestClient';

const columnNamesByMode = {
    summary: ['name', 'external_name', 'layers', 'search_rule_count', 'query_count'],
    basic: ['name', 'external_name', 'geometry_type', 'title_expr', 'short_description_expr'],
    searches: ['feature_name', 'search_val_expr', 'search_desc_expr'],
    queries: ['feature_name', 'myw_search_val1', 'myw_search_desc1', 'attrib_query']
};
const myWorldColumnNamesByMode = {
    summary: [
        'name',
        'external_name',
        'track_changes',
        'editable',
        'versioned',
        'layers',
        'search_rule_count',
        'query_count',
        'filter_count'
    ],
    basic: [
        'name',
        'external_name',
        'track_changes',
        'editable',
        'geometry_type',
        'title_expr',
        'short_description_expr'
    ],
    searches: ['feature_name', 'search_val_expr', 'search_desc_expr'],
    queries: ['feature_name', 'myw_search_val1', 'myw_search_desc1', 'attrib_query'],
    filters: ['feature_name', 'filter_name', 'filter_value']
};

@inject('store')
@withRouter
@observer
export class FeaturesTab extends Component {
    constructor(props) {
        super(props);
        message.config({
            maxCount: 1
        });

        this.state = {
            updated: false,
            updating: false,
            importedData: {},
            sortedColKey: props.sortedColKey,
            sortOrder: props.sortOrder,
            dsData: {}
        };
    }

    async componentDidMount() {
        const { mode, store, dsName } = this.props;
        await store.ddStore.getDD(dsName, mode);
        this.setState({ dsData: this.props.store.ddStore.ds[dsName] });
    }

    async componentDidUpdate(prevProps) {
        const { mode, store, dsName, active } = this.props;
        if ((active && !prevProps.active) || (active && mode !== prevProps.mode)) {
            await store.ddStore.getDD(dsName, mode);
            this.setState({ dsData: store.ddStore.ds[dsName] });
        }
    }

    render() {
        // if (!this.props.active) return null;
        const importBtnTxt = this.state.updating ? 'importing' : 'import';
        const {
            msg,
            history,
            dsName,
            dsClass,
            mode,
            onModeChange,
            filter,
            onFilterChange,
            onSortingChange,
            sort
        } = this.props;
        const dsData = this.state.dsData;
        const isLoading = this.props.store.ddStore.isLoading;
        if (!dsData) return null;
        const { columnNames, data, filteredSize, totalCount } = this.getDataForTable(dsData);
        const { importedData } = this.state;
        const tableProps = {
            msg,
            dsName,
            mode,
            columnNames,
            data,
            importedData,
            loading: isLoading,
            onSortingChange: onSortingChange,
            sort
        };

        let filterMsg = this.setSearchInputMessage(msg, dsName, filteredSize, totalCount);

        return (
            <Card
                className="myw-list-view features-list"
                title={
                    <span>
                        <span
                            className="view-mode-container"
                            style={{
                                display: 'inline-block',
                                marginRight: 20,
                                verticalAlign: 'top'
                            }}
                        >
                            <Radio.Group value={mode}>
                                <Tooltip placement="top" title={msg('summary')}>
                                    <Radio.Button
                                        value="summary"
                                        onClick={onModeChange.bind(this, 'summary')}
                                        title={msg('summary')}
                                    >
                                        <BarsOutlined />
                                    </Radio.Button>
                                </Tooltip>
                                <Tooltip placement="top" title={msg('basic')}>
                                    <Radio.Button
                                        value="basic"
                                        onClick={onModeChange.bind(this, 'basic')}
                                        title={msg('basic')}
                                    >
                                        <BuildOutlined />
                                    </Radio.Button>
                                </Tooltip>
                                <Tooltip placement="top" title={msg('searches')}>
                                    <Radio.Button
                                        value="searches"
                                        onClick={onModeChange.bind(this, 'searches')}
                                        title={msg('searches')}
                                    >
                                        <SearchOutlined />
                                    </Radio.Button>
                                </Tooltip>
                                <Tooltip placement="top" title={msg('queries')}>
                                    <Radio.Button
                                        value="queries"
                                        onClick={onModeChange.bind(this, 'queries')}
                                        title={msg('queries')}
                                    >
                                        <QuestionOutlined />
                                    </Radio.Button>
                                </Tooltip>
                                {dsName === 'myworld' && (
                                    <Tooltip placement="top" title={msg('filters')}>
                                        <Radio.Button
                                            value="filters"
                                            onClick={onModeChange.bind(this, 'filters')}
                                            title={msg('filters')}
                                        >
                                            <FilterOutlined />
                                        </Radio.Button>
                                    </Tooltip>
                                )}
                            </Radio.Group>
                        </span>
                        <span>{msg(mode)}</span>
                    </span>
                }
                bordered={false}
                extra={
                    <div>
                        {<span style={{ display: 'inline-block' }}>{filterMsg}</span>}
                        <div style={{ display: 'inline-block', margin: '0 10px' }}>
                            <SearchInput
                                value={filter}
                                onChange={value => onFilterChange(dsName, value || '')}
                                onClear={value => onFilterChange(dsName, value || '')}
                            />
                        </div>
                        <LanguageSelect />
                        {dsClass.supportsNewFeatureTypes && (
                            <Button
                                icon={<PlusOutlined />}
                                type="primary"
                                onClick={() => history.push(`/features/${dsName}/new`)}
                                disabled={!this.props.hasManagePerm}
                            >
                                {msg('add_new_btn')}
                            </Button>
                        )}
                        {dsClass.supportsImportFeatureDefs && (
                            <Button
                                icon={<DownloadOutlined />}
                                type="primary"
                                loading={this.state.updating}
                                onClick={this.handleImport.bind(this)}
                                disabled={!this.props.hasManagePerm}
                            >
                                {msg(importBtnTxt)}
                            </Button>
                        )}
                    </div>
                }
            >
                <FeaturesTable {...tableProps} />
            </Card>
        );
    }

    //returns configuration to pass to a table given the current mode
    getDataForTable(dsData) {
        const { mode, dsName } = this.props;
        const columnNames =
            dsName === 'myworld' ? myWorldColumnNamesByMode[mode] : columnNamesByMode[mode] || [];

        let data = dsData.feature_types;
        let filterColumns = ['name', 'external_name', 'layers'];
        if (mode == 'searches') {
            data = dsData.searches;
            filterColumns = ['feature_name'];
        } else if (mode == 'queries') {
            data = dsData.queries;
            filterColumns = ['feature_name', 'myw_search_val1', 'myw_search_desc1', 'attrib_query'];
        } else if (mode == 'filters') {
            data = dsData.filters;
            filterColumns = ['feature_name', 'name', 'value'];
        } else {
            // summary or basic info, one row per feature type
        }
        let totalCount = null;
        if (data) totalCount = data.length;

        data = this.filter(data, this.props.filter, filterColumns);
        const filteredSize = data ? data.length : totalCount;

        return { columnNames, data, filteredSize, totalCount };
    }

    filter(data, filter, filterColumns) {
        if (!filter) return data;
        return data?.filter(rec => {
            for (const key of filterColumns) {
                if ((rec[key] || '').toLowerCase().includes(filter.toLowerCase())) return true;
            }
            return false;
        });
    }

    /**
     * Spawns a post request to import the data from the external DD
     * Also triggers a progress check for progress handling
     * This process updated the database with data from external DD
     */
    async handleImport() {
        this.taskInProgress = true;
        this.task_id = Math.floor(Math.random() * 1000000);

        this.setState({ updating: true, updated: false });

        this.triggerForProgressCheck();

        var urlParams = '?task_id=' + this.task_id;

        RestClient.put('config/dd/' + this.props.dsName + '/import' + urlParams, {})
            .then(this._handleImportSuccess.bind(this))
            .catch(this._handleImportFailure.bind(this))
            .then(async () => {
                await this.props.store.ddStore.getDD(this.props.dsName, this.props.mode);
                this.forceUpdate();
            });
    }

    /**
     * Refreshes the list so it shows the imported data
     * @param  {object} data    Data returned by the import request
     *                          Example: {
     *                              "cite:Outage":          ["insert"],
     *                              "myworld:service_area": ["update"],
     *                              "national_grid:GasPipe":["error" , "***Error*** Could not access feature type"]
     *                           }
     */
    async _handleImportSuccess(data) {
        this.taskInProgress = false;

        let updated_features_count = 0;
        let inserted_features_count = 0;

        Object.values(data.data).forEach(feature_status => {
            const action = feature_status[0];
            if (action === 'update') updated_features_count++;
            else if (action === 'insert') inserted_features_count++;
        });

        //Consolidates the report of what has changed
        const { msg } = this.props;
        const insertedMessage = `${msg('num_features_inserted', {
            count: inserted_features_count
        })}; ${msg('num_features_updated', { count: updated_features_count })}`;
        //Scroll to the bottom of the window so the message is clearly visible
        message.success(insertedMessage);
        this.setState({
            updated: true,
            updating: false,
            importedData: data.data
        });
    }

    /**
     * Parses the error and shows a user message
     * @param  {object} error Error returned by the import service
     */
    _handleImportFailure(error) {
        this.taskInProgress = false;
        let errorMsg = this.props.msg('import_error', { error: error.message || error });
        utils.showErrorMsg(error, errorMsg);
        this.setState({ updating: false });
    }

    /**
     * Triggers timely calls to checkProgress
     */
    triggerForProgressCheck() {
        if (!this.taskInProgress) return;
        this.checkProgress();
        this.progressPollTimeoutHandle = setTimeout(this.triggerForProgressCheck.bind(this), 1000);
    }
    /**
     * Queries the database for the status of the current task and displays it using the messageToUser display
     */
    checkProgress() {
        RestClient.get('config/task/' + this.task_id).then(
            function (data) {
                const query = data.data.query;
                var taskStatus = query?.status ?? this.props.msg('processing_msg');
                if (this.taskInProgress) message.warning(taskStatus);
            }.bind(this)
        );
    }

    onFiltered(totalCount, filterCount) {
        if (this.state.filterCount != filterCount) {
            this.setState({ totalCount, filterCount });
        }
    }

    setSearchInputMessage(msg, dsName, filterCount, totalCount) {
        //message to the left of the search bar - displays number left after user filter, and total
        let filterMsg = '';
        if (
            this.props.store.ddStore.isLoading == false &&
            typeof this.props.store.ddStore.ds[dsName] !== 'undefined'
        ) {
            //if only on feature left display feature not features
            if (this.state.filterCount == 1) {
                filterMsg = utils.getFilterMsg(msg, 'object', filterCount, totalCount);
            } else {
                filterMsg = filterMsg = utils.getFilterMsg(msg, 'objects', filterCount, totalCount);
            }
        }
        return filterMsg;
    }
}
