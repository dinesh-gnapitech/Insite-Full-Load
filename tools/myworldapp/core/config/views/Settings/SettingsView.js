import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { SettingsPage } from './SettingsPage';
import { localise, breadcrumb, CommonFormView } from '../../shared';
import { SettingForm } from './Advanced';

@inject('store')
@localise('settings')
@breadcrumb
@observer
export class SettingsView extends Component {
    state = {
        filter: {},
        sort: {},
        currentTabId: ''
    };
    render() {
        const { filter, currentTabId, sort } = this.state;
        const { history, msg } = this.props;
        const formProps = {
            msg,
            history,
            form: SettingForm,
            resource: 'settings/core.advanced',
            resourceName: msg('setting'),
            storeName: 'settingsStore',
            tabName: 'core.advanced'
        };
        return (
            <Switch>
                <Route path="/settings/:tab/new" render={() => <CommonFormView {...formProps} />} />
                <Route
                    path="/settings/:tab/:id/edit"
                    render={() => <CommonFormView edit {...formProps} />}
                />

                <Route
                    path="/settings/:tab"
                    render={routeProps => (
                        <SettingsPage
                            {...routeProps}
                            filter={filter}
                            onFilterChange={this.onFilterChange}
                            currentTabId={currentTabId}
                            onTabChange={this.onTabChange}
                            sort={sort}
                            onSortingChange={this.onSortingChange}
                        />
                    )}
                />

                <Route
                    exact
                    path="/settings"
                    render={routeProps => (
                        <SettingsPage
                            {...routeProps}
                            filter={filter}
                            onFilterChange={this.onFilterChange}
                            currentTabId={currentTabId}
                            onTabChange={this.onTabChange}
                            sort={sort}
                            onSortingChange={this.onSortingChange}
                        />
                    )}
                />
            </Switch>
        );
    }

    onFilterChange = (tabName, filterVal) => {
        let filterObj = { ...this.state.filter };
        filterObj[tabName] = filterVal;
        this.setState({ filter: filterObj });
    };

    onTabChange = tabId => {
        this.setState({ currentTabId: tabId });
    };

    onSortingChange = (tabId, colKey, sortOrder) => {
        let sortObj = { ...this.state.sort };
        sortObj[tabId] = {
            sortedColKey: colKey,
            sortOrder: sortOrder
        };
        this.setState({ sort: sortObj });
    };
}
