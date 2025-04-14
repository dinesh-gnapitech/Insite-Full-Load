import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { observer, inject } from 'mobx-react';
import { RolesTable } from './RolesTable';
import { CommonListingView, CommonFormView, localise, breadcrumb, utils } from '../../shared';
import { RoleForm } from './RoleForm';

@inject('store')
@localise('roles')
@breadcrumb
@observer
export class RolesView extends Component {
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
                    path="/roles"
                    render={() => (
                        <CommonListingView
                            title={msg('roles')}
                            storeName={'roleStore'}
                            resource="roles"
                            table={RolesTable}
                            history={history}
                            msg={msg}
                            topOffset={140}
                            filter={this.state.filter}
                            onFilterChange={value => utils.onFilterChange(value, this)}
                            owner={this}
                        />
                    )}
                />

                <Route
                    path="/roles/new"
                    render={() => (
                        <CommonFormView
                            resourceName={msg('role')}
                            resource="roles"
                            storeName={'roleStore'}
                            history={history}
                            form={RoleForm}
                            msg={msg}
                        />
                    )}
                />

                <Route
                    path="/roles/:id/edit"
                    render={() => (
                        <CommonFormView
                            edit
                            resourceName={msg('role')}
                            resource="roles"
                            storeName={'roleStore'}
                            history={history}
                            form={RoleForm}
                            msg={msg}
                        />
                    )}
                />
            </Switch>
        );
    }
}
