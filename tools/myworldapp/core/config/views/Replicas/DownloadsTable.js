import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { SortableTableBuilder, localise } from '../../shared';
import myw from 'myWorld-base';
import { CheckOutlined } from '@ant-design/icons';

@withRouter
@localise('replicas')
export class DownloadsTable extends Component {
    render() {
        const { msg, data } = this.props;
        const tableData = this.formatDataForTable(data);
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    { title: msg('extract_name'), dataIndex: 'name', key: 'name' },
                    { title: msg('region'), dataIndex: 'region', key: 'region' },
                    { title: msg('table_set'), dataIndex: 'table_set', key: 'table_set' },
                    {
                        title: msg('writable_by_default'),
                        dataIndex: 'writable_by_default',
                        key: 'writable_by_default',
                        className: 'text-center',
                        render: value => (value ? <CheckOutlined /> : ''),
                        type: 'boolean'
                    },
                    {
                        title: msg('expiry_time'),
                        dataIndex: 'expiry_time',
                        key: 'expiry_time',
                        render: value => (value ? myw.Util.formatDate(value) : value)
                    },
                    { title: msg('folder_name'), dataIndex: 'folder_name', key: 'folder_name' },
                    {
                        title: msg('roles'),
                        dataIndex: 'roles',
                        key: 'roles',
                        render: this.formatRoles
                    }
                ]}
                dataSource={tableData}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/replicas/downloads/extract/${record.name}`);
                        }
                    };
                }}
            />
        );
    }

    formatDataForTable(data) {
        const tableData = [];
        data.forEach(extract => {
            const temp = { ...extract };
            if (!temp.roles.includes('all')) temp.roles = [...temp.roles, ...temp.god_roles];
            tableData.push(temp);
        });
        return tableData;
    }

    formatRoles = (value, rec) => (value.length ? value.sort().join(', ') : '');
}
