import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { SortableTableBuilder } from '../../shared';
import { localise } from '../../shared';

@withRouter
@inject('store')
@localise('layers')
@observer
export class LayersTable extends Component {
    render() {
        const { msg, store } = this.props;
        const currentLang = store.settingsStore.currentLang;
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    { title: msg('name'), dataIndex: 'name', key: 'name' },
                    {
                        title: msg('display_name'),
                        dataIndex: 'display_name',
                        key: 'display_name',
                        render: (text, rec) =>
                            store.settingsStore.getLocalisedValFor(text, currentLang)
                    },
                    { title: msg('category'), dataIndex: 'category', key: 'category' },
                    { title: msg('datasource'), dataIndex: 'datasource', key: 'datasource' },
                    { title: msg('type'), dataIndex: 'type', key: 'type' },
                    {
                        title: msg('code'),
                        dataIndex: 'code',
                        key: 'code'
                    },
                    {
                        title: msg('min_vis'),
                        dataIndex: 'min_scale',
                        key: 'min_scale',
                        type: 'number'
                    },
                    {
                        title: msg('max_vis'),
                        dataIndex: 'max_scale',
                        key: 'max_scale',
                        type: 'number'
                    },
                    {
                        title: msg('render_order'),
                        dataIndex: 'render_order',
                        key: 'render_order',
                        type: 'number'
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/layers/${record.id}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
