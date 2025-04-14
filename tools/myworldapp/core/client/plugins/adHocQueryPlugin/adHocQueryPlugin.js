// Copyright: IQGeo Limited 2010-2023
import { AdHocQueryDialog } from './adHocQueryDialog';
import { BuildQueryLink } from './buildQueryLink';
import { Plugin } from 'myWorld/base';

export class AdHocQueryPlugin extends Plugin {
    static {
        this.mergeOptions({});
    }

    /**
     * @class Provides ad-hoc query functionality for myWorld features <br/>
     * Adds a link in the search control exampleView used to launch the dialog
     * @param  {Application}   owner    The application
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        this.plugin_name = 'ad_hoc_query';

        this.map = this.app.map;
    }

    /*
     * @param {SearchExamplesView} containerClass
     * @returns A link to launch the Ad hoc query dialog
     */
    buildQueryLink(containerClass) {
        return new BuildQueryLink(this, { containerClass: containerClass });
    }

    /**
     * Adds the html for the adHocQuery dialog in the map container
     */
    createDialog() {
        return new AdHocQueryDialog(this);
    }

    /**
     * Handler for click event on the toolbar button
     * Toggles the adHocQuery dialog open and close
     */
    toggleMode() {
        if (!this.adHocQueryDialog) this.adHocQueryDialog = this.createDialog();
        const mode = !this.adHocQueryDialog.isOpen();
        this.adHocQueryDialog.toggle(mode);
    }
}
