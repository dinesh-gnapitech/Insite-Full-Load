import React, { Component } from 'react';
import { Switch, Route } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { PickListTable } from './PickListTable';
import { CommonListingView, CommonFormView } from '../../shared';
import { PickListForm } from './PickListForm';
import { breadcrumb, localise, utils } from '../../shared';

@inject('store')
@localise('enumerators')
@breadcrumb
@observer
export class PickListsView extends Component {
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
                    path="/enumerators"
                    render={() => (
                        <CommonListingView
                            title={msg('enumerators')}
                            storeName={'enumeratorStore'}
                            resource="enumerators"
                            table={PickListTable}
                            history={history}
                            msg={msg}
                            topOffset={144}
                            filter={this.state.filter}
                            onFilterChange={value => utils.onFilterChange(value, this)}
                            owner={this}
                        />
                    )}
                />

                <Route
                    path="/enumerators/new"
                    render={() => (
                        <CommonFormView
                            resourceName={msg('enumerator')}
                            storeName={'enumeratorStore'}
                            resource="enumerators"
                            history={history}
                            form={PickListForm}
                            msg={msg}
                            showLangSelect={true}
                        />
                    )}
                />

                <Route
                    path="/enumerators/:id/edit"
                    component={() => (
                        <CommonFormView
                            edit
                            resourceName={msg('enumerator')}
                            storeName={'enumeratorStore'}
                            resource="enumerators"
                            history={history}
                            form={PickListForm}
                            msg={msg}
                            showLangSelect={true}
                        />
                    )}
                />
            </Switch>
        );
    }
}
