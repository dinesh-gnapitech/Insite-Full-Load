// Copyright: IQGeo Limited 2010-2023
import { ParseFloatError, UnitNotDefinedError } from './errors';

/**
 * @typedef unitScaleResultOptions
 * @property {number} value              value representation
 * @property {string} unit               unit representation
 * @property {UnitScale} unitScale   unit scale engine to use
 */
export class UnitScale {
    /**
     * @class Class to work with units.
     * @param  {object} unitDef  unit definition
     * @constructs
     */
    constructor(unitDef) {
        this.unitDef = unitDef;
    }

    /**
     * Construct a UnitValue object
     * @param {number} value     Value of the unit
     * @param {string} unit      Unit type of the unit
     * @returns {UnitValue}
     * @throws {UnitNotDefinedError} Will throw if the unit is not defined in the unit def
     */
    value(value, unit) {
        const unitExists = this.getUnit(unit);
        if (!unitExists) throw new UnitNotDefinedError(unit);
        return new UnitValue(value, unit, this);
    }

    /**
     * Converts a unit from one type to another
     * @param {number} value     Value of the unit
     * @param {string} fromUnit  Unit type of the value
     * @param {string} toUnit    Unit type to convert too
     * @returns {number}         Value of the converted unit
     * @throws {UnitNotDefinedError} Will throw if the from or to unit is not defined in the unit def
     */
    convert(value, fromUnit, toUnit) {
        const fromFactor = this.unitDef.units[fromUnit];
        const toUnitFactor = this.unitDef.units[toUnit];

        if (!fromFactor) throw new UnitNotDefinedError(fromUnit);
        if (!toUnitFactor) throw new UnitNotDefinedError(toUnit);

        return (value * fromFactor) / toUnitFactor;
    }

    /**
     * Will attempt to parse the input string and return a UnitValue object
     * @param {string} input          Input to parse
     * @param {string} defaultUnit  Default unit to use if no unit is found on the input string
     * @returns {UnitValue}
     * @throws {UnitNotDefinedError} Will throw if the from or to unit is not defined in the unit def
     */
    fromString(input, defaultUnit) {
        const inputString = input.replace(/ /g, '').replace(/\,/g, '');

        //  Convert the list of units into regexes, ensuring the longest are tested first to handle conflicts between, for example, mm and m
        //  Replace copied from https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript/3561711#3561711
        const units = Object.keys(this.unitDef.units).sort((a, b) => b.length - a.length);
        const unitCheckRegexes = units.map(unit => {
            const regexContents = unit.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            return new RegExp(`^${regexContents}|${regexContents}$`);
        });

        //  Check if the input isn't a pure number. If it isn't report that the unit hasn't been defined
        try {
            //check to see if a unit could be in the string
            for (let unitCheckRegex of unitCheckRegexes) {
                const match = inputString.match(unitCheckRegex);
                if (match) {
                    const inputWithNoUnit = inputString.replace(match[0], '');
                    this.checkValidNumberString(inputWithNoUnit);
                    return new UnitValue(parseFloat(inputWithNoUnit), match[0], this);
                }
            }

            this.checkValidNumberString(inputString);
            return new UnitValue(parseFloat(inputString), defaultUnit, this);
        } catch (error) {
            if (error instanceof ParseFloatError) {
                //  If there's a unrecognised unit at the start or the end of the string, throw a UnitNotDefinedError
                //  In other cases, throw a ParseFloatError
                let undefinedUnitAtStart = '';
                let undefinedUnitAtEnd = '';
                let input = inputString;
                while (input.length && !this._charIsNumeric(input[0])) {
                    undefinedUnitAtStart += input.slice(0, 1);
                    input = input.slice(1);
                }
                while (input.length && !this._charIsNumeric(input[input.length - 1])) {
                    undefinedUnitAtEnd = input.slice(-1) + undefinedUnitAtEnd;
                    input = input.slice(0, -1);
                }

                if (
                    (undefinedUnitAtStart === '' && undefinedUnitAtEnd === '') ||
                    (undefinedUnitAtStart !== '' && undefinedUnitAtEnd !== '')
                ) {
                    throw new ParseFloatError();
                }

                this.checkValidNumberString(input);
                if (undefinedUnitAtStart !== '')
                    throw new UnitNotDefinedError(undefinedUnitAtStart);
                else throw new UnitNotDefinedError(undefinedUnitAtEnd);
            }
            throw error;
        }
    }

    /**
     * Return the unit scale value
     * @param {string} unit  Unit to find
     * @returns {number}
     */
    getUnit(unit) {
        return this.unitDef.units[unit];
    }

    /**
     * Checks if the input string is valid, if not throws an error
     * @param {string} string
     * @throws {ParseFloatError}
     */
    checkValidNumberString(string) {
        if (isNaN(Number(string))) {
            throw new ParseFloatError();
        }
    }

    /**
     * Returns whether the provided character can be used in a number
     */
    _charIsNumeric(char) {
        return !isNaN(char) || char === '.' || char === '-';
    }
}

export class UnitValue {
    /**
     * @class Class to work with units.
     * @name UnitValue
     * @param  {number} value
     * @param  {string} unit
     * @param  {UnitScale} unitScale
     * @constructor
     */
    constructor(value, unit, unitScale) {
        this.value = value;
        this.unit = unit;
        this.unitScale = unitScale;
    }

    /**
     * Return unit value as a unit
     * @param {string} toUnit  Unit to represent the value as
     * @returns {number}
     */
    valueIn(toUnit) {
        return this.unitScale.convert(this.value, this.unit, toUnit);
    }

    /**
     * Return unit value as a string
     * @param {string} [toUnit]  Unit to represent the value as defaults to internal unit
     * @param {object} [options]
     * @returns {string}
     */
    toString(toUnit, options) {
        const defaultOptions = Object.assign(
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
                useGrouping: false
            },
            options
        );

        if (isNaN(this.value)) {
            throw new ParseFloatError();
        }

        if (toUnit) {
            return this.valueIn(toUnit).toLocaleString(undefined, defaultOptions) + ' ' + toUnit;
        }

        return this.value.toLocaleString(undefined, defaultOptions) + ' ' + this.unit;
    }
}
