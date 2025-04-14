// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { localisation, msg } from 'myWorld-base';
import { Control } from 'myWorld/base/control';

export class PrintOptionsControl extends Control {
    static {
        this.prototype.events = {
            'click #open-print': 'openBrowserPrintDialog',
            'change #print-template-choice': 'templateChanged'
        };
    }

    /**
     * @class  UI Control for the user to set the print options and initiate the actual print
     * @param  {Application}    owner   The application
     * @constructs
     * @extends {Control}
     */
    constructor(owner) {
        //call control constructor
        super(owner);

        this.template_dir = 'modules/custom/print_templates';

        this.templateConfigLoaded = this.loadTemplateConfig();

        this.preservedTextValues = null;
        this.preservedPicklistValues = null;

        this.setElement($('.print-control'));
    }

    /**
     * Loads the template configuration and updates the control to display the template list
     */
    loadTemplateConfig() {
        return fetch(`${this.template_dir}/print_template_config.json`)
            .then(res => res.json())
            .then(json => this.showTemplateList(json));
    }

    showTemplateList(templateConfig) {
        // build the picklist
        const templatePicklist = this.buildPickList(
            'print-template-choice',
            templateConfig.templates
        );

        return localisation.ready.then(() => {
            this.translate(templatePicklist);

            //add the picklist to the page
            $('#template-picklist').append(templatePicklist);
        });
    }

    buildPickList(dropDownId, optionChoices) {
        let select, option;
        // create a new select element
        select = $('<select class="text"></select>').prop('id', dropDownId.replace(' ', '-'));

        // populate the dropdown with choices
        Object.entries(optionChoices).forEach(([optionName, optionValue]) => {
            option = $('<option></option>').val(optionValue).text(optionName);
            select.append(option);
        });
        return select;
    }

    templateChanged() {
        const templateName = this.$('#print-template-choice').val(),
            app = this.app,
            // save the previous map state and apply it to newly generated map.
            lastMapView = app.map.getMapViewParameters(),
            basemapName = app.map.getCurrentBaseMapName();

        // Save the state for any plugins that has the restoreState method on it
        this._savePluginsState();

        app.layout.switchTemplate(templateName).then(
            map => {
                map.initialBaseMapName = basemapName;
                this.disablePreviousPrintTemplateStyleSheets();
                this.getPrintElementsFromTemplate();
                app.handleSelectionFromParam();
                map.setCurrentMapViewParameters(lastMapView);
                this._restorePluginsState();
            },
            reason => {
                console.log(reason);
            }
        );
    }

    _savePluginsState() {
        this._pluginsState = {};
        for (const [name, plugin] of Object.entries(this.app.plugins)) {
            if (plugin.getState) {
                this._pluginsState[name] = plugin.getState();
            }
        }
    }

    _restorePluginsState() {
        for (const [name, plugin] of Object.entries(this._pluginsState)) {
            const savedState = this._pluginsState[name];
            if (savedState) plugin.setState?.(savedState);
        }
    }

    /**
     * programatically opens the browser's print dialog
     */
    openBrowserPrintDialog() {
        window.print();
    }

    getText(textAreaId) {
        return $(`#${textAreaId}`).val();
    }

    getTemplateName() {
        return $('#print-template-choice').val();
    }

    /**
     * Looks for the printElements in the print template
     * Maps them to the appropritate method to create the element.
     */
    getPrintElementsFromTemplate() {
        const that = this,
            printElement = $('[myw_print_element]');

        $('.text-area-row, .picklist-row').remove();

        if ($(printElement).length > 0) {
            $(printElement).each(function () {
                const createHtmlElement = {
                    'text-label': () => {
                        if (!$(this).hasClass('text-area')) {
                            that.createTextAreaHtml($(this).prop('id'), $(this).attr('label'));
                        }
                    },
                    'long-text': () => {
                        if (!$(this).hasClass('text-area-large')) {
                            that.createTextAreaHtml(
                                $(this).prop('id'),
                                $(this).attr('label'),
                                true
                            );
                        }
                    },
                    'image-picklist': () => {
                        that.createPicklistHtml($(this));
                    },
                    username: () => {
                        that.createComputedField($(this), 'username');
                    },
                    'current-date': () => {
                        that.createComputedField($(this), 'current-date');
                    },
                    'current-time': () => {
                        that.createComputedField($(this), 'current-time');
                    }
                };
                createHtmlElement[$(this).attr('myw_print_element')]();
            });
        }
        this._getTextAreasFromTemplate(); // for backwards compatibility
    }

    /**
     * For backwards compatibility
     * In the earlier version, the myw_print_element attribute did not exist..
     * ..and the text areas were determined by the class
     * Looks for the text areas in the template and calls the createTextAreaHtml() method on them.
     * @private
     */
    _getTextAreasFromTemplate() {
        const that = this,
            printElement = $('.text-area');

        if ($(printElement).length > 0) {
            $(printElement).each(function () {
                const templateTextId = $(this).prop('id');
                that.createTextAreaHtml(
                    templateTextId,
                    $(this).attr('label'),
                    $(this).hasClass('text-area-large')
                );
            });
        }
    }

    /**
     * preserve the text values from the text areas
     * @private
     */
    _preserveFieldValues() {
        let controlTextAreaId;
        const that = this;

        if (this.preservedTextValues === null) this.preservedTextValues = [];

        if ($('.text-area-row')) {
            $(
                "[myw_print_element = 'text-label'], [myw_print_element = 'long-text'], .text-area"
            ).each(function () {
                controlTextAreaId = `${$(this).prop('id')}-text-area`;
                that._setPreserveFieldValue(controlTextAreaId);
            });
        }
        if ($('.picklist')) {
            $("[myw_print_element = 'image-picklist']").each(function () {
                controlTextAreaId = `${$(this).prop('id')}-selection`;
                that._setPreserveFieldValue(controlTextAreaId);
            });
        }
    }

    /**
     * set the preserved field values
     * @param  {string} controlTextAreaId
     * @private
     */
    _setPreserveFieldValue(controlTextAreaId) {
        const preservedTextObj = {};

        // preservedTextObj schema is {id: value}
        preservedTextObj[controlTextAreaId] = this.getText(controlTextAreaId);
        this.preservedTextValues = this.preservedTextValues.filter(
            element => !(controlTextAreaId in element)
        );
        // add preservedObject to preservedTextValue array
        this.preservedTextValues.push(preservedTextObj);
    }

    /**
     * create text area input html based on ids from the loaded template
     * @param  {string} templateTextId span id from template that specifies the need for an text area input.
     * used as Label in control
     */
    createTextAreaHtml(templateTextId, templateLabel, large) {
        const textAreaRow = $('<tr></tr>').addClass('text-area-row');
        const textAreaLabel = $('<td></td>');
        const textAreaCell = $('<td></td>');
        const textArea = $('<textarea></textarea>');
        let controlTextAreaId;

        // set the text area label from template span id
        if (templateLabel) textAreaLabel.text(`${templateLabel}:`);
        else textAreaLabel.text(`${templateTextId}:`);
        textAreaRow.append(textAreaLabel);

        // create control text area id
        controlTextAreaId = `${templateTextId}-text-area`;
        textArea.prop('id', controlTextAreaId);

        if (large) {
            textArea.prop('rows', '6');
        }

        // create the html table row
        textAreaCell.append(textArea);
        textAreaRow.append(textAreaCell);

        // insert the row into the control html table
        this._insertTextAreaRow(textAreaRow, controlTextAreaId, templateTextId);

        // if there were values in the text areas and the text areas are in the new template, set them
        this._getPreservedFieldValue(controlTextAreaId, templateTextId, 'text');
    }

    /**
     * get the preserved field values and place them accordingly
     * @param  {string} controlTextAreaId
     * @param  {string} templateTextId
     * @private
     */
    _getPreservedFieldValue(controlTextAreaId, templateTextId, print_elememt_type) {
        const preservedTextValueObj = this.preservedTextValues.find(
            textValueObj => textValueObj[controlTextAreaId]
        );

        if (preservedTextValueObj) {
            // set the value in the text tarea
            $(`#${controlTextAreaId}`).val(preservedTextValueObj[controlTextAreaId]);
            // set the value on the template
            if (print_elememt_type === 'text')
                this.app.layout.setText(templateTextId, preservedTextValueObj[controlTextAreaId]);
            else if (print_elememt_type === 'picklist') {
                $(`#${templateTextId}`).html(
                    this._createImageElement(preservedTextValueObj[controlTextAreaId])
                );
            }
        }
    }

    /**
     * insert the text areas into control html table
     * @param  {jQueryElement} textAreaRow
     * @param  {string} controlTextAreaId control text area input html id
     * @param  {string} templateTextId    template text span html id
     * @private
     */
    _insertTextAreaRow(textAreaRow, controlTextAreaId, templateTextId) {
        $('#print-preview-rows > tr').eq(-2).after(textAreaRow);
        this._setTextAreaEventHanlders(controlTextAreaId, templateTextId);
    }

    /**
     * enable keyup handlers for inserted input boxes
     * @param {string} controlTextAreaId control text area input html id
     * @param {string} templateTextId template text span html id
     * @private
     */
    _setTextAreaEventHanlders(controlTextAreaId, templateTextId) {
        this.$(`#${controlTextAreaId}`).on('keyup', () => {
            this.app.layout.setText(templateTextId, this.getText(controlTextAreaId));
        });
    }

    /**
     * create picklist input html based on ids from the loaded template
     * @param  {object} templateElement The DOM element where the image will be placed
     */
    createPicklistHtml(templateElement) {
        const templatePicklistId = $(templateElement).prop('id'),
            templateLabel = $(templateElement).attr('label');

        fetch(`${this.template_dir}/print_template_config.json`)
            .then(res => res.json())
            .then(json => {
                // create the html table row
                const picklistRow = $('<tr></tr>').addClass('picklist-row'),
                    picklist = this.buildPickList(
                        `${templatePicklistId}-selection`,
                        json['image-picklists'][templatePicklistId]
                    ).prop('class', 'picklist');
                // set the text area label from the template picklist name
                if (templateLabel) picklistRow.append($('<td></td>').text(`${templateLabel}:`));
                else picklistRow.append($('<td></td>').text(`${templatePicklistId}:`));
                // create a table cell and add the picklist to it
                picklistRow.append($('<td></td>').append(picklist));
                // insert the row at the end of the control html table
                $('#print-preview-rows > tr').eq(-1).before(picklistRow);

                // if there were values in the field and the field are in the new template, set them
                this._getPreservedFieldValue(
                    `${$(templateElement).prop('id')}-selection`,
                    $(templateElement).prop('id'),
                    'picklist'
                );

                this.translate(picklistRow);

                this._setImagePicklistEventHandler(picklist, templateElement);
            });
    }

    /**
     * Enable the onChange handler for the dropdown
     * It adds the selected image to the print page DOM
     * @param {jqueryElement} picklist        The jquery element for the pickList/dropdown that the event handling is to be activated on
     * @param {object}        templateElement The DOM element where the image will be placed
     * @private
     */
    _setImagePicklistEventHandler(picklist, templateElement) {
        this.$(picklist).on('change', ev => {
            $(templateElement).html(this._createImageElement($(ev.currentTarget).val()));
        });
    }

    /**
     * Creates an image element with the selectedValue
     * @param {string} selectedValue The image selected in the image-picklist
     * @private
     */
    _createImageElement(selectedValue) {
        return selectedValue.length === 0
            ? ''
            : `<img src='${selectedValue}' alt=${$(this).find(':selected').text()}>`;
    }

    /**
     * Computes the print element value and appends it to the template
     * @param  {object} templateElement The DOM element where the computed field will be placed
     * @param  {string} printElementName Name of the print element
     */
    createComputedField(templateElement, printElementName) {
        const printElements = {
            username: function () {
                return myw.currentUser.username;
            },
            'current-date': () => this.getCurrentDate(),
            'current-time': () => this.getCurrentTime()
        };
        $(templateElement).append(printElements[printElementName]());
    }

    getCurrentDate() {
        const objToday = new Date(),
            weekday = msg('DatePicker', 'dayNames'),
            dayOfWeek = weekday[objToday.getDay()],
            dayOfMonth = objToday.getDate() < 10 ? `0${objToday.getDate()}` : objToday.getDate(),
            months = msg('DatePicker', 'monthNames'),
            curMonth = months[objToday.getMonth()],
            curYear = objToday.getFullYear();
        return `${dayOfWeek.substring(0, 3)} ${curMonth.substring(0, 3)} ${dayOfMonth} ${curYear}`;
    }

    getCurrentTime() {
        const objToday = new Date(),
            curHour =
                objToday.getHours() > 12
                    ? objToday.getHours() - 12
                    : objToday.getHours() < 10
                    ? `0${objToday.getHours()}`
                    : objToday.getHours(),
            curMinute =
                objToday.getMinutes() < 10 ? `0${objToday.getMinutes()}` : objToday.getMinutes(),
            curSeconds =
                objToday.getSeconds() < 10 ? `0${objToday.getSeconds()}` : objToday.getSeconds(),
            curMeridiem = objToday.getHours() > 12 ? 'PM' : 'AM';
        return `${curHour}:${curMinute}:${curSeconds} ${curMeridiem}`;
    }

    /**
     * disable previously added print template style sheets
     * to avoid confusion of rules
     */
    disablePreviousPrintTemplateStyleSheets() {
        const styleSheets = document.styleSheets,
            length = styleSheets.length,
            index = length - 2;

        if (styleSheets[index].title == 'print') {
            styleSheets[index].disabled = true;
        }
    }
}

export default PrintOptionsControl;
