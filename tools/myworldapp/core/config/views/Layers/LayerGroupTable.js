import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { SortableTableBuilder, localise } from '../../shared';
import { CheckOutlined } from '@ant-design/icons';

@withRouter
@inject('store')
@localise('layergroups')
@observer
export class LayerGroupTable extends Component {
    render() {
        const { msg, store } = this.props;
        const tick = (value, item) => (value ? <CheckOutlined /> : '');
        const currentLang = store.settingsStore.currentLang;
        return (
            <SortableTableBuilder
                loading={this.props.loading}
                size="small"
                columns={[
                    {
                        title: msg('name'),
                        dataIndex: 'name',
                        key: 'name',
                        render: text => <b>{text}</b>
                    },
                    {
                        title: msg('display_name'),
                        dataIndex: 'display_name',
                        key: 'display_name',
                        render: (text, rec) =>
                            store.settingsStore.getLocalisedValFor(text, currentLang)
                    },
                    {
                        title: msg('description'),
                        dataIndex: 'description',
                        key: 'description',
                        render: (text, rec) =>
                            store.settingsStore.getLocalisedValFor(text, currentLang)
                    },
                    {
                        title: msg('exclusive'),
                        dataIndex: 'exclusive',
                        key: 'exclusive',
                        render: tick,
                        type: 'boolean'
                    },
                    {
                        title: msg('layers'),
                        dataIndex: 'layers',
                        key: 'layers',
                        render: (text, rec) => rec.layers.length
                    }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/layers/layergroups/${record.id}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
