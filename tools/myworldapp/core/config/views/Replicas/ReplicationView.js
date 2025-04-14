import React, { Component } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { ReplicationPage } from './ReplicationPage';
import { ReplicaTable } from './Replica/ReplicaTable';
import { ExtractForm } from './Extract/ExtractForm';
import { DownloadForm } from './Download/DownloadForm';
import { RoleForm } from './Download/RoleForm';
import { TableSetFormComponent } from './TableSetsTab/TableSetForm';
import { breadcrumb, CommonFormView, localise, utils } from '../../shared';
import { ExtractFormView } from './Extract/ExtractFormView';

@inject('store')
@localise('replicas')
@breadcrumb
@observer
export class ReplicationView extends Component {
    state = {
        tableSetsFilter: '',
        extractsFilter: '',
        downloadsFilter: '',
        replicationFilter: '',
        currentTabId: '',
        downloadsMode: 'by_extracts'
    };

    componentDidMount() {
        this.props.store.settingsStore.getAll();
    }

    render() {
        const { history, msg } = this.props;
        return (
            <Switch>
                <Route
                    path="/replicas/tableSets/new"
                    render={routeProps => (
                        <TableSetFormComponent
                            {...routeProps}
                            edit={false}
                            resource={'tablesets'}
                            resourceName={msg('table_set')}
                            history={history}
                            msg={msg}
                            hideUnselectedLayers={false}
                            hideUnselectedTiles={false}
                        />
                    )}
                />
                <Route
                    path="/replicas/tableSets/:name/edit"
                    render={routeProps => (
                        <TableSetFormComponent
                            {...routeProps}
                            edit={true}
                            resource={'tablesets'}
                            resourceName={msg('table_set')}
                            history={history}
                            msg={msg}
                            hideUnselectedLayers={true}
                            hideUnselectedTiles={true}
                        />
                    )}
                />

                <Route
                    path="/replicas/replicas/:name"
                    render={routeProps => (
                        <ReplicaTable {...routeProps} edit={false} history={history} msg={msg} />
                    )}
                />
                <Route
                    path="/replicas/extracts/:id"
                    component={() => (
                        <ExtractFormView
                            edit
                            resource="extracts"
                            resourceName={msg('extract')}
                            storeName={'extractStore'}
                            history={history}
                            form={ExtractForm}
                            msg={msg}
                            showLangSelect={false}
                        />
                    )}
                />
                <Route
                    path="/replicas/downloads/extract/:id"
                    component={() => (
                        <CommonFormView
                            edit
                            resource="downloads"
                            resourceName={msg('download')}
                            storeName={'extractStore'}
                            history={history}
                            form={DownloadForm}
                            msg={msg}
                            showLangSelect={false}
                            showDuplicateBtn={false}
                            showDeleteBtn={false}
                        />
                    )}
                />
                <Route
                    path="/replicas/downloads/role/:id"
                    component={() => (
                        <CommonFormView
                            edit
                            resource="downloads"
                            resourceName={msg('role_downloads')}
                            storeName={'extractRoleStore'}
                            history={history}
                            form={RoleForm}
                            msg={msg}
                            showLangSelect={false}
                            showDuplicateBtn={false}
                            showDeleteBtn={false}
                        />
                    )}
                />

                <Route
                    path="/replicas/:tab"
                    render={routeProps => (
                        <ReplicationPage
                            {...routeProps}
                            msg={msg}
                            tableSetsFilter={this.state.tableSetsFilter}
                            onTableSetsFilterChange={value =>
                                utils.onFilterChange(value, this, 'tableSetsFilter')
                            }
                            extractsFilter={this.state.extractsFilter}
                            onExtractsFilterChange={value =>
                                utils.onFilterChange(value, this, 'extractsFilter')
                            }
                            downloadsFilter={this.state.downloadsFilter}
                            onDownloadsFilterChange={value =>
                                utils.onFilterChange(value, this, 'downloadsFilter')
                            }
                            replicationFilter={this.state.replicationFilter}
                            onReplicationFilterChange={value =>
                                utils.onFilterChange(value, this, 'replicationFilter')
                            }
                            currentTabId={this.state.currentTabId}
                            onTabChange={tabId => this.setState({ currentTabId: tabId })}
                            downloadsMode={this.state.downloadsMode}
                            onDownloadsModeChange={downloadsMode =>
                                this.setState({ downloadsMode })
                            }
                        />
                    )}
                />

                <Redirect to={`/replicas/${this.state.currentTabId || 'settings'}`} />
            </Switch>
        );
    }
}
