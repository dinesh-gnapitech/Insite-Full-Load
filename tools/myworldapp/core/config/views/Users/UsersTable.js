import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { localise, SortableTableBuilder } from '../../shared';
import { inject, observer } from 'mobx-react';
import { CheckOutlined } from '@ant-design/icons';

const compareByAlph = (a, b) => {
    if (a > b) {
        return -1;
    }
    if (a < b) {
        return 1;
    }
    return 0;
};
@inject('store')
@withRouter
@localise('users')
@observer
export class UsersTable extends Component {
    render() {
        const { msg, store, data, history } = this.props;
        const roleIdsToNames = store.userStore.roleIdsToNames;
        return (
            <SortableTableBuilder
                {...this.props}
                size="small"
                columns={[
                    {
                        title: msg('username'),
                        dataIndex: 'username',
                        key: 'username',
                        render: text => <b>{text}</b>,
                        defaultSortOrder: 'ascend'
                    },
                    { title: msg('email'), dataIndex: 'email', key: 'email' },
                    {
                        title: msg('roles'),
                        dataIndex: 'roles',
                        key: 'roles',
                        render: (text, rec) => roleIdsToNames(rec.roles),
                        sorter: (a, b) =>
                            compareByAlph(
                                roleIdsToNames(a.roles.slice()),
                                roleIdsToNames(b.roles.slice())
                            )
                    },
                    {
                        title: msg('locked_out'),
                        dataIndex: 'locked_out',
                        key: 'locked_out',
                        className: 'text-center',
                        render: (text, o) => (o.locked_out ? <CheckOutlined /> : ''),
                        type: 'boolean'
                    }
                ]}
                dataSource={data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="id"
                onRow={record => {
                    return {
                        onClick: () => {
                            history.push(`/users/${record.id}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
