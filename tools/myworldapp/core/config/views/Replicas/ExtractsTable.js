import myw from 'myWorld-base';
import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { SortableTableBuilder, localise } from '../../shared';
import { CheckOutlined } from '@ant-design/icons';

@withRouter
@localise('replicas')
export class ExtractsTable extends Component {
    render() {
        const { msg } = this.props;
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    { title: msg('name'), dataIndex: 'name', key: 'name' },
                    { title: msg('region'), dataIndex: 'region', key: 'region' },
                    { title: msg('table_set'), dataIndex: 'table_set', key: 'table_set' },
                    {
                        title: msg('include_deltas'),
                        dataIndex: 'include_deltas',
                        key: 'include_deltas',
                        render: value => (value ? <CheckOutlined /> : ''),
                        type: 'boolean'
                    },
                    { title: msg('last_export'), dataIndex: 'last_export', key: 'last_export' },
                    {
                        title: msg('last_export_time'),
                        dataIndex: 'last_export_time',
                        key: 'last_export_time',
                        render: this.lastExportTime.bind(this)
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/replicas/extracts/${record.name}`);
                        }
                    };
                }}
            />
        );
    }

    lastExportTime(text, rec) {
        var lastExportTime = rec.last_export_time;
        return lastExportTime
            ? myw.Util.timeSince(new Date(myw.Util.formatRawDate(lastExportTime)))
            : '--';
    }
}
