import React, { Component } from 'react';
import { LinkBox } from './LinkBox';
import { localise } from '../../shared';
import { inject } from 'mobx-react';
import applicationsImg from 'images/config_applications_green.svg';
import rolesImg from 'images/config_roles_green.svg';
import usersImg from 'images/config_users_green.svg';
import featuresImg from 'images/config_features_green.svg';
import enumsImg from 'images/config_enumerators_green.svg';
import layersImg from 'images/config_layers_green.svg';
import networksImg from 'images/config_networks_green.svg';
import datasourcesImg from 'images/config_datasources_green.svg';
import settingsImg from 'images/config_settings_green.svg';
import notificationsImg from 'images/config_notifications_green.svg';
import uploadImg from 'images/config_upload_green.svg';
import replicaImg from 'images/config_replica_green.svg';

@inject('store')
@localise('main')
export class HomeView extends Component {
    constructor(props) {
        super(props);
    }

    async componentDidMount() {
        const { permissionStore } = this.props.store;
        await permissionStore.getUserPermissions();
        this.forceUpdate();
    }

    render() {
        let index = 0;
        const row1 = [
            this._generateLinkBox(
                index++,
                'applications',
                '/applications',
                'applications',
                applicationsImg
            ),
            this._generateLinkBox(index++, 'roles', '/roles', 'roles', rolesImg),
            this._generateLinkBox(index++, 'users', '/users', 'users', usersImg)
        ].filter(row => row !== null);

        const row2 = [
            this._generateLinkBox(index++, 'features', '/features', 'features', featuresImg),
            this._generateLinkBox(index++, 'enumerators', '/enumerators', 'enumerators', enumsImg),
            this._generateLinkBox(index++, 'layers', '/layers/layers', 'layers', layersImg),
            this._generateLinkBox(index++, 'networks', '/networks', 'networks', networksImg),
            this._generateLinkBox(
                index++,
                'datasources',
                '/datasources',
                'datasources',
                datasourcesImg
            )
        ].filter(row => row !== null);

        const row3 = [
            this._generateLinkBox(index++, 'settings', '/settings', 'settings', settingsImg),
            this._generateLinkBox(
                index++,
                'notifications',
                '/notifications',
                'notifications',
                notificationsImg
            ),
            this._generateLinkBox(index++, 'upload', '/upload', 'upload', uploadImg),
            this._generateLinkBox(index++, 'replicas', '/replicas', 'replication', replicaImg)
        ].filter(row => row !== null);

        return (
            <div id="menuView">
                {row1}
                {row1.length ? <br /> : null}
                {row2}
                {row2.length ? <br /> : null}
                {row3}
            </div>
        );
    }

    _generateLinkBox(key, right, to, label, icon) {
        const { msg, store } = this.props;
        const permissions = store.permissionStore.curUserPerms;
        return permissions[right] ? (
            <LinkBox key={key} to={to} label={msg(label)} icon={icon} />
        ) : null;
    }
}
