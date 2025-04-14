import { FilterParser } from 'myWorld/base/filterParser';

export class FieldDD {
    /**
     * Data dictionary for a feature's field
     * Processes the details obtained from the server for easier usage by the client code
     * @constructs
     */
    constructor(props, featureDD, datasource) {
        Object.assign(this, props);
        /** Data dictionary of the feature type
         * @type {featureDD} */
        this.featureDD = featureDD;
        const { system } = datasource;

        /** Base type of the field. For example 'string' when the type is 'string(50)'
         * @type {string} */
        this.baseType = props.type.split('(')[0];

        /** Predicate to determine if the field should be visible
         * @type {DBPredicate} */
        this.visible = new FilterParser(props.visible ?? 'true').parse();
        this.visible.expr = props.visible;
        /** Predicate to determine if the field should be read only
         * @type {DBPredicate} */
        this.read_only = new FilterParser(props.read_only ?? 'false').parse();
        this.read_only.expr = props.read_only;
        /** Predicate to determine if the field should be mandatory
         * @type {DBPredicate} */
        this.mandatory = new FilterParser(props.mandatory ?? 'false').parse();
        this.mandatory.expr = props.mandatory;
        /** List of validators associated with this field. Each item is {predicate, message}
         * @type {object[]} */
        this.validators = (props.validators ?? []).map(validatorDef => {
            const message = system.localise(validatorDef.message);
            const predicate = new FilterParser(validatorDef.expression).parse();
            predicate.expr = validatorDef.expression;
            return { predicate, message };
        });

        if (Object.prototype.hasOwnProperty.call(props, 'default')) {
            this['default'] =
                props.type == 'boolean'
                    ? props['default'].toUpperCase() == 'TRUE'
                    : props['default'];
        }

        this._processEnumerator(props['enum'], datasource);

        this.external_name = system.localise(props.external_name, props.internal_name);
    }

    /**
     * Returns the display value for a given internal value
     * If self doesn't have an enumerator, returns the given value
     * @param {string} value
     */
    displayValueFor(value) {
        if (!this.enum) return value;

        const enumVal = this.enumValues?.find(item => item.value === value);
        return enumVal ? enumVal.display_value : value;
    }

    /**
     * Name of the feature type of the field's catalogue, if there is one
     * @type {string}
     */
    get catalogueName() {
        const enumParts = this.enum?.split('.') ?? [];
        return enumParts.length > 1 && enumParts[0];
    }

    /**
     * Name of catalogue's field associated with self, if there is one
     * @type {string}
     */
    get catalogueFieldName() {
        return this.enum && this.enum?.split('.')[1];
    }

    /**
     * List of parameters on the field type.
     * For example, ['100'] when the field type is 'string(100)'
     * @type {string[]}
     */
    get typeParams() {
        return (this.type.split('(')[1] ?? '')
            .slice(0, -1)
            .split(',')
            .filter(i => i); //filters out empty strings
    }

    /**
     * List of parameters on the field value expression.
     * For example, ['attachment.owner'] when the field value is 'select(attachment.owner)'
     * @type {string[]}
     */
    get valueParams() {
        return (this.value?.split('(')[1] ?? '')
            .slice(0, -1)
            .split(',')
            .filter(i => i); //filters out empty strings
    }

    /**
     * When the field is a calculated reference set, returns the name of the reference field on the target table, for the given feature type
     * For example for a value of 'select(gas_valve.gas_main,note.referenced_feature)' returns 'gas_main' for a 'gas_valve' argument
     * @param {string} featureType
     */
    valueSelectFieldFor(featureType) {
        if (!this._valueSelectMapping) {
            this._valueSelectMapping = {};
            this.valueParams.forEach(param => {
                const [featureType, fieldName] = param.split('.');
                this._valueSelectMapping[featureType] = fieldName;
            });
        }
        return this._valueSelectMapping[featureType];
    }

    /**
     * Returns if this field should be presented to the user in a bulk editor
     * @param {MywFeature} [feature] if given, also considers "bulk" fields specified in the feature's model
     * @returns {boolean}
     */
    isBulkEditable(feature) {
        const inIncludeList =
            !feature?.bulkEditFields || feature?.bulkEditFields.includes(this.internal_name);
        const inExcludeList = feature?.bulkEditExcludeFields?.includes(this.internal_name);
        const inExcludeTypes = ['image', 'file'].includes(this.baseType);
        return inIncludeList && !inExcludeList && !inExcludeTypes;
    }

    _processEnumerator(enumName, datasource) {
        const { system, enumerators } = datasource;
        if (!enumName) return;
        const enumerator = enumerators[enumName];
        if (enumerator) {
            this.enumValues = enumerator.values.map(val => {
                return {
                    ...val,
                    display_value: system.localise(val.display_value, val.value)
                };
            });
            return;
        } else {
            this._processCatalogue(enumName, datasource);
        }

        if (!this.enumValues)
            console.warn(
                `Field ${this.featureDD.name}.${this.internal_name} references missing enumerator: "${enumName}"`
            );
    }

    _processCatalogue(enumName, datasource) {
        const { system, enumerators, catalogues } = datasource;
        const [featureType, fieldName] = enumName.split('.');
        const catalogue = catalogues[featureType];
        if (fieldName && catalogue) {
            this.catalogue = catalogue;
            const valueSet = new Set();
            catalogue.records.forEach(record => {
                valueSet.add(record[fieldName]);
            });

            //the corresponding field in the catalogue maybe associated to an enumerator itself. If so use it to get a display value
            const picklistName = catalogue.fields[fieldName]?.enum;
            const picklistValues = picklistName && enumerators[picklistName]?.values;
            this.enumValues = [...valueSet].map(value => {
                const picklistEntry = picklistValues?.find(val => val.value == value);
                const display_value = picklistEntry
                    ? system.localise(picklistEntry.display_value, picklistEntry.value)
                    : value;
                return { value, display_value };
            });
        }
    }

    //used by tests
    definition() {
        const def = { ...this };
        delete def.featureDD;
        //delete predicates
        if (def.visible.expr) def.visible = def.visible.expr;
        else delete def.visible;
        if (def.read_only.expr) def.read_only = def.read_only.expr;
        else delete def.read_only;
        if (def.mandatory.expr) def.mandatory = def.mandatory.expr;
        else delete def.mandatory;

        delete def.catalogue;
        delete def.baseType;
        def.validators = (def.validators ?? []).map(({ message, predicate }) => ({
            message,
            expression: predicate.expr
        }));
        if (def.validators.length == 0) delete def.validators;

        return def;
    }
}

export default FieldDD;
