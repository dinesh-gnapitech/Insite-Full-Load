// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld/base';
import ScaleLine from 'ol/control/ScaleLine';

export class ScaleLinePlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'ScaleLinePlugin';

        this.mergeOptions({
            enabled: true
        });

        // Actions to be used by map context menu
        this.prototype.actions = {
            toggle: {
                //unavailable on mobile devices
                //ENH: detect devices with mouses
                available: !myw.isTouchDevice,
                action: 'toggle',
                checked: 'control'
            }
        };
    }

    /**
     * Creates the Open Layers control and adds it to the application's map.
     * @class   Plugin that adds a control to the map which displays a scale line
     * @param  {Application}    owner       The application
     * @param  {object}         options
     * @param  {boolean}        [options.enabled]  enable plugin true/false
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        if (this.options.enabled) this.enable();
    }

    enable() {
        this.control = this.getControl();
        this.app.map.addControl(this.control);
    }

    disable() {
        this.app.map.removeControl(this.control);
        this.control = null;
    }

    toggle() {
        if (this.control) {
            this.disable();
        } else {
            this.enable();
        }
    }

    /**
     * Returns object with current state details <br/>
     * @return {object}
     */
    getState() {
        return {
            enabled: !!this.control
        };
    }

    /**
     * Set state of control
     * @param  {object}         state
     * @param  {boolean}        [state.enabled]  enable plugin true/false
     */
    setState(state) {
        if (state.enabled === true) {
            this.enable();
        } else if (state.enabled === false) {
            this.disable();
        }
    }

    getControl() {
        const unitSystem = this.app.system.settings['core.unitSystem']; //Can be metric, us, degrees, imperial, nautical
        this.scaleLineControl = new ScaleLine({ units: unitSystem || 'metric' });
        return this.scaleLineControl;
    }
}

export default ScaleLinePlugin;
