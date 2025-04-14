import React, { Component } from 'react';
import { Tabs } from 'antd';
import { FeaturesTab } from './FeaturesTab';
import { inject, observer } from 'mobx-react';
import { localise } from '../../shared';
import { datasourceTypes } from 'myWorld/datasources';

@inject('store')
@localise('features')
@observer
export class FeaturesDsTabs extends Component {
    state = {
        currentDsTab: 'myworld',
        mode: 'summary'
    };

    componentDidMount() {
        this.props.store.datasourceStore.getAll();
        this.props.store.permissionStore.getUserPermissions();
        this.setState({ currentDsTab: this.props.match.params.dsname || 'myworld' });
    }

    render() {
        const { msg, mode, onModeChange, filter, onFilterChange, sort, onSortingChange } =
            this.props;

        const datasources = this.props.store.datasourceStore.store;
        if (!datasources) return null;
        const permissions = this.props.store.permissionStore.curUserPerms;
        const hasManagePerm = permissions['features'];

        const dsNames = Object.values(datasources)
            .filter(ds => datasourceTypes[ds.type]?.supportsFeatureDefs)
            .map(ds => ds.name)
            .sort((a, b) => {
                if (a == 'myworld') return -1;
                if (b == 'myworld') return 1;
                return a < b ? -1 : a > b ? 1 : 0;
            });
        const activeKey = this.props.match.params.dsname || this.props.currentTabId || dsNames[0];
        return (
            <Tabs
                activeKey={activeKey}
                onChange={item => {
                    this.props.onTabChange(item);
                    this.updateCurrentDsTab(item);
                }}
                animated={false}
                items={dsNames.map((dsName, index) => {
                    const dsType = datasources[dsName].type;
                    const dsClass = datasourceTypes[dsType];
                    return {
                        label: dsName,
                        key: dsName,
                        children: (
                            <FeaturesTab
                                dsName={dsName}
                                dsClass={dsClass}
                                msg={msg}
                                mode={mode}
                                onModeChange={onModeChange}
                                filter={filter[dsName]}
                                onFilterChange={onFilterChange}
                                hasManagePerm={hasManagePerm}
                                sort={sort[dsName]}
                                onSortingChange={onSortingChange}
                                active={activeKey === dsName}
                            />
                        )
                    };
                })}
            />
        );
    }

    updateCurrentDsTab = activeKey => {
        this.setState({ currentDsTab: activeKey });
        this.props.history.push(`/features/${activeKey}`);
        // If switching to a tab without filters, set tab to summary
        if (activeKey != 'myworld' && this.props.mode == 'filters') {
            this.props.onModeChange('summary');
        }
    };
}
