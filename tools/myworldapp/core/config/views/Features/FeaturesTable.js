import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { observe, toJS } from 'mobx';
import { localise, SortableTableBuilder } from '../../shared';
import {
    CheckOutlined,
    DownloadOutlined,
    ReloadOutlined,
    WarningOutlined
} from '@ant-design/icons';

@withRouter
@inject('store')
@localise('features')
@observer
export class FeaturesTable extends Component {
    constructor(props) {
        super(props);
    }

    componentDidMount() {
        this.mounted = true;
        this.props.store.layerStore.getAll();
        //Rerender when store finishes loading, to show links
        observe(this.props.store.layerStore, 'isLoading', change => {
            if (this.mounted) this.forceUpdate(); //Only trigger a re-render when component is mounted
        });
    }

    componentWillUnmount() {
        this.mounted = false;
    }

    getColumns() {
        const { msg, store } = this.props;
        const tick = (value, item) => (value ? <CheckOutlined /> : '');

        const currentLang = store.settingsStore.currentLang;

        return {
            name: {
                title: msg('feature_type'),
                dataIndex: 'name',
                render: this.nameCellContent,
                key: 'name'
            },
            external_name: {
                title: msg('external_name'),
                dataIndex: 'external_name',
                key: 'external_name',
                className: 'table-column-wrapping',
                render: (text, rec) => store.settingsStore.getLocalisedValFor(text, currentLang)
            },
            layers: {
                title: msg('layers'),
                dataIndex: 'layers',
                key: 'layers',
                className: 'wrap-text',
                render: this.getLayersLink.bind(this),
                width: '80px'
            },
            search_rule_count: {
                title: msg('searches'),
                dataIndex: 'search_rule_count',
                key: 'search_rule_count',
                type: 'number',
                render: item => {
                    return store.settingsStore.getLocalisedValFor(
                        JSON.stringify(toJS(item)),
                        currentLang
                    );
                }
            },
            query_count: {
                title: msg('queries'),
                dataIndex: 'query_count',
                key: 'query_count',
                type: 'number',
                render: item => {
                    return store.settingsStore.getLocalisedValFor(
                        JSON.stringify(toJS(item)),
                        currentLang
                    );
                }
            },
            geometry_type: {
                title: msg('geometry_type'),
                dataIndex: 'geometry_type',
                key: 'geometry_type'
            },
            title_expr: {
                title: msg('title'),
                dataIndex: 'title_expr',
                key: 'title_expr',
                render: (text, rec) => store.settingsStore.getLocalisedValFor(text, currentLang)
            },
            short_description_expr: {
                title: msg('description'),
                dataIndex: 'short_description_expr',
                key: 'short_description_expr',
                render: (text, rec) => store.settingsStore.getLocalisedValFor(text, currentLang)
            },
            feature_name: {
                title: msg('feature_type'),
                dataIndex: 'feature_name',
                render: this.nameCellContent,
                key: 'feature_name'
            },
            search_val_expr: {
                title: msg('search_value'),
                dataIndex: 'search_val_expr',
                key: 'search_val_expr'
            },
            search_desc_expr: {
                title: msg('search_description'),
                dataIndex: 'search_desc_expr',
                key: 'search_desc_expr'
            },
            myw_search_val1: {
                title: msg('query_value'),
                dataIndex: 'myw_search_val1',
                key: 'myw_search_val1'
            },
            myw_search_desc1: {
                title: msg('query_description'),
                dataIndex: 'myw_search_desc1',
                key: 'myw_search_desc1'
            },
            attrib_query: {
                title: msg('filter'),
                dataIndex: 'attrib_query',
                key: 'attrib_query',
                sorter: (a, b) => ('' + a.attrib_query).localeCompare(b.attrib_query)
            },
            track_changes: {
                title: msg('track_changes'),
                dataIndex: 'track_changes',
                className: 'text-center',
                render: tick,
                type: 'boolean',
                key: 'track_changes'
            },
            editable: {
                title: msg('editable'),
                dataIndex: 'editable',
                className: 'text-center',
                render: tick,
                type: 'boolean',
                key: 'editable'
            },
            versioned: {
                title: msg('versioned'),
                dataIndex: 'versioned',
                className: 'text-center',
                render: tick,
                type: 'boolean',
                key: 'versioned'
            },
            filter_count: {
                title: msg('filters'),
                dataIndex: 'filter_count',
                key: 'filter_count',
                type: 'number'
            },
            filter_name: { title: msg('name'), dataIndex: 'name', key: 'name' },
            filter_value: { title: msg('value'), dataIndex: 'value', key: 'value' }
        };
    }

    /**
     * Creates link to layer/:id/edit page
     * @param {string} layers
     */
    getLayersLink(layers) {
        if (!layers) return;
        const layersList = layers.split(',');
        return (
            <div className="link-container">
                {layersList.map((layer, i) => {
                    const str = i == layersList.length - 1 ? '' : ', ';
                    const rec = this.props.store.layerStore.getLayerByCode(layer);
                    if (!rec) return;
                    const url = `./config.html#/layers/${rec.id}/edit/test`;
                    //Cannot use react Links as do not work in antd tables
                    return (
                        <a key={layer} href={url} onClick={this.handleLinkClick}>
                            {layer}
                            {str}
                        </a>
                    );
                })}
            </div>
        );
    }

    /**
     * Stops the click on the link triggering the click on the table row as well
     * so that the history isn't incorrect
     * @param {event} e
     */
    handleLinkClick(e) {
        e.stopPropagation();
    }

    /**
     * When the table data has just gone through an import, we want show
     * an appropriate icon leading the feature_type name
     */
    nameCellContent = text => {
        let status = this.props.importedData[text];

        //If there is no status reported, do nothing
        if (typeof status === 'undefined') return <b style={{ wordBreak: 'break-all' }}>{text}</b>;
        else status = status[0];

        let iconType,
            title = this.props.msg(status + '_icon_title');

        if (status === 'insert')
            iconType = <DownloadOutlined style={{ color: '#52bc56', paddingRight: '10px' }} />;
        else if (status === 'update')
            iconType = <ReloadOutlined style={{ color: '#52bc56', paddingRight: '10px' }} />;
        else {
            iconType = <WarningOutlined style={{ color: '#f78e1e', paddingRight: '10px' }} />;
            title = status[1];
        }

        return (
            <div title={title}>
                {iconType}
                <b style={{ wordBreak: 'break-all' }}>{text}</b>
            </div>
        );
    };

    render() {
        const {
            mode,
            dsName,
            columnNames,
            history,
            data,
            msg,
            loading,
            sort,
            onSortingChange,
            store
        } = this.props;
        const allColumns = this.getColumns();
        const columns = columnNames.map(colName => allColumns[colName]);

        //get message value for each column title
        columns.forEach(c => {
            return { ...c, title: msg(c.title) };
        });

        const isFeatureRecords = mode == 'summary' || mode == 'basic';
        const tabStr = isFeatureRecords ? '' : `?tab=${mode}`;
        const nameProp = isFeatureRecords ? 'name' : 'feature_name';
        const clickHandler = record => () => {
            history.push(`/features/${dsName}/${record[nameProp]}/edit${tabStr}`);
        };
        let tableData = data;
        if (['searches', 'queries'].includes(mode)) {
            tableData = data?.filter(item => item.lang === store.settingsStore.currentLang);
        }

        return (
            <SortableTableBuilder
                style={{ marginBottom: '25px' }}
                loading={loading}
                size="small"
                columns={columns}
                dataSource={tableData}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="id"
                onRow={record => {
                    return {
                        onClick: clickHandler(record)
                    };
                }}
                sortedColKey={sort ? sort.sortedColKey : null}
                sortOrder={sort ? sort.sortOrder : null}
                onSortingChange={(...args) => onSortingChange(dsName, ...args)}
            />
        );
    }

    getTitleCellValue(text) {
        return <b>{text}</b>;
    }
}
