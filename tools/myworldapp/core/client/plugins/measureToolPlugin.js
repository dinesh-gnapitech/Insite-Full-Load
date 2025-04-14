// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import { Plugin, PluginButton, UnitScale } from 'myWorld-base';
import geometry from 'myWorld/base/geometry';
import { GeomDrawMode } from 'myWorld/map';
import measureToolHtml from 'text!html/measureTool.html';
import { Dialog } from 'myWorld/uiComponents/dialog';
import measurementToolImg from 'images/toolbar/measurement-tool.svg';

/**
 * Options for the Measure Tool plugin.
 * Can be over-ridden by adding these in the measurementTool settings or in the application file.
 * @typedef measureToolPluginOptions
 * @property {string}          [divId]                   Id to be assigned to the measure tool dialog
 * @property {Array<string>}   [lengthUnits]             List of length units (amongst ['m', 'km', 'ft', 'yard', 'mi']) to show in the dialog dropdown
 * @property {string}          [defaultLengthUnit='m']   Length unit that is selected by default in the dialog
 * @property {Array<string>}   [areaUnits]               List of area units amongst(['m^2', 'hectare', 'km^2', 'ft^2', 'yd^2', 'acres', 'mi^2']) to show in the dialog dropdown
 * @property {string}          [defaultAreaUnit='m^2']   Area unit that is selected by default in the dialog
 */
export class MeasureToolPlugin extends Plugin {
    static {
        this.mergeOptions({
            defaultLengthUnit: 'm',
            defaultAreaUnit: 'm^2',
            lengthUnits: ['m', 'km', 'ft', 'yd', 'mi'],
            areaUnits: ['m^2', 'hectare', 'km^2', 'ft^2', 'yd^2', 'acres', 'mi^2']
        });
    }

    /**
     * @class Provides measure tool functionality <br/>
     * Adds a button to the toolbar to access a dialog which allows the user to save or manage bookmarks
     * @param  {Application}           owner          The application
     * @param  {measureToolPluginOptions}  options
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        //Over-ride the options with any settings specified for the measurementTool
        const unitScaleDefs = this.app.system.settings['core.units'];
        this.setOptions(this.app.system.settings['core.plugin.measureTool']);
        this.lengthScale = new UnitScale(unitScaleDefs.length);
        this.areaScale = new UnitScale(unitScaleDefs.area);

        this.plugin_name = 'measurement_tool';

        this.map = this.app.map;

        // latlongs
        this.resetMeasurement();

        const drawOptions = {
            create: {
                polyline: {
                    color: 'red'
                }
            }
        };

        this.geomDraw = new GeomDrawMode(this.map, drawOptions);
        this.geomDraw.setGeomType('LineString');

        [
            '_updateValues',
            'updateDimensions',
            '_setUpEventListeners',
            '_onGeomDrawStart',
            '_onGeomDrawEnd'
        ].forEach(method => (this[method] = this[method].bind(this)));
    }

    /**
     * Resets the distance, area and latLngs properties
     */
    resetMeasurement() {
        this.distance = 0.0;
        this.area = 0.0;
        this.coords = [];
    }

    /**
     * Adds the html for the measureTool dialog in the map container
     */
    createDialog() {
        return new MeasureToolDialog(this, { divId: this.options.divId, units: this.options });
    }

    /**
     * Handler for click event on the toolbar button
     * Toggles the measure dialog open and close
     */
    toggleMode() {
        if (!this.measureDialog) this.measureDialog = this.createDialog();
        const wasDialogOpen = this.measureDialog.isOpen();
        this.measureDialog.toggle(!wasDialogOpen);

        if (wasDialogOpen) this.closeMeasureMode();
        else {
            this.map.setInteractionMode(this.geomDraw);
            geometry.init();
            this._setUpEventListeners();
        }
    }

    _setUpEventListeners() {
        this.map.on('geomdraw-start', this._onGeomDrawStart);
        this.map.on('geomdraw-end', this._onGeomDrawEnd);
    }

    _onGeomDrawStart(ev) {
        if (this.measureDialog.isOpen()) {
            this.map.on('pointermove', this.updateDimensions);
            this.map.on('geomdraw-changed', this._updateValues);
            this._updateValues(ev);
        }
    }

    _onGeomDrawEnd(ev) {
        if (this.measureDialog.isOpen()) {
            this.map.un('pointermove', this.updateDimensions);
            //keep changed listener
        }
    }

    /**
     * Releases the event handler to update values of the plugin
     * Closes the geom draw mode
     */
    closeMeasureMode() {
        this.map?.un('geomdraw-start', this._onGeomDrawStart);
        this.map?.un('geomdraw-end', this._onGeomDrawEnd);
        this.map?.un('geomdraw-changed', this._updateValues);
        this.map.endCurrentInteractionMode();
    }

    /**
     * Calculate the total distance of a polyline
     * @param  {Array} currentLatLngs
     */
    calculateDistance(currentLatLngs) {
        this.distance = 0;
        if (currentLatLngs.length > 1) {
            const line = geometry.lineString(currentLatLngs);
            this.distance = line.length();
        }
    }

    /**
     * Calculates the total area encompassed by the polyline points
     * @param  {Array} currentLatLngs
     */
    calculateArea(currentLatLngs) {
        //Remove last point from ring (so point you are currently drawing is not factored into the selfIntersects test)
        const tempLatLngs = [...currentLatLngs];
        tempLatLngs.pop();
        const ring = geometry.lineString(tempLatLngs);
        const pol = geometry.polygon([currentLatLngs]);

        this.area = !ring.selfIntersects() ? pol.area() : null;
    }

    /**
     * Gets the current distance calculated
     * @return {Float}
     */
    getDistance() {
        return this.distance;
    }

    /**
     * Gets the current area calculated
     * @return {Float|"undefined"}       If its a valid area, returns the area measured
     */
    getArea() {
        return this.area;
    }

    /**
     * Returns object with currently selected length and area units <br/>
     */
    getState() {
        return {
            defaultLengthUnit: this.measureDialog?.lengthUnit || this.options.defaultLengthUnit,
            defaultAreaUnit: this.measureDialog?.areaUnit || this.options.defaultAreaUnit
        };
    }

    /**
     * Updates the length and area in the dialog on mouse move
     * so you can see the total length and area before placing a point on the map
     */
    updateDimensions(e) {
        if (this.coords.length > 0) {
            const currentCoords = [...new Set([...this.coords, e.lngLat])];
            this.calculateDistance(currentCoords);
            this.calculateArea(currentCoords);
            this.measureDialog.updateFields();
        }
    }

    remove() {
        this.measureDialog?.destroy();
    }

    //called when a change is made to the drawing
    async _updateValues() {
        this.coords = this.geomDraw.getCoords();
        await geometry.init();
        this.calculateDistance(this.coords);
        this.calculateArea(this.coords);
        this.measureDialog.updateFields();
    }
}

MeasureToolPlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-measureTool';
            this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
            this.prototype.imgSrc = measurementToolImg;
        }

        action() {
            this.app.recordFunctionalityAccess('core.toolbar.measure_tool');
            this.owner.toggleMode();
        }
    }
};

export class MeasureToolDialog extends Dialog {
    static {
        this.prototype.template = template(
            $(measureToolHtml).filter('#measure-tool-template').html()
        );

        this.prototype.events = {
            'change #measurement-tool-length-units-list': '_changeLengthUnit',
            'change #measurement-tool-area-units-list': '_changeAreaUnit'
        };

        this.mergeOptions({
            autoOpen: false,
            modal: false,
            minWidth: 320,
            width: 'auto',
            resizable: false,
            position: { my: 'center', at: 'top+196', of: window },
            title: '{:measure_title}',
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:close_btn}',
                    click() {
                        this.close();
                    }
                },
                Clear: {
                    text: '{:clear_btn}',
                    click() {
                        this.clearDrawing();
                    }
                }
            }
        });
    }

    /**
     * @class Creates a dialog to show measured distance and area
     * @param  {MeasureToolPlugin}     owner          Measure tool plugin
     * @param  {object}  options
     * @param  {string}                    options.divId  Id to be assigned to the dialog
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(options);
        this.owner = owner;

        this.$el.prop('id', this.options.divId || 'measurement-tool-brief');

        // Set the default unit as specified in the options units
        const availableLengths = Object.keys(this.owner.lengthScale.unitDef.units);
        this.lengthUnits = this.options.units.lengthUnits.filter(x => availableLengths.includes(x));
        this.lengthUnit = this.options.units.defaultLengthUnit;
        const availableAreas = Object.keys(this.owner.areaScale.unitDef.units);
        this.areaUnits = this.options.units.areaUnits.filter(x => availableAreas.includes(x));
        this.areaUnit = this.options.units.defaultAreaUnit;
        this.render();
    }

    render() {
        this.options.contents = this.template({
            lengthOptions: this._createLengthUnitOptions(),
            areaOptions: this._createAreaUnitOptions()
        });

        super.render();
        this.$el.dialog('option', 'close', this.closeDialog.bind(this));

        this.translate(this.$el);
        this.delegateEvents();
        this._setDefaultOptions('length', this.lengthUnit);
        this._setDefaultOptions('area', this.areaUnit);
    }

    /**
     * Creates html options for the length unit dropdown
     * @private
     * @return {string}
     */
    _createLengthUnitOptions() {
        return this.lengthUnits.map(unit => `<option value= "${unit}">${unit}</option>`).join('');
    }

    /**
     * Creates html options for the area unit dropdown
     * @private
     * @return {string}
     */
    _createAreaUnitOptions() {
        return this.areaUnits
            .map(unit => {
                let unitLabel = unit;
                if (unit.indexOf('^2') > -1) {
                    unitLabel = unit.replace('^2', '&#178;');
                }
                return `<option value= "${unit}">${unitLabel}</option>`;
            })
            .join('');
    }

    /**
     * Sets the default unit in the units dropdown
     * @param {string} dimension Either "length" or "area"
     * @param {string} unit      The unit that is selected in the dropdown list
     * @private
     */
    _setDefaultOptions(dimension, unit) {
        const unitsList = this.$(`#measurement-tool-${dimension}-units-list`)[0];
        if (!unitsList) return;
        for (let i = 0; i < unitsList.options.length; i++) {
            if (unitsList.options[i].value == unit) {
                unitsList.selectedIndex = i;
                break;
            }
        }
    }

    /**
     * Event listener for length unit change
     * @private
     */
    _changeLengthUnit(ev) {
        this.lengthUnit = $(ev.currentTarget).val();
        this.updateLengthField();
    }

    /**
     * Event listener for area unit change
     * @private
     */
    _changeAreaUnit(ev) {
        this.areaUnit = $(ev.currentTarget).val();
        this.updateAreaField();
    }

    /**
     * Updates the length field according to the distance measured by the owner plugin
     */
    updateLengthField() {
        const distance = this.owner.getDistance();
        const convertedDistance = this.owner.lengthScale
            .convert(distance, 'm', this.lengthUnit)
            .toFixed(2);
        this.$('#measurement-tool-distance').html(convertedDistance);
    }

    /**
     * Updates the area field according to the area measured by the owner plugin
     */
    updateAreaField() {
        const area = this.owner.getArea();
        const convertedArea =
            area === null
                ? this.msg('invalid_area')
                : this.owner.areaScale.convert(area, 'm^2', this.areaUnit).toFixed(2);

        this.$('#measurement-tool-area').html(convertedArea);
    }

    /**
     * Updates the measured distance and area in the dialogs
     */
    updateFields() {
        this.updateLengthField();
        this.updateAreaField();
    }

    /**
     * Clears the drawing from the map and disables geomDraw
     * @private
     */
    _removeDrawing() {
        this.owner.geomDraw.clear();
        this.owner.resetMeasurement();
        this.$('#measurement-tool-distance, #measurement-tool-area').html('0.00');
    }

    /**
     * Checks if the dialog is open.
     * @return {Boolean}
     */
    isOpen() {
        return this.$el.dialog('isOpen');
    }

    /**
     * Toggles the dialog
     * @param  {Boolean} show   Whether to open the dialog or to close it.
     */
    toggle(show) {
        const action = show ? 'open' : 'close';
        this.$el.dialog(action);
    }

    /**
     * Clear all measurement tool info(including markers)
     * Reset length and area
     */
    clearDrawing() {
        this._removeDrawing();
        this.owner.geomDraw.enable();
    }

    /**
     * Clear the drawing from the map; get out of draw mode
     */
    closeDialog() {
        this._removeDrawing();
        this.owner.closeMeasureMode();
    }
}

export default MeasureToolPlugin;
