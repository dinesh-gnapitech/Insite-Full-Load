import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject } from 'mobx-react';
import { breadcrumb, localise } from '../../shared';
import { FeaturesDsTabs } from './FeaturesDsTabs';
import { FeatureForm } from './FeatureForm';
import { NewFeatureModal } from './NewFeatureModal';

@inject('store') //used by breadcrumb
@localise('features') //used by breadcrumb
@breadcrumb
export class FeaturesView extends Component {
    state = {
        mode: 'summary',
        filter: {},
        currentTabId: '',
        sort: {}
    };
    render() {
        const { mode, filter, sort } = this.state;
        return (
            <Switch>
                <Route path="/features/:dsname/:id/edit" component={FeatureForm} />

                <Route path="/features/:dsname/new" component={NewFeatureModal} />

                <Route
                    path="/features/:dsname"
                    render={routeProps => (
                        <FeaturesDsTabs
                            {...routeProps}
                            mode={mode}
                            onModeChange={mode => this.setState({ mode })}
                            filter={filter}
                            onFilterChange={this.onFilterChange}
                            currentTabId={this.state.currentTabId}
                            onTabChange={tabId => this.setState({ currentTabId: tabId })}
                            sort={sort}
                            onSortingChange={this.onSortingChange}
                        />
                    )}
                />

                <Route
                    exact
                    path="/features/"
                    render={routeProps => (
                        <FeaturesDsTabs
                            {...routeProps}
                            mode={mode}
                            onModeChange={mode => this.setState({ mode })}
                            filter={filter}
                            onFilterChange={this.onFilterChange}
                            currentTabId={this.state.currentTabId}
                            onTabChange={tabId => this.setState({ currentTabId: tabId })}
                            sort={sort}
                            onSortingChange={this.onSortingChange}
                        />
                    )}
                />
            </Switch>
        );
    }
    onFilterChange = (dsName, filterVal) => {
        let filterObj = { ...this.state.filter };
        filterObj[dsName] = filterVal;
        this.setState({ filter: filterObj });
    };

    onSortingChange = (dsName, colKey, sortOrder) => {
        let sortObj = { ...this.state.sort };
        sortObj[dsName] = {
            sortedColKey: colKey,
            sortOrder: sortOrder
        };
        this.setState({ sort: sortObj });
    };
}
