// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import 'myWorld/controls/datePicker';
import { Input } from 'myWorld/uiComponents';
import { FieldEditor } from './fieldEditor';
import { convertToLocalDate } from './dateUtils';
import calendarImg from 'images/calendar.svg';

/**
 * Input for fields of type Date. <br/>
 * Text input that when selected will display a datepicker calendar which the user can use to choose a date
 * @name DateFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class DateFieldEditor extends FieldEditor {
    static {
        this.prototype.events = Object.assign({}, FieldEditor.prototype.events, {
            focus: 'blur' // to avoid opening the soft keyboard on touch devices
        });
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this._ensureDate(); //If the fieldValue is an integer (dynamic default), converts to a date

        //fieldValue is a Date object - needs to be converted to string to be shown in input
        const value = convertToLocalDate(this.fieldValue);
        this.control = new Input({
            value,
            onChange: this._changed.bind(this),
            placeholder: this._getLocalFormatToDisplay()
        });
        this.serverDateFormat = 'yy-mm-dd';

        this.altField = $('<input>', {
            //hidden field to house the date format the server accepts
            id: 'hidden-date-editor-field',
            class: 'hidden',
            value: this.fieldValue
        });

        this.setElement(
            $('<div>', { class: 'datepicker-container' })
                .append(this.control.$el)
                .append(this.altField)
        );

        this.control.$el.datepicker({
            dateFormat: this._getLocalDateFormat(), //localises date formats in UI
            altFormat: 'yy-mm-dd', // needs to be the format the server will accept.
            altField: this.altField,
            showOn: 'button',
            buttonImage: calendarImg,
            buttonImageOnly: true,
            buttonText: this.msg('select_date')
        });
    }

    /*
     * If this.fieldValue is a dynamic default, calculate the date in server date format
     */
    _ensureDate() {
        const regEx = /^\d{4}-\d{1,2}-\d{1,2}$/;
        if (
            !this.fieldValue || //null or undefined
            this.fieldValue instanceof Date || //Date object
            this.fieldValue.match(regEx) !== null //server format date
        )
            return;

        const intVal = parseInt(this.fieldValue);
        if (Number.isInteger(intVal)) {
            //fieldValue is an integer (dynamic default)
            //convert it to currentDate + intVal
            let date = new Date();
            if (intVal !== 0) date.setDate(date.getDate() + intVal);
            this.fieldValue = date.toISOString().slice(0, 10); //postgresSQL date type format
        }
    }

    /*
     * Creates a format for language sentsitive representation of date that the datePicker accepts
     * https://api.jqueryui.com/datepicker/#utility-formatDate
     */
    _getLocalDateFormat() {
        return new Date(2035, 11, 31)
            .toLocaleDateString({ dateStyle: 'short' })
            .replace('12', 'mm')
            .replace('31', 'dd')
            .replace('2035', 'yy') //in case toLocaleDateString displays 4 digits for year
            .replace('35', 'y'); //in case toLocaleDateString displays 2 digits for year
    }

    //We want to display yyyy for 4 digit year and yy for 2 digit year
    _getLocalFormatToDisplay() {
        return this._getLocalDateFormat().replace(/y/g, 'yy');
    }

    blur() {
        this.control.$el.blur();
    }

    /**
     * Overriden to handle date instances
     * @param {string|Date} value
     */
    setValue(value) {
        if (value instanceof Date) {
            value = value.toISOString().slice(0, 10);
        }
        //call super
        super.setValue(value);
    }

    /**
     * Enables or disables the associated inputs to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        super.setReadonly(readonly);
        if (readonly) this.control.$el.siblings('img').remove(); //Removes the calender icon that triggers the picker
    }

    /*
     * If the input box has an invalid date or is empty, return the input box val.
     * Otherwise return the altField value
     * (altField has the value the datePicker populates in server date format)
     */
    getValue() {
        const inputValue = this.control.$el.val();
        try {
            $.datepicker.parseDate(this._getLocalDateFormat(), inputValue);
        } catch (e) {
            return inputValue;
        }
        return inputValue.length == 0 ? inputValue : this.altField.val();
    }

    validateValue(value) {
        try {
            //Check if the date is in the right format for the server
            $.datepicker.parseDate(this.serverDateFormat, value);
            return true;
        } catch (e) {
            //Suggest entering the date in the local date format
            //(the date picker auto converts the date from local format to server format)
            return `${this.msg('date_required')} ${this._getLocalFormatToDisplay()}`;
        }
    }

    remove() {
        try {
            //this can fail for some reason
            this.control.$el.datepicker('destroy');
        } catch (error) {
            // console.warn('Error destroying datepicker from DateFieldEditor:', error);
        }
        super.remove();
    }
}

export default DateFieldEditor;
