import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { localise, SortableTableBuilder } from '../../shared';

@withRouter
@inject('store')
@localise('datasources')
@observer
export class DatasourcesTable extends Component {
    render() {
        const { msg, store } = this.props;
        const currentLang = store.settingsStore.currentLang;
        return (
            <SortableTableBuilder
                {...this.props}
                size="small"
                columns={[
                    {
                        title: msg('name'),
                        dataIndex: 'name',
                        key: 'name'
                    },
                    {
                        title: msg('external_name'),
                        dataIndex: 'external_name',
                        key: 'external_name',
                        render: (text, rec) =>
                            store.settingsStore.getLocalisedValFor(text, currentLang)
                    },
                    { title: msg('type'), dataIndex: 'type', key: 'type' }
                ]}
                dataSource={this.props.data}
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="name"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/datasources/${record.name}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
