import React, { Component } from 'react';
import myw from 'myWorld-base';
import { Switch, Route, Link } from 'react-router-dom';
import { inject, observer } from 'mobx-react';
import { HomeView } from './views/Home';
import {
    ApplicationsView,
    RolesView,
    UsersView,
    FeaturesView,
    PickListsView,
    LayersView,
    NetworksView,
    DatasourcesView,
    SettingsView,
    NotificationsView,
    UploadView,
    ReplicationView
} from './views';
import { HelpMenu } from './shared/HelpMenu';
import { DragDropContext } from 'react-dnd';
import HTML5Backend from 'react-dnd-html5-backend';
import { localise } from './shared';

//expose datasources to myw so they can be used in custom datasources
import * as datasources from 'myWorld/datasources';
Object.assign(myw, datasources);

@DragDropContext(HTML5Backend)
@inject('store')
@localise('home')
@observer
export class ConfigApp extends Component {
    constructor(props) {
        super(props);
        this.state = {
            localisationLoaded: false
        };
    }

    async componentDidMount() {
        this.props.store.currentUserStore.getUser();
        await this.props.store.settingsStore.getSystemLangs();
        const languages = this.props.store.settingsStore.languages;
        myw.localisation.init(['myw.config'], { languages });

        await myw.localisation.ready;
        this.setState({ localisationLoaded: true });
    }

    render() {
        const { currentUser } = this.props.store.currentUserStore;
        const { name, path } = this.props.store.breadcrumbStore.current;
        const { msg } = this.props;
        const { localisationLoaded } = this.state;

        if (!localisationLoaded) return null;

        return (
            <>
                <div className="header" style={{ minWidth: '860px' }}>
                    <ul className="breadcrumb">
                        <li>
                            <Link to={'/'}>{msg('configuration')}</Link>
                        </li>
                        {path ? (
                            <li>
                                <Link to={path}>{name}</Link>
                            </li>
                        ) : null}
                    </ul>
                    <a
                        href="./index"
                        id="logo"
                        className="right"
                        title={msg('home_page')}
                        onClick={this.handleLogoClick}
                    />
                </div>
                <div className="container" style={{ minWidth: '830px' }}>
                    <Switch>
                        <Route exact path="/" component={HomeView} />
                        <Route path="/applications" component={ApplicationsView} />
                        <Route path="/roles" component={RolesView} />
                        <Route path="/users" component={UsersView} />
                        <Route path="/features" component={FeaturesView} />
                        <Route path="/enumerators" component={PickListsView} />
                        <Route path="/layers" component={LayersView} />
                        <Route path="/networks" component={NetworksView} />
                        <Route path="/datasources" component={DatasourcesView} />
                        <Route path="/settings" component={SettingsView} />
                        <Route path="/notifications" component={NotificationsView} />
                        <Route path="/upload" component={UploadView} />
                        <Route path="/replicas" component={ReplicationView} />
                    </Switch>
                </div>
                <div className="footer">
                    <div className="left-section">
                        {currentUser}{' '}
                        <a href="logout" id="logout-link">
                            {msg('logout')}
                        </a>
                    </div>
                    <div className="center-section">
                        <span className="iqgeo-small-logo" id="built-by-footer">
                            {msg('built_by')}
                        </span>
                    </div>
                    <div className="right-section">
                        <HelpMenu />
                    </div>
                </div>
            </>
        );
    }

    handleLogoClick = event => {
        //go to home page, keeping language parameter
        event.preventDefault();
        var homeLocation = 'index';
        var lang = myw.Util.getUrlParam('lang');
        if (lang) homeLocation += '?lang=' + lang;

        window.location.href = homeLocation;
    };
}
