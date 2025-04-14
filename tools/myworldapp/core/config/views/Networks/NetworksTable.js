import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { localise, SortableTableBuilder } from '../../shared';
import { CheckOutlined } from '@ant-design/icons';

@localise('networks')
@inject('store')
@withRouter
@observer
export class NetworksTable extends Component {
    render() {
        const { msg, store } = this.props;
        const currentLang = store.settingsStore.currentLang;
        return (
            <SortableTableBuilder
                {...this.props}
                size="small"
                columns={[
                    { title: msg('name'), dataIndex: 'name', key: 'name' },
                    {
                        title: msg('external_name'),
                        dataIndex: 'external_name',
                        key: 'external_name',
                        render: (text, rec) =>
                            store.settingsStore.getLocalisedValFor(text, currentLang)
                    },
                    {
                        title: msg('description'),
                        dataIndex: 'description',
                        key: 'description',
                        sorter: (a, b) => ('' + a.description).localeCompare(b.description)
                    },
                    { title: msg('topology'), dataIndex: 'topology', key: 'topology' },
                    {
                        title: msg('directed'),
                        dataIndex: 'directed',
                        key: 'directed',
                        className: 'text-center',
                        render: (text, item) => (item.directed ? <CheckOutlined /> : ''),
                        type: 'boolean'
                    },
                    { title: msg('engine'), dataIndex: 'engine', key: 'engine' }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/networks/${record.name}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
