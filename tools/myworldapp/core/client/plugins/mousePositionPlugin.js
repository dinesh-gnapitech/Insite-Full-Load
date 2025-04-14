// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld-base';
import MousePosition from 'ol/control/MousePosition';
import { format } from 'ol/coordinate';

export class MousePositionPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'MousePositionControl';

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
     * Options are passed on to the Open Layers control
     * @class   Plugin that adds a control to the map which displays the lat/long of the mouse position
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
     * @param {boolean} state.minimized Whether the minimap is minimized or not
     */
    getState() {
        return {
            enabled: !!this.control
        };
    }

    setState(state) {
        if (state.enabled === true) {
            this.enable();
        } else if (state.enabled === false) {
            this.disable();
        }
    }

    getControl() {
        this.mousePositionControl = new MousePosition({
            coordinateFormat: this.formatCoord(this.options.decimalPlaces || 4),
            projection: 'EPSG:4326', //ENH: get from map's view,
            className: 'myw-mouse-position ol-unselectable ol-control'
        });
        return this.mousePositionControl;
    }

    formatCoord(fraction) {
        return function (coordinate) {
            let eastOrWest;
            let northOrSouth;
            if (Math.sign(coordinate[0]) === -1) eastOrWest = 'W';
            else eastOrWest = 'E';

            if (Math.sign(coordinate[1]) === -1) northOrSouth = 'S';
            else northOrSouth = 'N';

            const template = `{y} ${northOrSouth}, {x} ${eastOrWest}`;
            return format(
                coordinate.map(coord => Math.abs(coord)),
                template,
                fraction
            );
        };
    }

    onRemove() {
        this.mousePositionControl.setMap(null);
    }
}

export default MousePositionPlugin;
