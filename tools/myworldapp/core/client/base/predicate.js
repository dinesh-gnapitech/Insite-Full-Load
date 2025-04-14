/**
 * A query predicate with behaviour to help build complex queries
 * To be used with MyWorldDatasource.getFeatures()
 * @example
 * const { Predicate } = myw;
 * const predicate = Predicate.eq('urgent', true).and(Predicate.gt('priority', 2));
 * const features = await ds.getFeatures(featureType, { predicate });
 */
export class Predicate {
    constructor(operator, ...operands) {
        this.operator = operator;
        this.operands = operands.map(convertOperand);
        this.type = this._getTypeOf(operator);
    }

    /**
     * Returns a (json) object representing self
     * @returns {object}
     */
    asJson() {
        return [
            this.type,
            this.operator,
            ...this.operands.map(op => (typeof op.asJson == 'function' ? op.asJson() : op))
        ];
    }

    toString() {
        return JSON.stringify(this.asJson());
    }

    /**
     * Returns a new predicate where self is joined via an 'and' operator with another predicate
     * @param {Predicate} other
     * @returns {Predicate}
     * @example
     * Predicate.eq('urgent', true).and(Predicate.gt('priority', 2))
     */
    and(other) {
        return new Predicate('and', this, other);
    }
    /**
     * Returns a new predicate where self is joined via an 'or' operator with another predicate
     * @param {Predicate} other
     * @returns {Predicate}
     * @example
     * Predicate.eq('urgent', true).or(Predicate.gt('priority', 2))
     */
    or(other) {
        return new Predicate('or', this, other);
    }
    /**
     * Returns a new predicate where self is negated
     * @returns {Predicate}
     */
    not() {
        return new Predicate('not', this);
    }

    //Static constructors

    /**
     * Creates a predicate for an equals clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     * @example
     * Predicate.eq('urgent', true);
     */
    static eq(fieldName, value) {
        return newCompPredicate('=', fieldName, value);
    }
    /**
     * Creates a predicate for a not equals clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     */
    static ne(fieldName, value) {
        return newCompPredicate('<>', fieldName, value);
    }
    /**
     * Creates a predicate for a greater than clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     */
    static gt(fieldName, value) {
        return newCompPredicate('>', fieldName, value);
    }
    /**
     * Creates a predicate for a 'greater than or equals' clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     */
    static gte(fieldName, value) {
        return newCompPredicate('>=', fieldName, value);
    }
    /**
     * Creates a predicate for a lower than clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     */
    static lt(fieldName, value) {
        return newCompPredicate('<', fieldName, value);
    }
    /**
     * Creates a predicate for a 'lower than or equals' clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     */
    static lte(fieldName, value) {
        return newCompPredicate('<=', fieldName, value);
    }
    /**
     * Creates a predicate for a like clause on a field
     * @param {string} fieldName
     * @param {} value
     * @returns {Predicate}
     */
    static like(fieldName, value) {
        return newCompPredicate('like', fieldName, value);
    }
    /**
     * Creates a predicate for a case-insensitive like clause on a field
     * @param {string} fieldName
     * @param {string|number} value
     * @returns {Predicate}
     */
    static ilike(fieldName, value) {
        return newCompPredicate('ilike', fieldName, value);
    }
    /**
     * Creates a predicate for a 'in' clause on a field
     * @param {string} fieldName
     * @param {string[]} values list of values
     * @returns {Predicate}
     */
    static in(fieldName, values) {
        return new Predicate('in', { type: 'field', fieldName }, { type: 'list', values });
    }

    /**
     * Creates a predicate for an intersection clause for the value of a field and a given geometry
     * @param {string} fieldName
     * @param {geometry} value
     * @returns {Predicate}
     */
    static intersects(fieldName, value) {
        return new Predicate('intersects', { type: 'field', fieldName }, { type: 'geom', value });
    }

    /**
     * Creates a predicate that negates the given predicate
     * @param {Predicate} pred
     * @returns {Predicate}
     */
    static not(pred) {
        return new this('not', pred);
    }

    /**
     * Creates a predicate that "ands" the given predicates
     * @param {Predicate[]} others
     * @returns {Predicate}
     */
    static and(first, ...others) {
        if (!others.length) return first;
        return others.reduce((previous, current) => new Predicate('and', previous, current), first);
    }
    /**
     * Creates a predicate that "ors" the given predicates
     * @param {Predicate[]} others
     * @returns {Predicate}
     */
    static or(first, ...others) {
        if (!others.length) return first;
        return others.reduce((previous, current) => new Predicate('or', previous, current), first);
    }

    _getTypeOf(op) {
        if (['=', '<>', '<=', '>=', '<', '>', 'like', 'ilike'].includes(op)) return 'comp_op';
        else if (op == 'in') return 'func_op';
        else if (op == 'intersects') return 'geom_op';
        else if (op == 'not') return 'unary_op';
        else if (['and', 'or'].includes(op)) return 'join_op';
        else if (op === false || op === true) return 'bool_const';
        throw new Error(`Constructing predicate: unexpected operator '${op}''`);
    }
}

Predicate.false = new Predicate(false);
Predicate.true = new Predicate(true);

function newCompPredicate(op, fieldName, value) {
    return new Predicate(op, { type: 'field', fieldName }, { type: 'literal', value });
}

function convertOperand(operand) {
    const { type, value } = operand;
    if (type == 'geom' && typeof value.asGeometry == 'function') {
        const geometry = { type: 'Polygon', coordinates: [value.asGeometry()] };
        return { type, value: geometry };
    }

    return operand;
}
