// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld-base';
import printImg from 'images/toolbar/print.svg';

export class PrintPlugin extends Plugin {
    /**
     * @class Print functionality to the application <br/>
     * Adds a button to the toolbar to access the print preview page
     * @param  {Application} owner                       The application
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner) {
        super(owner);
    }

    /**
     * Opens a new window in a new tab passing url parameters
     * @private
     */
    openPrintWindow() {
        let url = `${this.app.name}.html`;
        const urlParams = this.app.getUrlQueryString();
        this.app.saveState(); //Save state to persist delta in print view

        //store sesion variables in local storage to avoid trying to pass them in the url as it go over limit
        const sessionVars = this.app.database.getSessionVars({ includeSystem: false });
        localStorage.setItem('sessionVars', JSON.stringify(sessionVars));

        url = `${url}?${urlParams}&layout=print`;

        window.open(url, '_blank');
    }
}

PrintPlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = printImg;
        }

        action() {
            this.app.recordFunctionalityAccess('core.toolbar.print');
            this.owner.openPrintWindow();
        }
    }
};

export default PrintPlugin;
