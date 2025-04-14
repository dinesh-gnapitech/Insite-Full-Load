import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { SortableTableBuilder, localise } from '../../shared';

@withRouter
@localise('replicas')
export class TableSetsTable extends Component {
    render() {
        const { msg } = this.props;
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                msg={this.props.msg}
                size="small"
                columns={[
                    { title: msg('name'), dataIndex: 'name', key: 'name' },
                    { title: msg('description'), dataIndex: 'description', key: 'description' },
                    {
                        title: msg('layers'),
                        dataIndex: 'layers',
                        key: 'layers',
                        render: (text, item) => Object.keys(item.layers).length,
                        sorter: (a, b) => {
                            const aLen = Object.keys(a.layers).length;
                            const bLen = Object.keys(b.layers).length;
                            return aLen > bLen ? 1 : aLen < bLen ? -1 : 0;
                        }
                    },
                    {
                        title: msg('tiles'),
                        dataIndex: 'tile_files',
                        key: 'tile_files',
                        render: (text, item) => Object.keys(item.tile_files).length,
                        sorter: (a, b) => {
                            const aLen = Object.keys(a.tile_files).length;
                            const bLen = Object.keys(b.tile_files).length;
                            return aLen > bLen ? 1 : aLen < bLen ? -1 : 0;
                        }
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/replicas/tableSets/${record.name}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
