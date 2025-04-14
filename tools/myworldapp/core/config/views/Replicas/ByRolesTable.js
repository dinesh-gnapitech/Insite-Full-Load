import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { SortableTableBuilder, localise } from '../../shared';

@withRouter
@localise('replicas')
export class ByRolesTable extends Component {
    render() {
        const { msg, data } = this.props;
        const tableData = this.formatDataForTable(data);
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    {
                        title: msg('name'),
                        dataIndex: 'name',
                        key: 'name',
                        render: text => <b>{text}</b>,
                        defaultSortOrder: 'ascend'
                    },
                    {
                        title: msg('extracts'),
                        dataIndex: 'extracts',
                        key: 'extracts',
                        render: this.formatExtracts
                    }
                ]}
                dataSource={tableData}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/replicas/downloads/role/${record.name}`);
                        }
                    };
                }}
            />
        );
    }

    formatDataForTable(data) {
        const tableData = [];
        const allRole = data.find(item => item.name === 'all');
        const extractsInAll = allRole ? allRole.extracts : [];
        data.forEach(role => {
            if (role.name !== 'all') {
                const temp = { ...role };
                if (!temp.extracts.includes('all'))
                    temp.extracts = [...role.extracts, ...extractsInAll];
                tableData.push(temp);
            }
        });
        return tableData;
    }

    formatExtracts = (value, rec) => (value.length ? value.sort().join(', ') : '');
}
