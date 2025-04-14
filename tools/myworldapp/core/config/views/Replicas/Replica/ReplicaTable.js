import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { Table, Card } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from '../../../shared';
import myw from 'myWorld-base';

@localise('replicas')
@inject('store')
@withRouter
@observer
//Table to display details of replica in replication view
export class ReplicaTable extends Component {
    componentDidMount() {
        this.props.store.replicaStore.get(this.props.match.params.name);
    }

    render() {
        const { msg } = this.props;
        const tableData = this.parseData(
            this.props.store.replicaStore.store[this.props.match.params.name] || []
        );
        return (
            <Card>
                <Table
                    className="myw-list-view"
                    loading={this.props.loading}
                    size="small"
                    showHeader={false}
                    columns={[
                        {
                            title: msg('name'),
                            dataIndex: 'name',
                            key: 'name',
                            className: 'myw-no-header-table'
                        },
                        { title: msg('value'), dataIndex: 'value', key: 'value' }
                    ]}
                    dataSource={tableData}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    rowKey="name"
                />
            </Card>
        );
    }

    //orders data in the table (to the same format as in the old config) and parses dates to correct format
    parseData(data) {
        const msg = this.props.msg;
        let tableData = [];
        tableData.push({ name: 'Name', value: this.props.match.params.name });
        let orderedKeys = [
            'type',
            'status',
            'owner',
            'location',
            'n_shards',
            'registered',
            'last_updated',
            'last_import_time',
            'dropped'
        ];
        if (data) {
            for (const key of orderedKeys) {
                if ((key == 'registered' || key == 'dropped') && data[key]) {
                    data[key] = myw.Util.formatDate(data[key]);
                } else if (key == 'last_import_time' && data[key]) {
                    data[key] =
                        myw.Util.formatDate(data[key]) + ' (update ' + data.last_import + ')';
                } else if (key == 'last_updated' && data[key]) {
                    data[key] =
                        myw.Util.formatDate(data.last_updated) +
                        ' (update ' +
                        data.master_update +
                        ')';
                } else if (!data[key]) {
                    data[key] = '-';
                }
                let temp = {
                    name: msg(key),
                    value: data[key]
                };
                tableData.push(temp);
            }
        }
        return tableData;
    }
}
