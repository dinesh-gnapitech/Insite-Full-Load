// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { template } from 'underscore';
import adHocQueryHtml from 'text!html/adHocQuery.html';
import { ArrayFieldEditor } from './valueEditors/arrayFieldEditor';
import { BooleanSelect } from './valueEditors/booleanSelect';
import { QueryRow } from './queryRow';
import { Predicate } from 'myWorld/base/predicate';
import { Dropdown } from 'myWorld/uiComponents';
import {
    DateFieldEditor,
    IntegerFieldEditor,
    DoubleFieldEditor,
    NumericFieldEditor,
    EnumeratorFieldEditor,
    StringFieldEditor
} from 'myWorld/controls/feature';

export class SimpleClauseView extends QueryRow {
    static {
        this.prototype.simpleClauseTemplate = template(
            $(adHocQueryHtml).filter('#ad-hoc-clause-template').html()
        );

        this.prototype.events = {
            'change .query-operator': 'handleOperatorChange',
            'click .add-simple-clause': 'morphToJoinClause',
            'click .remove-simple-clause': 'removeClause'
        };

        this.mergeOptions({
            fieldTypeOperators: {
                default: ['not_null', 'null'],
                string: fieldDD =>
                    Object.prototype.hasOwnProperty.call(fieldDD, 'enum')
                        ? ['eq', 'ne', 'in']
                        : ['eq', 'ne', 'like', 'ilike', 'in'],
                date: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in'],
                timestamp: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in'],
                number: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in'],
                boolean: ['eq']
            },
            //to convert query operators to predicate operators (Eg: '=' to 'eq')
            queryOperators: {
                '=': 'eq',
                '<>': 'ne',
                '>': 'gt',
                '<': 'lt',
                '>=': 'gte',
                '<=': 'lte',
                like: 'like',
                ilike: 'ilike',
                in: 'in'
            },
            fieldTypeValueEditors: {
                date: DateFieldEditor,
                timestamp: DateFieldEditor,
                integer: IntegerFieldEditor,
                double: DoubleFieldEditor,
                numeric: NumericFieldEditor,
                boolean: BooleanSelect,
                string: fieldDD =>
                    Object.prototype.hasOwnProperty.call(fieldDD, 'enum')
                        ? EnumeratorFieldEditor
                        : StringFieldEditor
            }
        });
    }

    /**
     * @class Creates an editor for a simple query clause that consists of a field, operator and value
     * @param  {AdHocQueryDialog | JoinClauseView}    owner
     * @param  {object}                               options
     * @constructs
     * @extends {QueryRow}
     */
    constructor(owner, options) {
        super(owner, options);

        this._asyncInit();
    }

    async _asyncInit() {
        const featuresDD = await this.app.database.getDDInfoFor([this.options.selectedFeature]);
        this.featureDD = Object.values(featuresDD)[0];
        this.fieldOptions = this.createFieldOptions();

        const predicate = this.options.predicate ?? Predicate.true;

        this.fieldName = predicate.operands.find(o => o.type === 'field')?.fieldName;
        this.operator = predicate.operator;
        this.value = this._parseValueFrom(predicate);
        this.fieldEl = null;
        this.operatorEl = null;
        this.valueEl = null;

        this.render();
    }

    render() {
        super.render();

        //Get a handle on the elements added by the template
        this.operatorEl = this.$('.query-operator');
        this.valueEl = this.$('.query-value');

        this.fieldEl = new Dropdown({
            placeholder: this.msg('select_field_placeholder'),
            options: this.fieldOptions,
            sortField: 'label',
            selected: this.fieldName,
            onChange: this.handleFieldChange.bind(this)
        });
        this.$('.query-field').append(this.fieldEl.$el);

        //handle the 'is populated' | 'is not populated' operators
        if (this.fieldName && this.value === null) {
            if (this.operator === '=') this.operator = 'null';
            else if (this.operator === '<>') this.operator = 'not_null';
        }

        if (this.fieldName && this.operator) this.renderOperatorField();

        if (this.value) this.renderValueField();
    }

    /*
     * Parses the value from the predicate
     */
    _parseValueFrom(predicate) {
        let val = ''; //default value
        const valOperand = predicate.operands[1];
        if (valOperand) {
            if (Object.prototype.hasOwnProperty.call(valOperand, 'value')) {
                val = valOperand.value;
            } else if (Object.prototype.hasOwnProperty.call(valOperand, 'values')) {
                //values is an array
                val = valOperand.values;
            }
        }
        return val;
    }

    createFieldOptions() {
        let fieldOptions = [];
        const fieldGroups = this.featureDD.field_groups; //ENH: refactor DDFeature.getFieldsOrder() to be able to reuse without a feature instance
        const fieldNames = fieldGroups?.length
            ? fieldGroups
                  .map(f => f.fields)
                  .flat()
                  .map(f => f.field_name)
            : Object.keys(this.featureDD.fields);

        fieldNames.forEach(name => {
            const fieldDef = this.featureDD.fields[name];
            const fieldName = fieldDef?.external_name;
            if (fieldName && !this.isCalculatedField(fieldDef) && !this.isGeomField(fieldDef)) {
                fieldOptions.push({ id: name, label: fieldName, 'data-data': fieldDef });
            }
        });
        return fieldOptions;
    }

    isGeomField(field) {
        const geomTypes = ['point', 'polygon', 'linestring', 'raster'];
        return field.internal_name?.startsWith('myw_') || geomTypes.includes(field.type);
    }

    isCalculatedField(field) {
        return !!field.value;
    }

    _renderRowContents() {
        return this.simpleClauseTemplate({
            select_field_placeholder: this.msg('select_field_placeholder')
        });
    }

    handleFieldChange(fieldName) {
        this.fieldName = fieldName;
        this.renderOperatorField();
    }

    renderOperatorField() {
        this.fieldDD = this.featureDD.fields[this.fieldName];
        this.fieldType = this.fieldDD.baseType;

        let operators = this.getOperatorVals();

        const operatorOptions = this.buildOperatorOptions(operators);
        this.operatorEl.html(operatorOptions).toggleClass('hidden', false);

        this.renderValueField();
    }

    getOperatorVals() {
        const { fieldTypeOperators } = this.options;
        let operators = [];

        if (typeof fieldTypeOperators[this.fieldType] == 'function') {
            operators = fieldTypeOperators[this.fieldType](this.fieldDD);
        } else if (['integer', 'double', 'numeric'].includes(this.fieldType)) {
            operators = fieldTypeOperators['number'];
        } else {
            operators = fieldTypeOperators[this.fieldType] || [];
        }
        operators = [...operators, ...fieldTypeOperators['default']]; //Add default options to all
        return operators;
    }

    handleOperatorChange(ev) {
        this.operator = $(ev.currentTarget).val();
        this.value = this.valFieldEditor?.getValue();
        this.renderValueField();
    }

    buildOperatorOptions(operators) {
        const { queryOperators } = this.options;
        let selectedOperator;
        if (this.operator && this.operator in queryOperators) {
            //if this.operator is a query operator, convert to predicate operator first
            selectedOperator = queryOperators[this.operator];
        } else selectedOperator = this.operator ?? operators[0];
        this.operator = selectedOperator;

        let operatorOptions = '';
        operators.forEach(operator => {
            operatorOptions += `<option value= "${operator}" ${
                operator === selectedOperator ? 'selected' : ''
            }>${this.getOperatorDisplayVal(operator)}</option>`;
        });

        return operatorOptions;
    }

    async renderValueField() {
        const { fieldTypeOperators, fieldTypeValueEditors, selectedFeature } = this.options;
        //Hide the value field if the selected operator is 'is populated'/'is not populated',
        //or the fieldType does not exist in the fieldTypeValueEditors
        if (
            fieldTypeOperators['default'].includes(this.operator) ||
            !(this.fieldType in fieldTypeValueEditors)
        ) {
            this.valFieldEditor = null;
            this.valueEl.empty().toggleClass('hidden', true);
            this.operatorEl.toggleClass('last-clause-el', true); //Removes the right border
            return;
        }
        this.operatorEl.toggleClass('last-clause-el', false); //Adds a right border

        let editorClass = this.getEditorClass();
        if (!editorClass) {
            throw new Error(
                `No field editor class for field ${this.fieldDD.internal_name}. Type: ${this.fieldDD.type}`
            );
        }

        //Create a new feature to send to the field editor
        const detachedFeature = await this.app.database.createDetachedFeature(
            selectedFeature,
            true
        );

        if (this.operator === 'in') {
            //Create an editor to facilitate adding a list of values
            this.valFieldEditor = new ArrayFieldEditor(
                this,
                detachedFeature,
                this.fieldDD,
                { fieldValue: this.value }, //ENH: Change to using setValue()
                editorClass
            );
        } else {
            this.valFieldEditor = new editorClass(this, detachedFeature, this.fieldDD, {});
            this.valFieldEditor.setValue(this.value);
        }

        this.valueEl.html(this.valFieldEditor.$el).toggleClass('hidden', false);
        this.valueEl.append("<div class='inlineValidation'></div>");
    }

    /*
     * Gets the field editor class to be used as the value editor for this.fieldType
     */
    getEditorClass() {
        const classOrFunction = this.options.fieldTypeValueEditors[this.fieldType];
        let editorClass;
        //a class is also a function (a constructor)
        //figure out which by checking if it has 'extend' is defined (as it has for a class)
        if (
            typeof classOrFunction == 'function' &&
            typeof classOrFunction.mergeOptions === 'function'
        ) {
            //class
            editorClass = classOrFunction;
        } else if (typeof classOrFunction == 'function') {
            editorClass = classOrFunction(this.fieldDD);
        }

        return editorClass;
    }

    /*
     * Creates localised operator text
     * Handles dates and timestamps differently since they needed customised messages
     * @param {string} operator
     * @returns {string}
     */
    getOperatorDisplayVal(operator) {
        if (['date', 'timestamp'].includes(this.fieldType)) return this.msg(`date_${operator}`);
        return this.msg(operator);
    }

    /*
     * Ands the simple clause with a blank simple clause to create a join clause
     */
    morphToJoinClause() {
        const blankSimpleClause = Predicate.true;
        const newPredicate = this.getValue().and(blankSimpleClause);

        if (this.options.onAdd) this.options.onAdd(newPredicate);
        else if (this.owner.buildDisplayFor) {
            this.owner.buildDisplayFor(newPredicate);
        }
    }

    removeClause() {
        this.options.onRemove?.();
    }

    /*
     * @returns Predicate represented by the simple clause
     */
    getValue() {
        const field = this.fieldEl?.getValue() || '';
        let operator = this.operatorEl?.val();
        let value = this.valFieldEditor?.getValue();

        //for default field type
        if (operator === null || operator === 'null') {
            operator = 'eq';
            value = null;
        } else if (operator === 'not_null') {
            operator = 'ne';
            value = null;
        } else if (['like', 'ilike'].includes(operator)) {
            //Add % signs around the value text if it does not already exist anywhere in the string
            if (!value.includes('%')) value = `%${value}%`;
        }

        try {
            if (!field.length) return Predicate.true;
            else return Predicate[operator](field, value);
        } catch (e) {
            throw `Unhandled operator: ${operator}`;
        }
    }

    /**
     * Removes any old validation highlights
     * Checks with the field value editor if value is valid or not
     * Adds a validation message at the bottom of the value editor
     * Highlights the clause in red
     * @returns {boolean} Whether the value is valid or not
     */
    validateValue() {
        this.removeValidationHighlight();
        const editor = this.valFieldEditor;
        if (!editor) return true;
        const validationResult = editor.validate(editor.getValue());
        if (validationResult !== true) {
            this.$('.simple-clause-fields').addClass('validationHighlight'); // for 'number' fields with units
            editor.$el.siblings('.inlineValidation').html(validationResult); // Add inline validation message
            return false;
        } else return true;
    }

    /**
     * Remove validation errors if any
     */
    removeValidationHighlight() {
        this.$el.find('.validationHighlight').removeClass('validationHighlight');
        this.valueEl.find('.inlineValidation').html('');
    }
}

export { QueryRow, ArrayFieldEditor, BooleanSelect };
