import React, { Component } from 'react';
import { Tabs } from 'antd';
import { inject, observer } from 'mobx-react';
import { LayerListTab } from './LayerListTab';
import { LayerGroupsTab } from './LayerGroupsTab';
import { localise } from '../../shared';

@inject('store')
@localise('layers')
@observer
export class LayerTabsView extends Component {
    render() {
        const {
            history,
            msg,
            groupsFilter,
            layersFilter,
            onLayerFilterChange,
            onGroupsFilterChange
        } = this.props;

        return (
            <Tabs
                animated={false}
                onChange={item => {
                    this.props.onTabChange(item);
                    history.push(`/layers/${item}`);
                }}
                defaultActiveKey={
                    this.props.match.params.tab || this.props.currentTabId || 'layers'
                }
                items={[
                    {
                        label: msg('layers'),
                        key: 'layers',
                        children: (
                            <LayerListTab
                                tab={msg('layers')}
                                key="layers"
                                history={history}
                                msg={msg}
                                filter={layersFilter}
                                onFilterChange={onLayerFilterChange}
                            />
                        )
                    },
                    {
                        label: msg('groups'),
                        key: 'layergroups',
                        children: (
                            <LayerGroupsTab
                                tab={msg('groups')}
                                key="layergroups"
                                history={history}
                                msg={msg}
                                filter={groupsFilter}
                                onFilterChange={onGroupsFilterChange}
                            />
                        )
                    }
                ]}
            />
        );
    }
}
