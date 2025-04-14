// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { apple, android, isTouchDevice } from 'myWorld/base/browser';
import { msg } from 'myWorld/base/localisation';
import 'jquery-ui';

/**
 *  Module that enables easy form input on touch screen devices with soft keyboards.
 *  When this module is applied on a form or a container, it makes all the
 *  input/textarea elements inside it spawn a popup editor.
 *
 *  The input from the soft keyboard is entered in this dialog.
 *  On clicking OK on the dialog, the input value is transfered to the selected input/textarea.
 *
 *  @example
 *  var formElement = $(".form");
 *  myw.softKeyboardInput.enableOn(formElement, app);
 *
 * // Passing in an instance of your app adds the ability for other plugins to control whether to show the
 * // soft keyboard input or not
 *
 * // If the title or label for your input/textarea element doesn't show up in the dialog,
 * // add a 'name' attribute in your input/textarea element with an appropriate title/label.
 *
 *  @module
 */
export const softKeyboardInput = {
    enableOn(element, app) {
        this.app = app;
        // Add a soft keyboard input dialog functionality for non iOS touch devices
        // iOS touch devices work fine great forms and its soft-keyboard, so no need for using this additional soft keyboard input.
        if (this.app.useTouchStyles && !apple) {
            const selectedInputClass = 'selected-input',
                softInputClass = 'inputField';

            this.softInputContainer = this._initDialog(selectedInputClass, softInputClass);

            element.on(
                'click',
                "input:not('#soft-keyboard-input input'):not([type='checkbox']):not('.image-input'):not('.no-free-text'), textarea",
                e => {
                    this._openInputDialog(e, selectedInputClass, softInputClass);
                }
            );

            //Checks on each key entry if the value entered is valid
            this.softInputContainer.on('keyup', 'input', e => {
                this._inputValidation(e);
            });

            // Update on Return key press
            this.softInputContainer.on('keypress', event => {
                if (event.which == 13 && !this.isTextarea) {
                    //clicks on the okay button when a return key is pressed inside an input field (not text areas since they might need line breaks)
                    this.softInputContainer
                        .dialog('widget')
                        .find('.ui-dialog-buttonpane .primary-btn')
                        .click();
                }
            });
        }
    },

    _openInputDialog(e, selectedInputClass, softInputClass) {
        const app = this.app;
        const enabled = app ? app.useSoftKeyboardInput : true;
        if (e.which === undefined || !enabled) return;

        const selectedField = $(e.currentTarget);

        // Move the selected class to the current element
        $(`.${selectedInputClass}`).removeClass(selectedInputClass);
        selectedField.addClass(selectedInputClass);

        // Attempts to get the label for the target fields
        const parent = selectedField.parent(),
            inputLabel =
                selectedField.attr('name') ||
                selectedField.closest('[name]').attr('name') || //gets the name from the closest parent
                selectedField.parent('label').text() ||
                parent.children('strong').text() ||
                parent.parent().find('th').html() ||
                parent.parent().children().text();

        // Removes the previous input/textarea element to make way for the new one
        this.softInputContainer.children(`.${softInputClass}`).remove();

        // Creates a new softInput element
        this.softInputField = this._createSoftInputFor(selectedField).addClass(softInputClass);

        this.softInputField.find('input, textarea').val(selectedField.val());

        this.softInputField.appendTo(this.softInputContainer);

        this.softInputContainer.dialog('option', 'title', inputLabel).dialog('open');

        this.softInputField.find('input, textarea').focus();
    },

    _inputValidation(e) {
        const okayBtn = this.softInputContainer
                .dialog('widget')
                .find(".ui-dialog-buttonpane button:contains('OK')"),
            currentTarget = e.currentTarget;
        if (!currentTarget.validity.valid) {
            okayBtn.attr('disabled', true);
            $(currentTarget)
                .siblings('.inlineValidation')
                .html(msg('MywClass', 'invalid_type', { type: currentTarget.type }))
                .show();
        } else {
            okayBtn.attr('disabled', false);
            $(currentTarget).siblings('.inlineValidation').empty().hide();
        }
    },

    /**
     * Creates the input element to be added to the dialog
     * The element is based on the tagname and the type of the selected form field
     * @param  {jquery} selectedField Selected field/ the field was is being edited
     * @return {jquery}               HTML Element to be added to the softKeyboardInput dialog
     * @private
     */
    _createSoftInputFor(selectedField) {
        if (selectedField.prop('tagName') === 'TEXTAREA') {
            //if its a textarea
            this.isTextarea = true;
            return $('<div>').append('<textarea></textarea>');
        } else {
            //if its an input field
            this.isTextarea = false;

            const props = { class: 'text' };
            for (let attr of ['type', 'step', 'pattern', 'inputmode']) {
                const val = selectedField.attr(attr);
                if (val) props[attr] = val;
            }

            const inputField = $('<input>', props);
            const validation = $('<div class="inlineValidation hidden"></div>');

            return $('<div>').append(inputField).append(validation);
        }
    },

    /**
     * Creates a softInputContainer HTML object which houses a textarea to aid in soft keyboard input
     * Initiates and configures a jquery ui dialog around the softInputContainer
     * @param  {string}      selectedInputClass Class name for the current selected input.
     * @return {jQueryObject} softInputContainer HTML object containing the HTML for the soft keyboard input container
     * @private
     */
    _initDialog(selectedInputClass, softInputClass) {
        const softInputContainer = $("<div id='soft-keyboard-input'>");
        $('body').append(softInputContainer); // Attach the HTML to the document Body

        softInputContainer.dialog({
            modal: true,
            autoOpen: false,
            width: 500,
            height: 'auto',
            minHeight: 35,
            position: { my: 'center', at: 'top', of: window },
            classes: { 'ui-dialog': 'soft-keyboard-input-dialog' },
            buttons: {
                Cancel: {
                    text: msg('MywClass', 'cancel_btn'),
                    click() {
                        // Closes the dialog and the soft keyboard
                        $(this).dialog('close');
                        $(`.${selectedInputClass}`).blur();
                    }
                },
                OK: {
                    text: msg('MywClass', 'ok_btn'),
                    class: 'primary-btn',
                    click() {
                        // Transfers the value in the dialog to the selected input
                        // Closes the dialog and the soft keyboard
                        const currentInput = $(`.${selectedInputClass}`);

                        currentInput.val(
                            softInputContainer
                                .children(`.${softInputClass}`)
                                .find('input, textarea')
                                .val()
                        );
                        currentInput.change();

                        $(this).dialog('close');
                        currentInput.blur();
                    }
                }
            }
        });

        if (isTouchDevice && android) {
            //Allows 'x' (in the draggable titlebar) click to work on android touch devices
            softInputContainer
                .dialog('widget')
                .find('.ui-dialog-titlebar-close')
                .mousedown(() => {
                    softInputContainer.dialog('close');
                });
        }
        return softInputContainer;
    }
};

export default softKeyboardInput;
