import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { DatasourcesTable } from './DatasourcesTable';
import { DatasourceForm } from './DatasourceForm';
import { breadcrumb, localise, CommonListingView, CommonFormView, utils } from '../../shared';

@inject('store')
@localise('datasources')
@breadcrumb
@observer
export class DatasourcesView extends Component {
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
                    path="/datasources/new"
                    render={() => (
                        <CommonFormView
                            resourceName={msg('datasource')}
                            resource="datasources"
                            storeName={'datasourceStore'}
                            history={history}
                            form={DatasourceForm}
                            msg={msg}
                            showLangSelect={true}
                        />
                    )}
                />

                <Route
                    edit
                    path="/datasources/:id/edit"
                    render={() => (
                        <CommonFormView
                            edit
                            resourceName={msg('datasource')}
                            resource="datasources"
                            storeName={'datasourceStore'}
                            history={history}
                            form={DatasourceForm}
                            msg={msg}
                            showLangSelect={true}
                        />
                    )}
                />
                <Route
                    exact
                    path="/datasources"
                    render={() => (
                        <CommonListingView
                            title={msg('datasources')}
                            storeName={'datasourceStore'}
                            resource="datasources"
                            table={DatasourcesTable}
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
            </Switch>
        );
    }
}
