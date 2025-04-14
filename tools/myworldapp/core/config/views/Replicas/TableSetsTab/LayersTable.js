import React, { Component } from 'react';
import { Checkbox, message } from 'antd';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { SortableTableBuilder, localise } from '../../../shared';
import gotoImg from 'images/goto.png';
import noEntryImg from 'images/no_entry.svg';

@withRouter
@inject('store')
@localise('tablesets')
@observer
export class LayersTable extends Component {
    constructor(props) {
        super(props);

        this.state = {
            filter: '',
            showLink: false
        };

        //returns function that will save a given value in the store. to be used as onChange handler
        this.setTableSetLayerProp = (data, propName) => e => {
            this.props.store.tableSetStore.setTableSetLayerProp(
                data.name,
                propName,
                e.target.checked
            );
        };

        //Change filterFields to sort against desired columns in tableSetView
        this.originalFilterFields = this.props.store.layerStore.filterFields;
        this.props.store.layerStore.filterFields = ['name', 'category', 'datasource', 'type'];

        message.config({
            maxCount: 1
        });
    }

    async componentDidMount() {
        const { store } = this.props;
        const showLink = await store.permissionStore.userCurrentlyHasPermission('layers');
        this.setState({ showLink });
    }

    componentWillUnmount() {
        //Reset filterFields to original
        this.props.store.layerStore.filterFields = this.originalFilterFields;
    }

    render() {
        const { msg } = this.props;
        const { showLink } = this.state;
        const allLayers = [...this.props.data];
        const tableSetLayers = Object.keys(this.props.options.selectedLayers);
        const tableData = allLayers
            .filter(layer =>
                this.props.options.hideUnselectedLayers ? tableSetLayers.includes(layer.name) : true
            )
            .map(layer => ({
                ...layer,
                updatable: layer.updates,
                updates: false,
                ...this.props.options.selectedLayers[layer.name]
            }))
            .sort((a, b) => {
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                // names must be equal
                return 0;
            });

        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    {
                        title: msg('use'),
                        dataIndex: 'use',
                        render: this.useLayerItem.bind(this),
                        sorter: this.useSorter.bind(this)
                    },
                    {
                        title: msg('name'),
                        dataIndex: 'name',
                        key: 'name',
                        defaultSortOrder: 'ascend',
                        render: (text, data) => (
                            <LayerName
                                text={text}
                                id={this.props.store.layerStore.getLayerByName(text).id}
                                msg={this.props.msg}
                                showLink={showLink}
                            />
                        )
                    },
                    { title: msg('datasource'), dataIndex: 'datasource', key: 'datasource' },
                    { title: msg('type'), dataIndex: 'type', key: 'type' },
                    { title: msg('category'), dataIndex: 'category', key: 'category' },
                    {
                        title: msg('on_demand'),
                        dataIndex: 'on_demand',
                        render: this.onDemandItem.bind(this),
                        className: 'text-center',
                        key: 'on_demand',
                        type: 'boolean'
                    },
                    {
                        title: msg('updates'),
                        dataIndex: 'updates',
                        render: this.updatesItem.bind(this),
                        className: 'text-center',
                        key: 'updates',
                        type: 'boolean'
                    }
                ]}
                dataSource={tableData}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                rowClassName={(record, index) => (this.isLayerUsed(record) ? '' : 'unselected-row')}
            />
        );
    }

    useLayerItem(text, rec) {
        let used = this.isLayerUsed(rec),
            extractable = rec.extractable;

        if (!extractable && !used) {
            return <img title={this.props.msg('not_extractable')} src={noEntryImg} />;
        } else {
            return (
                <Checkbox
                    className="myw-use-checkbox"
                    checked={used}
                    onChange={this.handleRowSelection.bind(this, rec.name)}
                />
            );
        }
    }

    isLayerUsed(layerRec) {
        return layerRec.name in this.props.options.selectedLayers;
    }

    handleRowSelection(name, e) {
        this.props.store.tableSetStore.updateLayer(name, e.target.checked);
    }

    onDemandItem(text, rec) {
        let on_demand = rec.on_demand,
            extractable = rec.extractable;

        if (!extractable) {
            return <img title={this.props.msg('not_extractable')} src={noEntryImg} />;
        } else {
            return (
                <Checkbox
                    checked={on_demand}
                    onChange={this.setTableSetLayerProp(rec, 'on_demand')}
                    disabled={!this.isLayerUsed(rec)}
                />
            );
        }
    }

    updatesItem(text, rec) {
        let on_demand = rec.on_demand,
            updates = rec.updates,
            extractable = rec.extractable,
            updatable = rec.updatable;

        if (!extractable) {
            return <img title={this.props.msg('not_extractable')} src={noEntryImg} />;
        } else if (!updatable) {
            return (
                <img title={this.props.msg('incremental_updates_not_supported')} src={noEntryImg} />
            );
        } else {
            return (
                <Checkbox
                    checked={updates}
                    disabled={on_demand || !this.isLayerUsed(rec)}
                    onChange={this.setTableSetLayerProp(rec, 'updates')}
                />
            );
        }
    }

    useSorter(a, b) {
        let useA = this.isLayerUsed(a),
            useB = this.isLayerUsed(b);
        if (!useA) useA = 0;
        if (!useB) useB = 0;
        if (useA != null && useB != null) {
            return useA > useB ? 1 : useA < useB ? -1 : 0;
        }
    }
}
class LayerName extends Component {
    render() {
        const { msg, text, id, showLink = true } = this.props;
        const link = showLink ? (
            <a
                title={msg('view_layer')}
                className="linkToEdit"
                href={`./config.html#/layers/${id}/edit`}
            >
                <img className={'hidden'} alt="View" src={gotoImg} />
            </a>
        ) : null;
        return (
            <label>
                {text}
                {link}
            </label>
        );
    }
}
