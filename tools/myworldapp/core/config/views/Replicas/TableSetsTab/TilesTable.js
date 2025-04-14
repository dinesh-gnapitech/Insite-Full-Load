import React, { Component } from 'react';
import { Checkbox } from 'antd';
import { inject, observer } from 'mobx-react';
import { ZoomSelect } from './ZoomSelect';
import { SortableTableBuilder, localise } from '../../../shared';

@localise('tablesets')
@inject('store')
@observer
export class TilesTable extends Component {
    constructor(props) {
        super(props);
        this.state = {
            myWorldDs: null,
            tableData: null
        };
    }

    //returns function that will save a given value in the store. to be used as onChange handler
    setTableSetTileProp = (data, propName, componentType) => value => {
        const val = componentType === 'checkbox' ? value.target.checked : value;
        this.props.store.tableSetStore.setTableSetTileProp(data.file, propName, val);
    };

    async componentDidMount() {
        const myWorldDs = await this.props.store.datasourceStore.get('myworld');
        const tableSetStore = this.props.store.tableSetStore;

        if (!this.props.edit && !tableSetStore.current.isDuplicate) {
            const rec = tableSetStore.current;
            this.getAllTiles().forEach(file => {
                rec.tile_files[file] = { updates: true };
            });
            tableSetStore.modifyCurrent(rec);
        }

        const tableData = TilesTable.determineTableData(this.props, { myWorldDs });
        this.setState({ myWorldDs, tableData });
    }

    static getDerivedStateFromProps(props, state) {
        const tableData = TilesTable.determineTableData(props, state);
        return { tableData };
    }

    static determineTableData(props, state) {
        const myworldDs = state.myWorldDs;
        const tilestore = myworldDs?.spec.tilestore || [];
        const tiles = props.selectedTiles || {};

        const tableSetTiles = Object.keys(tiles);
        const tableData = tilestore
            .filter(tile => (props.hideUnselectedTiles ? tableSetTiles.includes(tile.file) : true))
            //  Ensure we don't have any duplicate tile files
            .reduce((current, value) => {
                const found = current.find(val => val.file === value.file);
                if (!found) current.push({ ...value, key: value.file });
                return current;
            }, []);

        return tableData;
    }

    render() {
        const { msg } = this.props;
        const { tableData } = this.state;
        return (
            <SortableTableBuilder
                className="myw-list-view"
                style={{ marginTop: '24px' }}
                loading={!tableData}
                size="small"
                columns={[
                    {
                        title: msg('use'),
                        dataIndex: 'use',
                        render: this.useItem,
                        sorter: this.sort(this.isUseItem)
                    },
                    { title: msg('file'), dataIndex: 'file', key: 'file' },
                    {
                        title: msg('on_demand'),
                        dataIndex: 'on_demand',
                        className: 'text-center',
                        render: this.onDemandItem,
                        sorter: this.sort(this.isOnDemandItem)
                    },
                    {
                        title: msg('updates'),
                        dataIndex: 'updates',
                        render: this.updatesItem,
                        sorter: this.sort(this.isUpdatesItem),
                        className: 'text-center'
                    },
                    {
                        title: msg('min_zoom'),
                        dataIndex: 'min_zoom',
                        render: this.minZoomItem,
                        sorter: this.sort(this.getMinZoom, true)
                    },
                    {
                        title: msg('max_zoom'),
                        dataIndex: 'max_zoom',
                        render: this.maxZoomItem,
                        sorter: this.sort(this.getMaxZoom, true)
                    },
                    {
                        title: msg('by_layer'),
                        dataIndex: 'by_layer',
                        className: 'text-center',
                        render: this.byLayerItem,
                        sorter: this.sort(this.isByLayerItem)
                    }
                ]}
                dataSource={tableData}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="file"
            />
        );
    }

    getAllTiles() {
        const myworldDs = this.props.store.datasourceStore.store.myworld;
        const tilestore = myworldDs?.spec.tilestore || [];
        return tilestore.map(tile => tile.file);
    }

    getTile = filename => (this.props.selectedTiles || {})[filename];
    isUseItem = rec => !!this.getTile(rec.file);
    isOnDemandItem = rec => this.getTile(rec.file)?.on_demand;
    isUpdatesItem = rec => this.getTile(rec.file)?.updates;
    isByLayerItem = rec => this.getTile(rec.file)?.by_layer;
    getMinZoom = rec => this.getTile(rec.file)?.min_zoom;
    getMaxZoom = rec => this.getTile(rec.file)?.max_zoom;

    useItem = (text, rec) => {
        const use = this.isUseItem(rec);
        return (
            <Checkbox
                className="myw-use-checkbox"
                checked={use}
                onChange={(...args) => this.handleRowSelection(rec.file, ...args)}
            />
        );
    };

    handleRowSelection(name, e) {
        this.props.store.tableSetStore.updateTile(name, e.target.checked);
    }

    onDemandItem = (text, rec) => {
        const on_demand = this.isOnDemandItem(rec);
        return (
            <Checkbox
                checked={on_demand}
                onChange={this.setTableSetTileProp(rec, 'on_demand', 'checkbox')}
            />
        );
    };

    updatesItem = (text, rec) => {
        const on_demand = this.isOnDemandItem(rec),
            updates = this.isUpdatesItem(rec);

        return (
            <Checkbox
                checked={updates}
                disabled={on_demand}
                onChange={this.setTableSetTileProp(rec, 'updates', 'checkbox')}
            />
        );
    };

    minZoomItem = (text, rec) => {
        const min_zoom = this.getMinZoom(rec);
        return <ZoomSelect value={min_zoom} onChange={this.setTableSetTileProp(rec, 'min_zoom')} />;
    };

    maxZoomItem = (text, rec) => {
        const max_zoom = this.getMaxZoom(rec);
        return <ZoomSelect value={max_zoom} onChange={this.setTableSetTileProp(rec, 'max_zoom')} />;
    };

    byLayerItem = (text, rec) => {
        const by_layer = this.isByLayerItem(rec);
        return (
            <Checkbox
                checked={by_layer}
                onChange={this.setTableSetTileProp(rec, 'by_layer', 'checkbox')}
            />
        );
    };

    sort(func, rev = false) {
        return function (a, b) {
            const aRes = func(a) || 0;
            const bRes = func(b) || 0;
            if (aRes != null && bRes != null) {
                return rev ? aRes - bRes : bRes - aRes;
            }
        };
    }
}
