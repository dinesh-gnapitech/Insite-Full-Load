import React, { Component } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { LayerTabsView } from './LayerTabsView';
import { CommonFormView, breadcrumb, localise } from '../../shared';
import { LayerGroupForm } from './LayerGroupForm';
import { LayerForm } from './LayerForm';

@inject('store')
@localise('layers')
@breadcrumb
@observer
export class LayersRouter extends Component {
    render() {
        const { history, msg } = this.props;
        return (
            <Switch>
                <Route
                    path="/layers/new"
                    render={() => <LayerForm history={history} msg={msg} />}
                />

                <Route
                    path="/layers/:id/edit"
                    render={() => <LayerForm edit history={history} msg={msg} />}
                />

                <Route
                    path="/layers/layergroups/new"
                    render={() => (
                        <CommonFormView
                            resourceName={'Layer Group'}
                            storeName={'layerGroupStore'}
                            history={history}
                            form={LayerGroupForm}
                            msg={msg}
                        />
                    )}
                />

                <Route
                    path="/layers/layergroups/:id/edit"
                    render={() => (
                        <CommonFormView
                            edit
                            resourceName={'Layer Group'}
                            storeName={'layerGroupStore'}
                            history={history}
                            form={LayerGroupForm}
                            msg={msg}
                        />
                    )}
                />

                <Route path="/layers/:tab" component={LayerTabsView} msg={msg} />

                <Redirect to="/layers/layers" />
            </Switch>
        );
    }
}
