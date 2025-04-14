import React, { Component } from 'react';
import { Tabs } from 'antd';
import { inject, observer } from 'mobx-react';
import { SettingsTab } from './SettingsTab';
import { TableSetsTab } from './TableSetsTab';
import { ExtractsTab } from './ExtractsTab';
import { DownloadsTab } from './DownloadsTab';
import { ReplicasTab } from './ReplicasTab';
import { localise } from '../../shared';

@inject('store')
@localise('replicas')
@observer
export class ReplicationPage extends Component {
    render() {
        const {
            history,
            msg,
            tableSetsFilter,
            onTableSetsFilterChange,
            extractsFilter,
            onExtractsFilterChange,
            downloadsFilter,
            onDownloadsFilterChange,
            replicationFilter,
            onReplicationFilterChange
        } = this.props;
        const tabItems = [
            {
                label: msg('settings'),
                key: 'settings',
                children: <SettingsTab history={history} msg={msg} />
            },
            {
                label: msg('table_sets'),
                key: 'tableSets',
                children: (
                    <TableSetsTab
                        history={history}
                        msg={msg}
                        filter={tableSetsFilter}
                        onFilterChange={onTableSetsFilterChange}
                    />
                )
            },
            {
                label: msg('extracts'),
                key: 'extracts',
                children: (
                    <ExtractsTab
                        history={history}
                        msg={msg}
                        filter={extractsFilter}
                        onFilterChange={onExtractsFilterChange}
                    />
                )
            },
            {
                label: msg('downloads'),
                key: 'downloads',
                children: (
                    <DownloadsTab
                        history={history}
                        msg={msg}
                        filter={downloadsFilter}
                        onFilterChange={onDownloadsFilterChange}
                        downloadsMode={this.props.downloadsMode}
                        onDownloadsModeChange={this.props.onDownloadsModeChange}
                    />
                )
            },
            {
                label: msg('replicas'),
                key: 'replicas',
                children: (
                    <ReplicasTab
                        history={history}
                        msg={msg}
                        filter={replicationFilter}
                        onFilterChange={onReplicationFilterChange}
                    />
                )
            }
        ];
        return (
            <Tabs
                items={tabItems}
                onChange={item => {
                    this.props.onTabChange(item);
                    history.push(`/replicas/${item}`);
                }}
                animated={false}
                defaultActiveKey={this.props.match.params.tab || 'settings'}
            ></Tabs>
        );
    }
}
