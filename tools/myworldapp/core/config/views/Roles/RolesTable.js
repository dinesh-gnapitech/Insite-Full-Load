import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { localise, SortableTableBuilder } from '../../shared';

@withRouter
@localise('roles')
export class RolesTable extends Component {
    render() {
        const { history, msg } = this.props;

        return (
            <SortableTableBuilder
                {...this.props}
                size="small"
                columns={[
                    {
                        title: msg('name'),
                        dataIndex: 'name',
                        key: 'name',
                        render: text => <b>{text}</b>,
                        defaultSortOrder: 'ascend'
                    },
                    { title: msg('description'), dataIndex: 'description', key: 'description' }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="id"
                onRow={record => {
                    return {
                        onClick: () => {
                            history.push(`/roles/${record.id}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
