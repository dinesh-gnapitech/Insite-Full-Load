import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { localise, SortableTableBuilder } from '../../shared';

@withRouter
@inject('store')
@localise('applications')
@observer
export class ApplicationsTable extends Component {
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
                    {
                        title: msg('description'),
                        dataIndex: 'description',
                        key: 'description',
                        render: (text, rec) =>
                            store.settingsStore.getLocalisedValFor(text, currentLang)
                    },
                    {
                        title: msg('javascript_file'),
                        dataIndex: 'javascript_file',
                        key: 'javascript_file'
                    }
                ]}
                dataSource={this.props.data} //We don't want to show the config app on this page
                pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                rowKey="id"
                onRow={record => {
                    return {
                        onClick: () => {
                            this.props.history.push(`/applications/${record.id}/edit`);
                        }
                    };
                }}
            />
        );
    }
}
