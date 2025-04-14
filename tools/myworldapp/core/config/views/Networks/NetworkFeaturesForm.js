import React, { Component } from 'react';
import { Input, Select, Card } from 'antd';
import { inject, observer } from 'mobx-react';
import { toJS } from 'mobx';
import { SearchInput, SortableTableBuilder, localise, utils, FeatureName } from '../../shared';
const { Option } = Select;

@inject('store')
@localise('networks')
@observer
export class NetworkFeaturesForm extends Component {
    constructor(props) {
        super(props);

        this.state = {
            filter: '',
            selected: Object.keys(props.store.networkStore.current.feature_types || {}), //will be updated when layer info is obtained
            showLink: false
        };
    }

    async componentDidMount() {
        const { store } = this.props;
        const showLink = await store.permissionStore.userCurrentlyHasPermission('features');
        this.setState({ showLink });
        if (store.networkStore.query) this.setState({ filter: store.networkStore.query });
    }

    handleChange(name, key, value) {
        const { current } = this.props.store.networkStore;
        let next = { ...toJS(current) };
        if (!Object.prototype.hasOwnProperty.call(next, 'feature_types'))
            next['feature_types'] = {};
        next.feature_types[name] = next.feature_types[name] || {};
        next.feature_types[name][key] = value;
        this.props.store.networkStore.modifyCurrent(next);

        this.setState({ selected: Object.keys(next.feature_types) });
    }

    onFilterChange = value => {
        const filterVal = value ? value : '';
        this.setState({ filter: filterVal });
        this.props.store.networkStore.setFilter(filterVal);
    };

    render() {
        const { msg, hideUnselected, store, data } = this.props;
        const { selected, showLink } = this.state;
        const { myWorldStore, networkStore } = store;
        const existingData = networkStore.current.feature_types || data?.feature_types || {};

        const fieldDefs = toJS(myWorldStore.fields);

        let featureData = [
            ...Object.keys(fieldDefs)
                .map(key => {
                    const next = existingData[key];
                    if (!next)
                        return {
                            name: key,
                            upstream: null,
                            downstream: null,
                            length: null,
                            filter: ''
                        };

                    return {
                        name: key,
                        upstream: next.upstream,
                        downstream: next.downstream,
                        length: next.length,
                        filter: next.filter
                    };
                })
                .filter(field => {
                    if (hideUnselected) {
                        return selected ? selected.includes(field.name) : existingData[field.name];
                    } else return true;
                })
        ];
        const totalCount = featureData.length;

        const columns = [
            {
                title: msg('name'),
                dataIndex: 'name',
                key: 'name',
                width: 400,
                render: (text, data) => <FeatureName text={text} msg={msg} showLink={showLink} />,
                className: 'table-column-wrapping'
            },
            {
                title: msg('upstream'),
                dataIndex: 'upstream',
                key: 'upstream',
                width: 400,
                render: (text, o) => (
                    <Select
                        style={{ width: '100%' }}
                        value={o.upstream}
                        onChange={this.handleChange.bind(this, o.name, 'upstream')}
                    >
                        {myWorldStore
                            .storedField(o.name)
                            .sort((a, b) =>
                                a.internal_name > b.internal_name
                                    ? 1
                                    : a.internal_name < b.internal_name
                                    ? -1
                                    : 0
                            )
                            .map(f => (
                                <Option key={f.internal_name} value={f.internal_name}>
                                    {f.internal_name}
                                </Option>
                            ))}
                    </Select>
                )
            },
            {
                title: msg('downstream'),
                dataIndex: 'downstream',
                key: 'downstream',
                width: 400,
                render: (text, o) => (
                    <Select
                        style={{ width: '100%' }}
                        value={o.downstream}
                        onChange={this.handleChange.bind(this, o.name, 'downstream')}
                    >
                        {myWorldStore
                            .storedField(o.name)
                            .sort((a, b) =>
                                a.internal_name > b.internal_name
                                    ? 1
                                    : a.internal_name < b.internal_name
                                    ? -1
                                    : 0
                            )
                            .map(f => (
                                <Option key={f.internal_name} value={f.internal_name}>
                                    {f.internal_name}
                                </Option>
                            ))}
                    </Select>
                )
            },
            {
                title: msg('length'),
                dataIndex: 'length',
                key: 'length',
                width: 400,
                render: (text, o) => (
                    <Select
                        style={{ width: '100%' }}
                        value={o.length}
                        onChange={this.handleChange.bind(this, o.name, 'length')}
                        allowClear
                    >
                        {myWorldStore
                            .storedField(o.name, true)
                            .sort((a, b) =>
                                a.internal_name > b.internal_name
                                    ? 1
                                    : a.internal_name < b.internal_name
                                    ? -1
                                    : 0
                            )
                            .map(f => (
                                <Option key={f.internal_name} value={f.internal_name}>
                                    {f.internal_name}
                                </Option>
                            ))}
                    </Select>
                )
            },
            {
                title: msg('filter'),
                dataIndex: 'filter',
                key: 'filter',
                width: 400,
                render: (text, o) => (
                    <Input
                        value={o.filter}
                        onChange={e => this.handleChange(o.name, 'filter', e.target.value)}
                    />
                )
            }
        ];
        const { filter } = this.state;
        if (filter)
            featureData = featureData.filter(e =>
                e.name.toLowerCase().includes(filter.toLowerCase())
            );

        let filterMsg = '';
        if (featureData.length == 1) {
            filterMsg = utils.getFilterMsg(msg, 'feature', featureData.length, totalCount);
        } else {
            filterMsg = utils.getFilterMsg(msg, 'features', featureData.length, totalCount);
        }
        return (
            <Card
                className="myw-layer-features-form myw-list-view"
                bordered={false}
                extra={
                    <div>
                        {<span style={{ display: 'inline-block' }}>{filterMsg}</span>}
                        <div style={{ display: 'inline-block', margin: '0 10px' }}>
                            <SearchInput
                                style={{ width: 258 }}
                                value={this.state.filter}
                                onChange={this.onFilterChange}
                                onClear={this.onFilterChange}
                            />
                        </div>
                    </div>
                }
            >
                <SortableTableBuilder
                    className="editable-table"
                    rowKey="name"
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    dataSource={featureData}
                    columns={columns}
                    rowSelection={{
                        selectedRowKeys: this.state.selected || Object.keys(existingData),
                        onSelect: (record, selected, selectedRows) => {
                            //Update state
                            this.setState({ selected: selectedRows.map(row => row.name) });
                            //Lazily update network store (better for performance)
                            store.networkStore.updateFeatures([record], selected);
                        },
                        onSelectAll: (selected, selectedRows, changeRows) => {
                            this.setState({ selected: selectedRows.map(row => row.name) });
                            //Lazily update netork store (better for performance)
                            store.networkStore.updateFeatures(selectedRows, selected);
                        }
                    }}
                />
            </Card>
        );
    }
}
