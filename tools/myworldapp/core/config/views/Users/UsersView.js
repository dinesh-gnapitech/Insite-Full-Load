import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { CommonListingView, CommonFormView } from '../../shared';
import { UsersTable } from './UsersTable';
import { UserForm } from './UserForm';
import { breadcrumb, localise, utils } from '../../shared';

@inject('store')
@localise('users')
@breadcrumb
@observer
export class UsersView extends Component {
    state = {
        filter: '',
        sortedColKey: 'username',
        sortOrder: 'ascend'
    };

    render() {
        const { history, msg } = this.props;
        const common = { history, msg, resource: 'users', storeName: 'userStore' };
        return (
            <Switch>
                <Route
                    exact
                    path="/users"
                    render={() => (
                        <CommonListingView
                            {...common}
                            title={msg('users')}
                            table={UsersTable}
                            topOffset={144}
                            filter={this.state.filter}
                            onFilterChange={value => utils.onFilterChange(value, this)}
                            owner={this}
                        />
                    )}
                />

                <Route
                    path="/users/new"
                    render={() => (
                        <CommonFormView
                            {...common}
                            resourceName={msg('user')}
                            form={UserForm}
                            checkDuplicate="username"
                        />
                    )}
                />

                <Route
                    path="/users/:id/edit"
                    render={() => (
                        <CommonFormView
                            edit
                            {...common}
                            resourceName={msg('user')}
                            form={UserForm}
                            checkDuplicate="username"
                        />
                    )}
                />
            </Switch>
        );
    }
}
