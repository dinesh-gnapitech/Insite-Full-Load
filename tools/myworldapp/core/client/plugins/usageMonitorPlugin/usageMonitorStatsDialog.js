// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Plugin } from 'myWorld/base';
import { Dialog, TabPanel } from 'myWorld/uiComponents';

export class UsageMonitorStatsDialog extends Plugin {
    constructor(options) {
        super(options.owner, options);
        this.system = options.owner.system;
        this.selectedTab = 0;
        this.panel = $('<div/>');
        this.messageGroup = 'UsageMonitor';
        this.dialog = new Dialog({
            title: this.msg('title'),
            dialogClass: 'usage-monitor-dialog',
            contents: this._renderTabs().$el,
            modal: false,
            buttons: null,
            autoOpen: false,
            width: 400,
            minHeight: 295,
            maxHeight: 500
        });
        this.dialog.render();

        this.system.usageMonitor.on('usageMonitor-log', () => {
            this.dialog.$el.html(this._renderTabs().$el);
        });

        this.app.on('usageMonitorTabs-activeTab', tab => {
            this.selectedTab = tab.id;
        });
    }

    show() {
        this.dialog.$el.dialog('open');
    }

    close() {
        this.dialog.$el.dialog('close');
    }

    _renderTabs() {
        return new TabPanel({
            name: 'usageMonitorTabs',
            app: this.app,
            selected: this.selectedTab,
            tabs: [
                { title: this.msg('config_tab_title'), pane: this._renderConfig() },
                { title: this.msg('session_tab_title'), pane: this._renderSession() },
                { title: this.msg('actions_tab_title'), pane: this._renderApplications() }
            ]
        });
    }

    _renderConfig() {
        const { config } = this.system.usageMonitor;
        let panel = $('<div/>');

        panel.append(
            $(
                `<table>
                <tr>
                    <td><b>${this.msg('resolution_hours_label')}</b></td>
                    <td>${config.resolution_hours}</td>
                </tr>
                <tr>
                    <td><b>${this.msg('update_interval_label')}</b></td>
                    <td>${config.update_interval_mins}</td>
                </tr>
                <tr>
                    <td><b>${this.msg('reporting_level_label')}</b></td>
                    <td>${config.level}</td>
                </tr>
            </table>`
            )
        );
        return { $el: panel };
    }

    _renderSession() {
        const { session } = this.system.usageMonitor;
        let panel = $('<div/>');
        if (!session) return { $el: panel };

        panel.append(
            $(
                `<table>
                <tr>
                    <td><b>${this.msg('session_start_time_label')}</b></td>
                    <td>${new Date(session.created_at).toLocaleString()}</td>
                </tr>
                <tr>
                    <td><b>${this.msg('session_rollover_time_label')}</b></td>
                    <td>${new Date(session.expiry).toLocaleString()}</td>
                </tr>
                <tr>
                    <td><b>${this.msg('session_client_label')}</b></td>
                    <td>${session.client}</td>
                </tr>
            </table>`
            )
        );
        return { $el: panel };
    }

    _renderApplications() {
        const { actions: applications } = this.system.usageMonitor.session;
        if (!applications) return;

        const applicationsPanel = $('<div/>');

        Object.entries(applications).forEach(([applicationName, application]) =>
            applicationsPanel.append(this._renderApplication(applicationName, application))
        );
        return { $el: applicationsPanel };
    }

    _renderApplication(application, operations) {
        const applicationPanel = $('<div/>');
        applicationPanel.append(
            $('<legend/>', { text: `${this.msg('application_label')}: ${application}` })
        );

        const table = $('<table>');

        Object.entries(operations).forEach(([operation, count]) => {
            table.append(
                $(
                    `<tr>
                    <td><b>${operation}</b></td>
                    <td> ${count}</td>
                </tr>`
                )
            );
        });
        applicationPanel.append(table);
        return applicationPanel;
    }
}

export default UsageMonitorStatsDialog;
