import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { localise, SortableTableBuilder } from '../../shared';
import { CheckOutlined } from '@ant-design/icons';

@withRouter
@localise('notifications')
export class NotificationsTable extends Component {
    render() {
        const { msg } = this.props;

        return (
            <SortableTableBuilder
                {...this.props}
                size="small"
                columns={[
                    { title: msg('id'), width: 80, dataIndex: 'id', key: 'id', type: 'number' },
                    {
                        title: msg('type'),
                        width: 100,
                        dataIndex: 'type',
                        key: 'type',
                        render: text => <b>{text}</b>
                    },
                    { title: msg('subject'), dataIndex: 'subject', key: 'subject' },
                    { title: msg('details'), dataIndex: 'details', key: 'details' },
                    {
                        title: msg('native'),
                        dataIndex: 'for_native_app',
                        key: 'for_native_app',
                        width: 200,
                        className: 'text-center',
                        render: (text, item) => (text ? <CheckOutlined /> : ''),
                        type: 'boolean'
                    },
                    {
                        title: msg('online'),
                        dataIndex: 'for_online_app',
                        key: 'for_online_app',
                        width: 200,
                        className: 'text-center',
                        render: (text, item) => (text ? <CheckOutlined /> : ''),
                        type: 'boolean'
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="id"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/notifications/${record.id}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
