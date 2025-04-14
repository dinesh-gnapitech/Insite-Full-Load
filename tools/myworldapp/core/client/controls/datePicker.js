// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import 'jquery-ui';
import { msg as mywMsg, localisation } from 'myWorld/base/localisation';

/** Module that configures the jQuery-UI's date picker to use the myWorld localisation messages and to have a 'Clear' button instead of a 'Today' one
 *  @module
 */

const msg = mywMsg('DatePicker');

/**
 * Creates a button in the butonPanel of DatePicker to 'Clear' the date.
 * Removes the 'Today' button
 * @private
 */
function addClearButton() {
    const updateCall = $.datepicker._updateDatepicker;

    $.datepicker._updateDatepicker = function (inst) {
        updateCall.call(this, inst);

        const buttonPane = $(this).datepicker('widget').find('.ui-datepicker-buttonpane');

        buttonPane.find('.ui-datepicker-current').remove(); // Removes the 'today' button
        buttonPane.find('button').addClass('ui-button'); //Apply our button styles
        $('<button>', {
            type: 'button',
            class: 'ui-datepicker-clean ui-button',
            text: msg('clear_btn')
        })
            .appendTo(buttonPane)
            .click(ev => {
                $.datepicker._clearDate(inst.input);
            });
    };
}

/**
 * Initializes the jquery DatePicker
 */
function initialize() {
    $.datepicker.setDefaults({
        autoSize: true,
        showButtonPanel: true,
        closeText: msg('closeText'),
        prevText: msg('prevText'),
        nextText: msg('nextText'),
        currentText: msg('currentText'),
        monthNames: msg('monthNames'),
        monthNamesShort: msg('monthNamesShort'),
        dayNames: msg('dayNames'),
        dayNamesShort: msg('dayNamesShort'),
        dayNamesMin: msg('dayNamesMin'),
        weekHeader: msg('weekHeader'),
        dateFormat: msg('dateFormat'),
        firstDay: msg('firstDay'),
        isRTL: msg('isRTL') === 'true',
        showMonthAfterYear: msg('showMonthAfterYear') === 'true',
        yearSuffix: msg('yearSuffix')
    });

    addClearButton();
}
//run initialize when localisation files have been loaded
localisation.ready.then(initialize);
