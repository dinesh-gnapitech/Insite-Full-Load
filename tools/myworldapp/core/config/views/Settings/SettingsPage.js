import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { Tabs } from 'antd';
import { SystemTab } from './SystemTab';
import { StreetViewTable } from './StreetView';
import { AdvancedTab } from './Advanced';
import { localise } from '../../shared';
import myw from 'myWorld-base';

myw.configSettingsPages = {};
myw.configSettingsPages['core.streetview'] = StreetViewTable;
myw.configSettingsPages['core.system'] = SystemTab;
myw.configSettingsPages['core.advanced'] = AdvancedTab;

@inject('store')
@localise('settings')
@observer
export class SettingsPage extends Component {
    constructor(props) {
        super(props);

        this.state = {
            localisationLoaded: false //localisation of modules supplying tabs
        };
    }

    async componentDidMount() {
        const store = this.props.store.settingsStore;
        await store.getAll();
        if (store.query) this.setState({ filter: store.query });

        //ensure loading of localisation files of modules supplying tabs
        //get modules
        let modules = Object.keys(myw.configSettingsPages).map(key => {
            const parts = key.split('.');
            return parts.length > 1 && parts[0] != 'core' ? parts[0] : undefined;
        });
        modules = [...new Set(modules)].filter(Boolean);

        //load msg files for each of the modules
        await Promise.all(
            modules.map(moduleName => myw.localisation.loadModuleLocale(moduleName, 'config'))
        );

        this.setState({ localisationLoaded: true });
    }

    render() {
        const { history, msg, filter, onFilterChange, onTabChange, sort, onSortingChange } =
            this.props;
        const { localisationLoaded } = this.state;
        if (!localisationLoaded) return null;

        const tabs = myw.configSettingsPages;
        const tabItems = [];
        this.settingsTabIds.map(tabId => {
            const Tab = tabs[tabId];
            if (!Tab) return;
            tabItems.push({
                label: msg(tabId + '_tab_title'),
                key: tabId,
                children: (
                    <Tab
                        msg={msg}
                        localisationLoaded={localisationLoaded}
                        filter={filter}
                        onFilterChange={onFilterChange}
                        tabKey={tabId}
                        sort={sort}
                        onSortingChange={onSortingChange}
                    />
                )
            });
        });
        return (
            <div>
                <Tabs
                    animated={false}
                    onChange={item => {
                        onTabChange(item);
                        history.push(`/settings/${item}`);
                    }}
                    activeKey={
                        this.props.match.params.tab ||
                        this.props.currentTabId ||
                        this.settingsTabIds[0]
                    }
                    items={tabItems}
                />
            </div>
        );
    }

    // returns in order the ids of the tabs to show
    get settingsTabIds() {
        const settings = this.props.store.settingsStore.store;
        const settingsPages = settings['core.configSettingsPages'];
        const configSettingsTabIds = settingsPages?.value && JSON.parse(settingsPages.value);
        return configSettingsTabIds || Object.keys(myw.configSettingsPages);
    }
}
