// Copyright: IQGeo Limited 2010-2023
import { escape } from 'underscore';
import { msg } from 'myWorld/base';
import { Control } from 'myWorld/base/control';
import { MywError } from 'myWorld/base/errors';

/**
 * Options for FieldViewer instances
 * @name FieldViewer
 * @typedef fieldViewerOptions
 * @property {boolean}  [inListView=false]      Whether self is embeded in a list of multiple of features or not. Affects how units and null values are displayed
 * @property {boolean}  [renderAll=false]       When false, null and default values are not rendered
 */

export class FieldViewer extends Control {
    static {
        this.mergeOptions({
            inListView: false,
            renderAll: false
        });
    }

    /**
     * @class Control to display a feature's field value. <br/>
     *        Super-class with the common behaviour for the sub-classes that deal with specific field types <br/>
     *        Provided sub-classes are: <br/>
     *        {@link ReferenceFieldViewer} <br/>
     *        {@link ReferenceSetFieldViewer} <br/>
     *        {@link TimeFieldViewer} <br/>
     *        {@link LinkFieldViewer} <br/>
     *        {@link ImageFieldViewer} <br/>
     *        {@link NumberFieldViewer} <br/>
     * @param  {Control}            owner   Control where self will be included
     * @param  {Feature}            feature
     * @param  {fieldDD}                fieldDD
     * @param  {fieldViewerOptions}     options
     * @constructs
     * @extends {Control}
     */
    constructor(owner, feature, fieldDD, options) {
        super(owner, options);

        this.feature = feature;
        this.fieldDD = fieldDD;
        this.fieldName = fieldDD.internal_name;
        this.fieldValue = this.feature.properties[this.fieldName];
        this.displayValue = this.feature.displayValues[this.fieldName];
        this.error = this.displayValue instanceof MywError && this.displayValue;
        if (this.error) this.displayValue = msg('errors', this.error.name);

        this.render();
    }

    /**
     * Renders the field value in self's element
     */
    render() {
        const fieldValue = this.fieldValue;
        const fieldDefault = this.fieldDD['default'];
        const nully = fieldValue === null || fieldValue === '';
        const isDefault = fieldDefault && fieldValue == fieldDefault;

        //first check if we should render the value or not
        if (!this.options.renderAll) {
            if (nully) return;
            if (isDefault && !this.options.inListView) return;
        }

        //we do need to render the value anyway
        if (nully) {
            this.$el.html(`<i>${this.msg('null_value')}</i>`);
        } else {
            try {
                this.renderValue(fieldValue);
            } catch (e) {
                console.warn(`Unable to render value for field '${this.fieldName}'. Exception:`, e);
            }
        }

        if (this.options.inListView) {
            this.$el.addClass('limited-width');
        } else {
            if (this.isLongString()) {
                //The field editor used for long string fields is a textarea which allows new lines
                //Hence the fieldViewer must respect new lines as well
                this.$el.addClass('allow-new-lines');
            }
        }
    }

    /**
     * Converts a value to an appropriate string to display to the user and
     * sets it as the content of self's element
     */
    renderValue(fieldValue) {
        let displayValue;
        try {
            displayValue = this.convertValue(fieldValue);
        } catch (e) {
            console.warn(`Unable to convert value for field '${this.fieldName}'. Exception:`, e);
        }
        this.$el.html(displayValue);
    }

    /**
     * Returns true is the field is a string with max char limit > 100
     * @return {boolean}
     */
    isLongString() {
        let isLongString = false;
        const isString = this.fieldDD.baseType === 'string';
        if (isString) {
            const lengthStr = this.fieldDD.typeParams[0];
            if (parseInt(lengthStr, 10) > 100) {
                isLongString = true;
            }
        }
        return isLongString;
    }

    /**
     * Converts the value for display <br/>
     * Escapes the value and adds unit information where required
     * @return {string} Value as a string
     */
    convertValue(value) {
        let str;
        if (this.displayValue) {
            str = escape(this.displayValue);
        } else {
            str = escape(value);
            if (this.fieldDD.unit && !this.options.inListView) {
                str = `${str}&nbsp;${this.fieldDD.unit}`;
            } else if (this.fieldDD.enum) {
                //Use the display value
                str = this.fieldDD.displayValueFor(value);
            }
        }

        return str;
    }

    //implement interface for elements of ResizableGridMixin
    putInNewRow() {
        return true;
    }
}

export default FieldViewer;
