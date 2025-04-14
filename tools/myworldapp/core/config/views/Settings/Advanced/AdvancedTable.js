import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { withRouter } from 'react-router-dom';
import { ScrollableView, localise, SortableTableBuilder } from '../../../shared';

@inject('store')
@localise('settings')
@withRouter
@observer
export class AdvancedSettingsTable extends Component {
    columns = [
        {
            title: this.props.msg('name'),
            dataIndex: 'name',
            key: 'name',
            defaultSortOrder: 'ascend'
        },
        {
            title: this.props.msg('type'),
            dataIndex: 'type',
            key: 'type',
            width: '80px'
        },
        {
            title: this.props.msg('value'),
            dataIndex: 'value',
            key: 'value',
            render: value => {
                return <div style={{ overflow: 'hidden' }}>{value}</div>;
            },
            type: 'alphaNumeric'
        }
    ];

    render() {
        const { data, sort, onSortingChange, tabKey } = this.props;
        const { isLoading } = this.props.store.settingsStore;

        return (
            <ScrollableView topOffset={197}>
                <SortableTableBuilder
                    bordered
                    rowKey="name"
                    loading={isLoading}
                    columns={this.columns}
                    dataSource={data}
                    size="small"
                    onRow={record => {
                        return {
                            onClick: () => {
                                this.props.history.push(
                                    `/settings/core.advanced/${record.name}/edit`
                                );
                            }
                        };
                    }}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    onSortingChange={(...args) => onSortingChange(tabKey, ...args)}
                    sortedColKey={sort ? sort.sortedColKey : null}
                    sortOrder={sort ? sort.sortOrder : null}
                />
            </ScrollableView>
        );
    }
}
