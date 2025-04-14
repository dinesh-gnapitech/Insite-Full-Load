import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { Card, Table } from 'antd';

@inject('store')
@observer
export class SettingsTab extends Component {
    componentDidMount() {
        this.props.store.settingsStore.getAll();
    }

    render() {
        let data = this.props.store.settingsStore.replicaSettings || [];
        const { msg } = this.props;
        return (
            <Card title={msg('settings')} bordered={false}>
                <Table
                    className="myw-list-view"
                    loading={this.props.loading}
                    size="small"
                    showHeader={false}
                    columns={[
                        { title: 'Name', dataIndex: 'name', key: 'name' },
                        { title: 'Value', dataIndex: 'value', key: 'value' }
                    ]}
                    dataSource={data}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    rowKey="name"
                />
            </Card>
        );
    }
}
