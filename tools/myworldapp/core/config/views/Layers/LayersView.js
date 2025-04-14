import React, { Component } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { LayerTabsView } from './LayerTabsView';
import { CommonFormView, breadcrumb, localise, utils } from '../../shared';
import { LayerGroupForm } from './LayerGroupForm';
import { LayerForm } from './LayerForm';

@inject('store')
@localise('layers')
@breadcrumb
@observer
export class LayersView extends Component {
    state = {
        layersFilter: '',
        groupsFilter: '',
        currentTabId: ''
    };

    render() {
        const { history, msg } = this.props;
        return (
            <Switch>
                <Route
                    path="/layers/new"
                    render={() => <LayerForm resource="layers" history={history} msg={msg} />}
                />

                <Route
                    path="/layers/:id/edit"
                    render={() => (
                        <LayerForm resource="layers" edit={true} history={history} msg={msg} />
                    )}
                />

                <Route
                    path="/layers/layergroups/new"
                    render={() => (
                        <CommonFormView
                            resource={'layers/layergroups'}
                            resourceName={'Layer Group'}
                            storeName={'layerGroupStore'}
                            history={history}
                            form={LayerGroupForm}
                            msg={msg}
                            tabName={'layergroups'}
                            showLangSelect={true}
                            checkDuplicate="code"
                        />
                    )}
                />

                <Route
                    path="/layers/layergroups/:id/edit"
                    render={() => (
                        <CommonFormView
                            edit
                            resource={'layers/layergroups'}
                            resourceName={'Layer Group'}
                            storeName={'layerGroupStore'}
                            history={history}
                            form={LayerGroupForm}
                            msg={msg}
                            tabName={'layergroups'}
                            showLangSelect={true}
                            checkDuplicate="code"
                        />
                    )}
                />

                <Route
                    path="/layers/:tab"
                    render={routeProps => (
                        <LayerTabsView
                            {...routeProps}
                            msg={msg}
                            layersFilter={this.state.layersFilter}
                            onLayerFilterChange={value =>
                                utils.onFilterChange(value, this, 'layersFilter')
                            }
                            groupsFilter={this.state.groupsFilter}
                            onGroupsFilterChange={value =>
                                utils.onFilterChange(value, this, 'groupsFilter')
                            }
                            currentTabId={this.state.currentTabId}
                            onTabChange={tabId => this.setState({ currentTabId: tabId })}
                        />
                    )}
                />

                <Redirect to={`/layers/${this.state.currentTabId || 'layers'}`} />
            </Switch>
        );
    }
}
