// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { translate } from 'myWorld/base';
import { BaseComponent } from '../baseComponent';

/**
 * @typedef {Object} FormRow
 * @property {String} label
 * @property {Array<View|String>} component
 */

/**
 * UI component managing a set of {@link FormComponent}s.
 *
 * Displays its components as a table, each with an optional label. Also has
 * areas for adding action buttons at the bottom of the form. Provides
 * an API for getting and setting control data by name and for listening for
 * data changes. Also provides support for message translation (localization).
 *
 * @class  Form
 * @param  {Array<FormRow>} options.rows                  Form rows for rendering.
 * @param  {Array<View|String>} options.bottomLeft    Component(s) to render bottom left
 * @param  {Array<View|String>} options.bottomRight   Component(s) to render bottom right
 * @param  {function} options.onChange                    Callback function for field changes
 * @param  {String} options.messageGroup                  Default group to use for localisation messages.
 *
 * @example
 *
 * new Form({
 *   rows: [
 *     {
 *       label: "{:from_label}",
 *       components: [
 *         new Input(),
 *         "<span>m</span>",
 *       ]
 *     }
 *   ],
 *   bottomLeft: new Button({
 *     text: 'Cancel'
 *   }),
 *   bottomRight: new Button({
 *     text: 'Save'
 *   },
 *   messageGroup: "TracePlugin"
 * });
 *
 * @extends {BaseComponent}
 */
export class Form extends BaseComponent {
    static {
        this.prototype.className = 'ui-form';
    }

    constructor(options) {
        super(options);
        this.formInputs = {};

        if (options.messageGroup) {
            this.messageGroup = options.messageGroup;
        }
        this.render();
    }

    /**
     * Returns all form components value
     * @return {object}
     */
    getValues() {
        const values = {};

        Object.values(this.formInputs).map(input => {
            this._bindFormValue(values, input);
        });

        return values;
    }

    setValues(values) {
        Object.entries(values).forEach(([key, value]) => {
            try {
                this.setValue(key, value);
            } catch (e) {
                //ignore missing keys
            }
        });
    }

    /**
     * Set a value of a named input
     *  @param name Field name
     *  @param value field value
     */
    setValue(name, value) {
        this.formInputs[name].setValue(value);
    }

    /**
     * Get a value of a named input
     *  @param name Field name
     *  @return {mixed} Field value
     */
    getValue(name) {
        return this.formInputs[name].getValue();
    }

    /**
     * Get a field
     *  @param name Field name
     *  @return {FormComponent} Field component
     */
    getField(name) {
        return this.formInputs[name];
    }

    _bindFormValue(valueMap, component) {
        const name = component.getName();

        if (name) {
            valueMap[name] = component.getValue();
        }
    }

    render() {
        this.$el.empty();
        const table = $('<table>');
        this.$el.append(table);
        this._renderRows(table, this.options.rows || []);
        this._renderButtonContainer(this.options.bottomLeft, 'left-section');
        this._renderButtonContainer(this.options.bottomRight, 'right-section');
        translate(this.messageGroup, this.$el);
    }

    _renderButtonContainer(buttonDD, cssClass) {
        let buttons = buttonDD;
        if (!buttons) return;

        if (!Array.isArray(buttons)) {
            buttons = [buttons];
        }

        const buttonContainer = $('<div>', { class: cssClass });
        this._renderComponents(buttonContainer, buttons);
        this.$el.append(buttonContainer);
    }

    _renderRows(table, rows) {
        rows.map(this._renderRow.bind(this, table));
    }

    _renderRow(table, rowDD) {
        const tr = $('<tr class="ui-form-row">');
        const tdLabel = $(rowDD.labelObj || '<td class="ui-label">');
        const tdComponents = $(rowDD.componentsObj || '<td class="ui-form-component-wrapper">');

        if (rowDD.label) {
            tdLabel.append(rowDD.label);
            tr.append(tdLabel);
        }
        this._renderComponents(tdComponents, rowDD.components || []);
        tr.append(tdComponents);
        table.append(tr);
    }

    _renderComponents(el, components) {
        components.map(this._renderComponent.bind(this, el));
    }

    _renderComponent(el, component) {
        if (typeof component.render == 'function') {
            component.render({ parent: el });
            this._addFormInput(component);
            return;
        }

        el.append(component.toString());
    }

    _addFormInput(component) {
        if (
            typeof component.hasComponent === 'function' &&
            typeof component.getComponent === 'function'
        ) {
            if (component.hasComponent()) {
                this._addFormInput(component.getComponent());
            }
        }

        if (typeof component.getValue === 'function' && typeof component.getName === 'function') {
            //Clone any on change callbacks, and register our own for tracking changes across the form.
            const implementation = component.options.onChange || new Function();

            component.options.onChange = () => {
                implementation.call({}, component);
                this._onChange.call(this, component);
            };

            this.formInputs[component.getName()] = component;
        }
    }

    _onChange(component) {
        if (this.options.onChange) {
            this.options.onChange(component.getName(), component.getValue(), this);
        }
    }
}

export default Form;
