// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld/base/core';
import { Plugin } from 'myWorld/base';
import { apple } from 'myWorld/base/browser';

/*
 */
export class SoftKeyboardInputPlugin extends Plugin {
    static {
        this.prototype.statePerApp = false;

        this.mergeOptions({
            inputPopupsEnabled: true
        });
    }

    /**
     * @class Displays a toggle button in the footer to disable/enable the use of soft keyboard input on the controls that enable it
     * @extends Plugin
     * @constructs
     */
    constructor(owner, options) {
        super(owner, options);
        if (owner.options.layoutName === 'print') return;
        this.inputPopupsEnabled = this.options.inputPopupsEnabled;
        this.app.setSoftKeyboardInputMode(this.inputPopupsEnabled);
        this.app.ready.then(() => {
            if (myw.isTouchDevice && !apple && !this.app._isRunningSelenium()) {
                this.createFooterBtn();
            }
        });
    }

    toggleState() {
        this.inputPopupsEnabled = !this.inputPopupsEnabled;
        this.app.setSoftKeyboardInputMode(this.inputPopupsEnabled);
        this.createFooterBtn(true);
    }

    /**
     * Adds a button to the footer using the notifications mechanism
     */
    createFooterBtn(showMessage = false) {
        let iconClass = this.inputPopupsEnabled
            ? 'soft-keyboard-input-launcher'
            : 'soft-keyboard-input-launcher inactive';

        let notifyOptions = {
            plugin: this,
            icon: $('<span>', { class: iconClass }),
            onClick: this.toggleState.bind(this)
        };

        if (showMessage) {
            let stateStr = this.inputPopupsEnabled ? this.msg('enabled') : this.msg('disabled');
            notifyOptions['message'] = `${this.msg('state_input_popup', { state: stateStr })}`;
        }

        this.app.notifyUser(notifyOptions);
    }

    /**
     * Returns object with current softKeboardInput mode to be saved in the local state
     */
    getState() {
        return {
            inputPopupsEnabled: this.inputPopupsEnabled
        };
    }
}

export default SoftKeyboardInputPlugin;
