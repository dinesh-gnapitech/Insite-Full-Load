// Copyright: IQGeo Limited 2010-2023
import { UnitScale, UnitNotDefinedError, ParseFloatError } from 'myWorld-base';
import { Input } from './input';

/**
 * @class  UnitInput
 * @param  {string} options.value input value
 * @param  {function} options.onChange callback fired onKeyUp and Blur
 *
 * @example
 *     new UnitInput({value: "Hello World", onChange: function() {} })
 *
 * @extends {Input}
 */
export class UnitInput extends Input {
    static {
        this.prototype.events = {
            change: '_onChange'
        };
    }

    constructor(options) {
        super(options);
        this.unitScale = new UnitScale(options.unitScaleDef);
    }

    render(options) {
        super.render(options);
        const intialValue = this.options.value || '';
        if (intialValue.length) {
            this._creatUnitScale(intialValue);
        }
    }

    /**
     * Returns unit value
     * @return {UnitValue}
     */
    getUnitValue() {
        return this.value;
    }

    _onChange() {
        this._creatUnitScale(this.$el.val());
        super._onChange();
    }

    _creatUnitScale(strInput) {
        this.clearError();
        try {
            this.value = this.unitScale.fromString(strInput, this.options.defaultUnit);
            this.setValue(this.value.toString());
        } catch (e) {
            let msgId;
            let msgArgs;
            if (e instanceof UnitNotDefinedError) {
                msgId = `not_defined`;
                msgArgs = { text: e.message };
            } else if (e instanceof ParseFloatError) {
                msgId = 'invalid_number';
            }
            if (msgId) this.renderError(this.msg(msgId, msgArgs));
            this.setValue(strInput);
            this.value = null;
        }
    }
}

export default UnitInput;
