import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';

import { inject, observer } from 'mobx-react';
import { ApplicationForm } from './ApplicationForm';
import { ApplicationsTable } from './ApplicationsTable';
import { CommonListingView, CommonFormView, breadcrumb, localise } from '../../shared';
import { utils } from '../../shared';

@inject('store')
@localise('applications')
@breadcrumb
@observer
export class ApplicationsView extends Component {
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
                    path="/applications"
                    render={() => (
                        <CommonListingView
                            title={msg('applications')}
                            storeName={'applicationStore'}
                            resource="applications"
                            table={ApplicationsTable}
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
                    path="/applications/new"
                    render={() => (
                        <CommonFormView
                            resource="applications"
                            resourceName={msg('application')}
                            storeName={'applicationStore'}
                            history={history}
                            form={ApplicationForm}
                            msg={msg}
                            showLangSelect={true}
                        />
                    )}
                />

                <Route
                    path="/applications/:id/edit"
                    component={() => (
                        <CommonFormView
                            edit
                            resource="applications"
                            resourceName={msg('application')}
                            storeName={'applicationStore'}
                            history={history}
                            form={ApplicationForm}
                            msg={msg}
                            showLangSelect={true}
                        />
                    )}
                />
            </Switch>
        );
    }
}
