import React, { Component } from 'react';
import { Dropdown } from 'antd';
import myw from 'myWorld-base';
import { withRouter } from 'react-router-dom';
import { localise } from '../shared';

@localise('guides')
@withRouter
export class HelpMenu extends Component {
    constructor(props) {
        super(props);
        this.state = { show: false };
    }

    render() {
        const lang = myw.localisation.language;
        const { msg, location } = this.props;

        const pages = {
            default: `doc/Contents/Installation.htm`,

            applications: `doc/Contents/Config/RolesUsersApps/Applications/Applications.htm`,
            roles: `doc/Contents/Config/RolesUsersApps/Roles/Roles.htm`,
            users: `doc/Contents/Config/RolesUsersApps/Users/Users.htm`,

            features: `doc/Contents/Config/Features.htm`,
            enumerators: `doc/Contents/Config/PickLists.htm`,
            layers: `doc/Contents/Config/Layers/Layers.htm`,
            networks: `doc/Contents/Config/Networks.htm`,
            datasources: `doc/Contents/Config/Datasources.htm`,

            settings: `doc/Contents/Config/Settings.htm`,
            notifications: `doc/Contents/Config/Notifications.htm`,
            upload: `doc/Contents/Config/DataUpload.htm`,
            replicas: `doc/Contents/Config/Replication.htm`
        };

        const locationChunks = location.pathname.split('/').filter(chunk => chunk != '');
        const thisPage = locationChunks[0] in pages ? pages[locationChunks[0]] : pages['default'];
        const items = [
            {
                label: (
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`doc/Contents/Installation.htm?lang=${lang}`}
                    >
                        {msg('install_config_guide')}
                    </a>
                ),
                key: '1'
            },
            {
                label: (
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`doc/Contents/Replication.htm?lang=${lang}`}
                    >
                        {msg('replication_guide')}
                    </a>
                ),
                key: '2'
            },
            {
                label: (
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`doc/Contents/DeveloperGuide.htm?lang=${lang}`}
                    >
                        {msg('developer_guide')}
                    </a>
                ),
                key: '3'
            },
            {
                label: (
                    <a target="_blank" rel="noopener noreferrer" href={`doc/JSApiDoc/index.html`}>
                        {msg('js_api_doc')}
                    </a>
                ),
                key: '4'
            },
            {
                label: (
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`doc/JSAnywhereApiDoc/index.html`}
                    >
                        {msg('anywhere_js_api_doc')}
                    </a>
                ),
                key: '5'
            },
            {
                label: (
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`doc/Contents/UserGuide.htm?lang=${lang}`}
                    >
                        {msg('user_guide')}
                    </a>
                ),
                key: '6'
            },
            {
                label: (
                    <a
                        target="_blank"
                        rel="noopener noreferrer"
                        href={`doc/Contents/ReleaseNotes.htm?lang=${lang}`}
                    >
                        {msg('release_notes')}
                    </a>
                ),
                key: '7'
            },
            { type: 'divider' },
            {
                label: (
                    <a target="_blank" rel="noopener noreferrer" href={`${thisPage}?lang=${lang}`}>
                        {msg('this_page')}
                    </a>
                ),
                key: '8'
            }
        ];

        return (
            <Dropdown menu={{ items }} placement="topRight" style={{ marginRight: 15 }}>
                <a>{msg('help')}</a>
            </Dropdown>
        );
    }
}
