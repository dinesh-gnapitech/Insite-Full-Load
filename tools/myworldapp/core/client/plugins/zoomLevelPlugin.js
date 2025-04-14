// Copyright: IQGeo Limited 2010-2023
import { Plugin } from 'myWorld/base';
import ZoomLevelControl from './zoomLevelControl';

export class ZoomLevelControlPlugin extends Plugin {
    static {
        this.mergeOptions({
            enabled: true
        });

        // Actions to be used by map context menu
        this.prototype.actions = {
            toggle: {
                action: 'toggle',
                checked: 'control'
            }
        };
    }

    /**
     * Creates the Open Layers control and adds it to the application's map.
     * Options are passed on to the Open Layers control
     * @class   Plugin that adds a control to the map which displays the zoom level of the map
     * @param  {Application}                    owner       The application
     * @param  {mousePositionControlOptions}    options
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        if (this.options.enabled) this.enable();
    }

    enable() {
        this.control = new ZoomLevelControl();
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
     * @param {boolean} state.minimized Whether the minimap is minimized or not
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
}

export default ZoomLevelControlPlugin;
