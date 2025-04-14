// Copyright: IQGeo Limited 2010-2023
import { template } from 'underscore';
import $ from 'jquery';
import myw, { msg } from 'myWorld-base';
import { Control, ModuleInfoDialog } from 'myWorld/controls';
import helpHtml from 'text!html/help.htm';
import { renderReactNode } from 'myWorld/uiComponents/react';
import { HelpList } from './react';

export class HelpPanel extends Control {
    static {
        this.mergeOptions({
            user_guides: [] //module user guide config list with items in the [name_id , link] format e.g : [['network_manager_guide', '/modules/comms/doc/user-guide.html']]
        });
        this.prototype.messageGroup = 'help';
        this.prototype.innerTemplate = template(helpHtml);
    }

    constructor(owner, options) {
        super(owner, options);

        //The template creates the Search, Select and Display info graphic
        this.$el.html(this.innerTemplate({ baseUrl: myw.baseUrl }));
        myw.translate('help', this.$el);
        this._asyncInit();
    }

    async _asyncInit() {
        //Get all the module, platform and schema versions
        const modules = await this.app.system.getModuleInfo();
        const moduleInfoList = this.getModuleInfo(modules);

        const platformV = `Platform: ${myw.version}`;
        const schemaVersion = await this.app.system.getSchemaVersion();
        const dbV = `${this.msg('db_version_lbl')} ${schemaVersion}`;
        const appV = myw.appVersion ? `App: ${myw.appVersion}` : '';

        const versionInfoList = [...moduleInfoList, platformV, dbV, appV];

        //Create a react component to display a list of help links
        this.renderReact(versionInfoList, modules);

        this.setPanelHeight();
        $(window).resize(() => {
            this.setPanelHeight();
        });
    }

    /**
     * Renders a list of help links using react js
     * @param {array} versionInfo List of all the module, platform and schema versions
     * @param {object} modules    Contains info on all the modules installed
     */
    renderReact(versionInfo, modules) {
        renderReactNode(this.$('.help-info')[0], HelpList, {
            owner: this,
            versionInfo,
            showPatches: !this.app.system.settings.hide_patches,
            handlePatchLinkClick: this.showPatchInfo.bind(this, modules)
        });
    }

    /*
     * Sets the help panel height according to the window height
     */
    setPanelHeight() {
        const windowHeight = $(window).height();
        this.$el.height(windowHeight - 140);
    }

    // get an info message for the modules
    getModuleInfo(modules) {
        if (!modules) return '';
        let moduleInfo = [];
        for (const [moduleName, module] of Object.entries(modules)) {
            const version = { module };
            if (!version || moduleName === 'core') continue;
            const modV = `${moduleName}: ${module.version}`;
            this.$('.versionInfo').append(modV);
            moduleInfo.push(modV);
        }
        return moduleInfo;
    }

    // Show an info message
    showPatchInfo(moduleInfo) {
        this.infoDialog = new ModuleInfoDialog(moduleInfo, {
            title: msg('help', 'installed_patches')
        });
    }
}

export default HelpPanel;
