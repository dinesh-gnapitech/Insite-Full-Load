import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { NetworksTable } from './NetworksTable';
import { NetworkPanel } from './NetworkPanel';
import { breadcrumb, localise, CommonListingView, utils } from '../../shared';

@inject('store')
@localise('networks')
@breadcrumb
@observer
export class NetworksView extends Component {
    state = {
        filter: '',
        sortedColKey: 'name',
        sortOrder: 'ascend'
    };

    render() {
        const { history, msg } = this.props;

        return (
            <Switch>
                <Route
                    exact
                    path="/networks"
                    render={() => (
                        <CommonListingView
                            title={'Networks'}
                            storeName={'networkStore'}
                            resource="networks"
                            table={NetworksTable}
                            history={history}
                            msg={msg}
                            topOffset={140}
                            bottomOffset={10}
                            filter={this.state.filter}
                            onFilterChange={value => utils.onFilterChange(value, this)}
                            owner={this}
                            showLangSelect={true}
                        />
                    )}
                />

                <Route
                    path="/networks/:id/edit"
                    render={routeProps => {
                        return (
                            <NetworkPanel {...routeProps} edit={true} resourceName={'Network'} />
                        );
                    }}
                />

                <Route
                    path="/networks/new"
                    render={routeProps => <NetworkPanel {...routeProps} resourceName={'Network'} />}
                />
            </Switch>
        );
    }
}
