// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Plugin } from 'myWorld/base';
import { UsageMonitorStatsDialog } from './usageMonitorStatsDialog';

export class UsageMonitorPlugin extends Plugin {
    /**
     * @class A debug tool to monitor statistics gathered by the Usage Monitor
     */
    constructor(owner, options) {
        super(owner, options);
        this._asyncInit();
    }

    async _asyncInit() {
        const usageMonitor = this.app.system.usageMonitor;
        await usageMonitor.initialized;
        const active = usageMonitor.config?.active;
        if (!active) return;

        this.app.ready.then(() => {
            this.app.notifyUser({
                plugin: this,
                icon: $('<span/>', { html: 'U', class: 'usage-monitor-launcher' }),
                onClick: this.handleDialogDisplay.bind(this)
            });
        });

        usageMonitor.on('usageMonitor-persist', () => {
            this.app.notifyUser({
                plugin: this,
                icon: $('<span/>', { html: 'U', class: 'usage-monitor-launcher active' }),
                onClick: this.handleDialogDisplay.bind(this)
            });

            setTimeout(() => {
                this.app.notifyUser({
                    plugin: this,
                    icon: $('<span/>', { html: 'U', class: 'usage-monitor-launcher' }),
                    onClick: this.handleDialogDisplay.bind(this)
                });
            }, 1000);
        });

        this.dialog = new UsageMonitorStatsDialog({ owner: this.owner });
    }

    handleDialogDisplay() {
        this.dialog.show();
    }
}

export default UsageMonitorPlugin;
