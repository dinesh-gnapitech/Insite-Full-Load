import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { NotificationsTable } from './NotificationsTable';
import { CommonListingView, CommonFormView } from '../../shared';
import { NotificationForm } from './NotificationForm';
import { breadcrumb, localise, utils } from '../../shared';

@inject('store')
@localise('notifications')
@breadcrumb
@observer
export class NotificationsView extends Component {
    state = {
        filter: '',
        sortedColKey: 'id',
        sortOrder: 'ascend'
    };

    render() {
        const { history, msg } = this.props;

        return (
            <Switch>
                <Route
                    exact
                    path="/notifications"
                    render={() => (
                        <CommonListingView
                            title={'Notifications'}
                            resource="notifications"
                            storeName={'notificationStore'}
                            table={NotificationsTable}
                            history={history}
                            msg={msg}
                            topOffset={145}
                            filter={this.state.filter}
                            onFilterChange={value => utils.onFilterChange(value, this)}
                            owner={this}
                        />
                    )}
                />

                <Route
                    path="/notifications/new"
                    render={() => (
                        <CommonFormView
                            resourceName={'Notification'}
                            resource={'notifications'}
                            storeName={'notificationStore'}
                            history={history}
                            form={NotificationForm}
                            msg={msg}
                        />
                    )}
                />

                <Route
                    path="/notifications/:id/edit"
                    component={() => (
                        <CommonFormView
                            edit
                            resourceName={'Notification'}
                            resource={'notifications'}
                            storeName={'notificationStore'}
                            history={history}
                            form={NotificationForm}
                            msg={msg}
                        />
                    )}
                />
            </Switch>
        );
    }
}
