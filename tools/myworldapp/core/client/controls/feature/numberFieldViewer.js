// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { UnitScale } from 'myWorld/base';
import { FieldViewer } from './fieldViewer';

/**
 * Displays a number field value
 * @name NumberFieldViewer
 * @constructor
 * @extends {FieldViewer}
 */
export class NumberFieldViewer extends FieldViewer {
    static {
        this.prototype.tagName = 'div';
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this.app = owner?.app;
        this.storedUnit = fieldDD.unit;
        this.displayUnit = fieldDD.display_unit || fieldDD.unit;
        this.hasUnits = Boolean(this.storedUnit);
        this.unitScale = this._initializeUnitScale(fieldDD);
        this.requiresUnitConversion = this.unitScale && this.storedUnit != this.displayUnit;
        this.render(); //called by super() but needs calling again after props are set
    }

    /**
     * Creates a UnitScale based on fieldDD settings
     * @param {fieldDD} fieldDD
     * @returns {UnitScale}
     */
    _initializeUnitScale(fieldDD) {
        const unitScales = this.app.system.settings['core.units'];
        let scale_config;

        if (fieldDD.unit_scale) {
            scale_config = unitScales[fieldDD.unit_scale];
        } else if (this.hasUnits) {
            scale_config = { units: {}, base_unit: this.storedUnit };
            scale_config.units[this.storedUnit] = 1.0;
        } else {
            return undefined;
        }
        return scale_config ? new UnitScale(scale_config) : undefined;
    }

    /**
     * Converts the value for display <br/>
     * Escapes the value and adds unit information where required
     * @return {string} Value as a string
     */
    convertValue(value) {
        const hasDisplayUnit = Boolean(this.displayUnit);
        const requiresNumericFormatting = this.fieldDD.display_format && !isNaN(value);

        if (this.requiresUnitConversion) {
            value = this.applyUnitConversion(value);
        }
        if (requiresNumericFormatting) {
            value = this.applyNumericFormatting(value);
        }

        let str;
        if (this.displayValue) {
            str = escape(this.displayValue);
        } else {
            str = escape(value);
            if (hasDisplayUnit) {
                str = `${str}&nbsp;${this.displayUnit}`;
            }
        }
        return str;
    }

    /**
     * Return formatting information for a field.
     * @param  {string}                  numberFormatString a ':' delimited string with formatting info info ie: '2' as 2 decimal precision
     * @return {numberFormatDefinition}  format options for field or undefined if there are none
     */

    parseDisplayFormat(numberFormatString) {
        let def = {};
        if (!numberFormatString || numberFormatString == '') {
            return undefined;
        }
        const formatData = numberFormatString.split(':');
        def.precision = formatData[0];
        return def;
    }

    /**
     * Converts a value from this field's unit to it's display_unit
     * @param   {number} value to be converted
     * @returns {number} result of the unit conversion
     * @throws  {UnitNotDefinedError} Will throw if the from or to unit is not defined in the unit def
     */
    applyUnitConversion(value) {
        const fromUnit = this.fieldDD.unit;
        const toUnit = this.fieldDD.display_unit;

        return this.unitScale.convert(value, fromUnit, toUnit);
    }

    /**
     * formats a number according to this field's display_format
     * @param  {number} value a number value
     * @return {string} a formatted number
     */

    applyNumericFormatting(value) {
        const format = this.parseDisplayFormat(this.fieldDD.display_format);

        if (format.precision) {
            value = Number(value).toFixed(format.precision);
        }
        return value;
    }
}

export default NumberFieldViewer;

/**
 * number format definition
 * @typedef numberFormatDefinition
 * @property {number}precision
 */
