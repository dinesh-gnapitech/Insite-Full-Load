// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { FieldEditor } from 'myWorld/controls/feature';
import { Input, Dialog } from 'myWorld/uiComponents';

export class ArrayFieldEditor extends FieldEditor {
    static {
        this.prototype.className = 'array-field-editor';

        this.prototype.events = {
            click: 'createArrayEditorDialog'
        };
    }

    /**
     * Creates an editor for building an array
     * It launches a dialog with a list editor.
     * The items in the list are based on the editorClass supplied
     * Once the array is created, it is displayed as comma separated values
     * @name ArrayFieldEditor
     * @constructor
     * @extends {FieldEditor}
     */
    constructor(owner, feature, fieldDD, options, childClass) {
        super(owner, feature, fieldDD, options);
        this.control = new Input({
            text: this.options.fieldValue,
            onChange: this._changed.bind(this),
            disabled: true
        });

        this.control.$el.appendTo(this.$el);
        const editBtn = $('<button>', { class: 'arrayEditBtn', text: '...' });
        this.$el.append(editBtn);
        this.childClass = childClass;
    }

    createArrayEditorDialog() {
        new ArrayEditorDialog({
            childClass: this.childClass,
            feature: this.feature,
            fieldDD: this.fieldDD,
            value: this.value || this.options.fieldValue,
            onOk: this.handleOk.bind(this),
            ...this.options
        });
    }

    handleOk(value) {
        this.value = value;
        this.setValue(value);
    }

    getValue() {
        return this.value || this.options.fieldValue;
    }
}

class ArrayEditorDialog extends Dialog {
    static {
        this.mergeOptions({
            dialogClass: 'array-field-editor',
            autoOpen: true,
            modal: true,
            minWidth: 480,
            resizable: true,
            position: { my: 'center', at: 'top+196', of: window },
            title: '{:array_editor_title}',
            closeText: '{:close_tooltip}',
            buttons: {
                Close: {
                    text: '{:ok_btn}',
                    class: 'primary-btn',
                    click() {
                        this.saveAndClose();
                    }
                }
            }
        });

        this.prototype.events = {
            'click .array-item-add-btn': 'addEntryFor',
            'click .array-item-delete-btn': 'removeEntry'
        };
    }

    render() {
        const container = $('<div>');
        this.entries = [];

        this.listContainer = $('<div>', { class: 'array-list-container' });
        this.addButton = $(`<button class='ui-button array-item-add-btn'>+</button>`);
        this.removeButton = $(`<button class='ui-button array-item-delete-btn'>-</button>`);

        this.listContainer.appendTo(container);
        this.addButton.appendTo(container);
        this.removeButton.appendTo(container);
        this.options.contents = container.html();
        super.render();
        const { value } = this.options;
        if (value) {
            let valList = Array.isArray(value) ? value : [value];
            valList.forEach(val => this.addEntryFor(null, val));
        } else this.addEntryFor();
    }

    saveAndClose() {
        this.options.onOk(this.getValue());
        this.close();
    }

    addEntryFor(ev, val) {
        const { feature, fieldDD } = this.options;
        const newEntry = new this.options.childClass(this, feature, fieldDD, this.options);
        newEntry.setValue(val);

        this.$el.find('.array-list-container').append(newEntry.$el);
        this.entries.push(newEntry);
    }

    removeEntry() {
        if (this.entries.length) {
            const entry = this.entries.pop();
            entry.$el.remove();
        }
    }

    getValue() {
        return this.entries.map(entry => entry.getValue());
    }
}
