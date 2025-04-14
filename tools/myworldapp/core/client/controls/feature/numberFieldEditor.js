// Copyright: IQGeo Limited 2010-2023
import { Browser, UnitScale, UnitValue, UnitNotDefinedError, ParseFloatError } from 'myWorld/base';
import { FieldEditor } from './fieldEditor';
import { Input } from 'myWorld/uiComponents/index';

/**
 * Super class for number field editors: <br/>
 *        {@link DoubleFieldEditor} <br/>
 *        {@link IntegerFieldEditor} <br/>
 *        {@link NumericFieldEditor} <br/>
 * @name NumberFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class NumberFieldEditor extends FieldEditor {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'num-field-input';

        this.mergeOptions({
            inputType: 'number',
            inputMode: 'decimal',
            pattern: '',
            min_value: undefined,
            max_value: undefined,
            // These options are used by Number.prototype.toLocaleString
            unitValueOptions: {
                minimumFractionDigits: 0, //minimumFractionDigit to lowest possible
                maximumFractionDigits: 20, //maximumFractionDigit to highest possible
                useGrouping: false //don't use grouping,
            }
        });
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);
        this.app = owner?.app;
        // Initialize units
        this.storedUnit = fieldDD.unit;
        this.displayUnit = fieldDD.display_unit || fieldDD.unit;
        this.displayFormat = fieldDD.display_format;
        this.hasUnits = Boolean(this.storedUnit);

        // Initialize unitScale
        const val = feature.getProperties()[fieldDD.internal_name]; //ENH: could be just this.fieldValue
        this.unitScale = this._initializeUnitScale(fieldDD);
        this.unitValue = this.unitScale
            ? new UnitValue(val, this.storedUnit, this.unitScale)
            : undefined;
        this.requiresUnitConversion =
            this.unitScale &&
            this.storedUnit &&
            this.displayUnit &&
            this.storedUnit != this.displayUnit;

        this.displayValue = this.convertValueForDisplay(val);
        this.fieldValue = val; //ENH: could be removed

        this.min_value = this.options.min_value || this.fieldDD.min_value;
        this.max_value = this.options.max_value || this.fieldDD.max_value;

        //check if we need to use an input of type 'text' (instead of 'number').
        //Apple browser's, on number inputs, allow user to type invalid characters but return null when we obtain the value, preventing
        //our validation code from detecting the invalid number (which would cause the value to be lost)
        const needTextInputType = this.unitValue || Browser.apple;

        this.control = new Input({
            name: this.fieldDD.external_name,
            type: needTextInputType ? 'text' : this.options.inputType,
            inputmode: this.options.inputMode,
            pattern: this.unitValue ? undefined : this.options.pattern,
            step: this.unitValue ? undefined : 'any',
            value: this.displayValue
        });
        this.initialDisplayValue = this.control.getValue();

        const input = this.control.$el;
        this.$el.append(input);

        //enable firing 'change' event
        input.on('input', this._changed.bind(this));
        this.render();
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
     * Returns the given value <br/>
     * Override to converts a value to its apropriate representation on the screen
     * Example: by using the features displayValues information
     * @param  fieldValue
     */
    convertValueForDisplay(fieldValue) {
        // zero values also need unit conversion.
        if ((fieldValue || fieldValue == 0) && this.unitValue) {
            const unitValueOptions = { ...this.options.unitValueOptions };
            if (this.displayFormat) {
                // If precision set in config, set desired precision in options for fieldEditor
                unitValueOptions.maximumFractionDigits = this.setPrecision(this.displayFormat);
                if (unitValueOptions.maximumFractionDigits < unitValueOptions.minimumFractionDigits)
                    unitValueOptions.minimumFractionDigits = this.setPrecision(this.displayFormat);
            }

            return this.unitScale
                .fromString(fieldValue.toString(), this.storedUnit)
                .toString(this.displayUnit, unitValueOptions);
        }
        return fieldValue;
    }

    /**
     * Sets precision
     * @param {int} precision
     */
    setPrecision(precision) {
        return parseInt(precision);
    }

    setValue(value) {
        if (this.control) {
            //if value doesn't specify a unit, it is assumed to be in stored units
            //and needs to be converted to display units
            const convertedValue = this.convertValueString(value?.toString() ?? '', {
                defaultSourceUnit: this.storedUnit,
                targetUnit: this.displayUnit
            });
            this.control.setValue(convertedValue);
            return;
        }
        this.fieldValue = value;
        this.render();
    }

    /**
     * Returns the value currently set in the UI
     * Overriden to convert displayed value to its appropriate stored units
     */
    getValue() {
        let displayValue = this.control.$el.val();
        //if display value hasn't changed, just return the stored value
        const hasValue = typeof this.fieldValue !== 'undefined';
        if (hasValue && this.initialDisplayValue == displayValue) return this.fieldValue; //Allow conversion of this.fieldValue to null if hasValue

        //no value set or it has changed - convert from string to number
        this.control.validity = undefined;
        let value = this.convertValueString(displayValue);
        if (value === '') value = null; //So it can be sent to the server as null value
        return value;
    }

    /**
     * Returns the conversion of a given string (which might specify a unit) to a value in a target unit
     * If a source unit is not specified in the string, it is assumed to be in display units.
     * If '' is passed in, null is returned.
     * If the field doesn't have an associated unit the original value is returned
     * @param {string} valueString
     * @param {object} options
     * @param {string} [options.defaultSourceUnit] Default unit for the given string. Defaults to display unit
     * @param {string} [options.targetUnit] Convert value to this unit. Defaults to stored unit
     * @param {boolean} [options.rounding] Applies rounding to the resulting value. Can only be used when display unit and stored unit are different
     */
    convertValueString(valueString, options = {}) {
        if (!this.unitScale) return valueString; //Conversion requires a unitScale
        if (valueString === '') return null; //Handle empty strings as null

        if (this.unitValue) {
            const { targetUnit = this.storedUnit, defaultSourceUnit = this.displayUnit } = options;
            try {
                let n = this.unitScale.fromString(valueString, defaultSourceUnit);
                if (n.unit == targetUnit) {
                    n = n.value;
                } else {
                    n = this.unitScale.convert(n.value, n.unit, targetUnit);
                    if (options.rounding) {
                        n = Math.round(n);
                    }
                }
                return n;
            } catch (error) {
                let message;
                if (error instanceof UnitNotDefinedError) {
                    message = this.msg(`unit_not_defined`, { unit: error.message });
                } else if (error instanceof ParseFloatError) {
                    message = this.msg('invalid_number');
                } else message = error.message;

                this.control.validity = {
                    valid: false,
                    message
                };
                return valueString; //ToDo: Sort out what to do with invalid input
            }
        }
        return valueString;
    }

    validate(value) {
        const isTypeValid = this.control.validity ? this.control.validity.valid : true;
        const missing =
            typeof value === 'undefined' || value === null || value.toString().length === 0;

        if (this.required && missing) {
            return this.msg('value_required');
        } else if (missing && isTypeValid) {
            // a null value is always valid for a non-mandatory field
            // checks the isTypeValid since, the input type 'number' returns an empty string for invalid entries
            return true;
        } else {
            return this.validateValue(value);
        }
    }

    validateValue(value) {
        if (this.control.validity && !this.control.validity.valid) {
            return this.control.validity.message || this.msg('invalid_number');
        }

        if (!(+value || +value === 0)) {
            return this.msg('invalid_number');
        } else {
            const min = this.min_value;
            const max = this.max_value;

            let displayValue = parseFloat(value);

            if (this.requiresUnitConversion) {
                displayValue = this.unitScale.convert(value, this.storedUnit, this.displayUnit);
            }

            // use displayValue when validating min/max
            if (min !== undefined && min > displayValue) {
                return this.formattedValueMessage('greater_than', min);
            }
            if (max !== undefined && max < displayValue) {
                return this.formattedValueMessage('less_than', max);
            }
        }

        return true;
    }

    /**
     * Returns the validation message, including appropriate units <br/>
     * @param  messageKey    key of message to be used
     * @param  messageValue  _Value_ parameter of message
     */
    formattedValueMessage(messageKey, messageValue) {
        if (this.displayUnit) {
            messageValue = `${messageValue} ${this.displayUnit}`;
        }
        return this.msg(messageKey, { value: messageValue });
    }

    getRequiredWidth() {
        if (this.mode === 'expanded') return this.$el.children('.focused-select-menu').width();
    }
}

export default NumberFieldEditor;
