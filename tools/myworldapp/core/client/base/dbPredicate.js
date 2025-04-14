// Copyright: IQGeo Limited 2010-2023
import { joinSqlStrings } from 'myWorld/base/util';

// Representation of the clauses in a select statement.
// A node from a filter parse tree
// Generates SQL and CQL select clauses
export class DBPredicate {
    static {
        this.as = 2;
    }
    constructor(type, value, operands = []) {
        this.type = type;
        this.value = value;
        this.operands = operands;
        this.bindParams = {}; //will be overriden if parent is set
        if (operands) {
            for (const operand of operands) {
                operand.parent = this;
            }
        }
    }

    set parent(value) {
        this.bindParams = value ? value.bindParams : {};
    }

    /**
     * @param {Predicate} predicate
     */
    static newFrom(predicate) {
        try {
            const { newFrom, operand } = DBPredicate;
            const pred = (type, value, ...operands) => new DBPredicate(type, value, operands);
            const { operator: op, type, operands } = predicate;
            if (type == 'comp_op')
                return pred(type, op, operand(operands[0]), operand(operands[1]));
            else if (type == 'func_op')
                return pred(type, op, operand(operands[0]), operand(operands[1]));
            else if (type == 'geom_op')
                return pred(type, op, operand(operands[0]), operand(operands[1]));
            else if (type == 'unary_op') return pred(type, op, newFrom(operands[0]));
            else if (op == 'and')
                return pred('join_op', '&', newFrom(operands[0]), newFrom(operands[1]));
            else if (op == 'or')
                return pred('join_op', '|', newFrom(operands[0]), newFrom(operands[1]));
            else if (op == false) return DBPredicate.false;
            else if (op == true) return DBPredicate.true;
            else return DBPredicate.true;
        } catch (e) {
            console.error('Failed conversion to DBPredicate: ', predicate, 'Exception:', e);
            throw new Error('DBPredicate.newFrom(): ' + predicate.toString?.());
        }
    }
    //Create an predicate operand instance from a dict with type and value properties
    static operand(operand) {
        const { type } = operand;
        if (type == 'field') return DBPredicate.fieldItem(operand.fieldName);
        else if (type == 'literal') return DBPredicate.constItem(operand.value);
        else if (type == 'geom') return operand.value;
        else if (type == 'list') return DBPredicate.operandListItem(operand.values);
    }

    static fieldItem(fieldName) {
        return new DBPredicate('field', fieldName);
    }

    static constItem(value) {
        if (value === '' || value === null || value === undefined)
            return new DBPredicate('named_const', null);
        if (typeof value == 'string') return new DBPredicate('str_const', value);
        if (value instanceof Date) return new DBPredicate('str_const', value.toISOString());
        if (typeof value == 'number') return new DBPredicate('num_const', value);
        if (typeof value == 'boolean') return new DBPredicate('bool_const', value);

        throw new Error('Cannot build predicate: Bad constant:', value);
    }

    static operandListItem(values) {
        const operands = [];
        for (const value of values) {
            operands.push(DBPredicate.constItem(value));
        }

        return new DBPredicate('operand_list', '', operands);
    }

    treeStr(indent) {
        if (!indent) indent = '';

        let lines = `${indent + this.type} ${this.value}\n`;
        indent += '  ';
        this.operands.forEach(op => {
            if ('treeStr' in op) {
                lines += op.treeStr(indent);
            }
        });

        return lines;
    }

    fieldNames() {
        const names = this._fieldNames();
        return [...new Set(names)].sort();
    }

    _fieldNames() {
        let names = [];

        if (this.type == 'field') names.push(this.value);

        this.operands.forEach(operand => {
            names = names.concat(operand._fieldNames());
        });

        return names;
    }

    sqlFilter(table, fieldMap, variableMap, dialect = 'SQL') {
        // Returns SQL select clause for applying self on TABLE
        //
        // VARIABLEMAP is a dict of session variable values. DIALECT defines the dialect to generate, one of:
        //  'SQL'   SQLITE SQL
        //  'CQL'   Geoserver CQL
        //
        // Optional FIELD_MAP is a mapping from the columns of TABLE to a separate target table (e.g. pole -> geom_world_point).
        // If provided, the resulting query is for the target table

        if (this.type == 'unary_op')
            return this._sqlUnaryOpFilter(table, this.operands[0], fieldMap, variableMap, dialect);
        if (this.type == 'join_op')
            return this._sqlJoinOpFilter(
                table,
                this.operands[0],
                this.operands[1],
                fieldMap,
                variableMap,
                dialect
            );
        if (this.type == 'comp_op')
            return this._sqlCompOpFilter(
                table,
                this.operands[0],
                this.operands[1],
                fieldMap,
                variableMap,
                dialect
            );
        if (this.type == 'func_op')
            return this._sqlInOpFilter(
                table,
                this.operands[0],
                this.operands[1],
                fieldMap,
                variableMap,
                dialect
            );
        if (this.type == 'geom_op')
            return this._sqlGeomOpFilter(
                table,
                this.operands[0],
                this.operands[1],
                fieldMap,
                variableMap,
                dialect
            );
        if (this.type == 'bool_const')
            return this._asSqlOperand(table, fieldMap, variableMap, dialect);

        throw Error(`Unknown parse node type: ${this.type}`);
    }

    _sqlUnaryOpFilter(table, operand1, fieldMap, variableMap, dialect) {
        // SQL select clause for a unary_op parse node

        if (this.value == 'not')
            return `NOT ${operand1.sqlFilter(table, fieldMap, variableMap, dialect)}`;

        throw Error(`Unknown unary_op type: ${this.value}`);
    }

    _sqlJoinOpFilter(table, operand1, operand2, fieldMap, variableMap, dialect) {
        // SQL select clause for a join_op parse node

        const sqlOp1 = operand1.sqlFilter(table, fieldMap, variableMap, dialect);
        const sqlOp2 = operand2.sqlFilter(table, fieldMap, variableMap, dialect);
        let op;
        if (this.value == '&') op = 'AND';
        if (this.value == '|') op = 'OR';
        if (!op) throw Error(`Unknown join_op type: ${this.value}`);

        return joinSqlStrings(op, [sqlOp1, sqlOp2]);
    }

    _sqlGeomOpFilter(table, operand1, geom, fieldMap, variableMap, dialect) {
        // SQL select clause for a geom_op parse node

        const geometryFieldName = operand1.value;

        if (this.value == 'intersects') {
            const nativeDb = global.myw?.app?.database?.system?.server?._db;
            if (!nativeDb)
                throw new Error(`Geom operators only supported in Anywhere App environment`);
            const nativeTable = nativeDb.dd.getFeatureTable('myworld', table);
            let sql = nativeTable
                .query()
                ._whereIntersectsClause(geometryFieldName, geom, this.bindParams);
            return sql;
        }

        throw Error(`Unknown join_op type: ${this.value}`);
    }

    _sqlCompOpFilter(table, operand1, operand2, fieldMap, variableMap, dialect) {
        // SQL select clause for a comparison op parse node

        const sql_op1 = operand1._asSqlOperand(table, fieldMap, variableMap, dialect);
        const sql_op2 = operand2._asSqlOperand(table, fieldMap, variableMap, dialect);
        let comp_op = this.value;

        if (comp_op == 'ilike') {
            if (dialect == 'CQL') {
                return `( strToLowerCase(${sql_op1}) LIKE(${sql_op2}) )`;
            } else {
                return `( lower(${sql_op1}) LIKE lower(${sql_op2} ) ESCAPE "\\" )`; //Escape wildCards for sqlite
            }
        }
        if (dialect != 'CQL') {
            //Escape wildCards for sqlite
            if (comp_op == 'like') {
                return `( ${sql_op1} ${comp_op} ${sql_op2} ESCAPE "\\"  )`;
            }
        }
        if (comp_op == '=' && this.isNull(sql_op2)) comp_op = ' IS ';
        if (comp_op == '<>' && this.isNull(sql_op2)) comp_op = ' IS NOT ';

        return `( ${sql_op1} ${comp_op} ${sql_op2} )`;
    }

    _sqlInOpFilter(table, operand1, operand2, fieldMap, variableMap, dialect) {
        // SQL select clause for a in() operator parse node

        const sql_op1 = operand1._asSqlOperand(table, fieldMap, variableMap, dialect);
        let sqlArgList = [];

        operand2.operands.forEach(op => {
            const variableValue = op.variableValue(variableMap);
            if (op.type == 'variable' && Array.isArray(variableValue)) {
                // Case: Session variable set to list
                variableValue.forEach(var_el => {
                    sqlArgList.push(this._parseLiteral(var_el, dialect));
                });
            } else {
                // Case: Everything else
                sqlArgList.push(op._asSqlOperand(table, fieldMap, variableMap, dialect));
            }
        });

        let clauses = [];
        if (sqlArgList.some(x => 'NULL' === x)) {
            sqlArgList = sqlArgList.filter(x => 'NULL' !== x);
            clauses.push(`${sql_op1} IS NULL`);
            clauses.push(`${sql_op1} = ''`);
        }
        if (sqlArgList.length) {
            clauses.push(`${sql_op1} IN (${sqlArgList.join()})`);
        }

        return clauses.length ? `( ${clauses.join(' OR ')} )` : dialect == 'CQL' ? 'FALSE' : '1=0'; //older sqlite versions don't accept TRUE/FALSE
    }

    _asSqlOperand(table, fieldMap, variableMap, dialect) {
        // SQL select element for a literal, field or session variable reference

        let bool_consts = {};
        if (dialect == 'CQL') {
            bool_consts = { true: 'TRUE', false: 'FALSE' };
        } else {
            bool_consts = { true: '1', false: '0' };
        }

        switch (this.type) {
            case 'str_const':
                return this._parseLiteral(this.value, dialect);

            case 'bool_const':
                return bool_consts[this.value];

            case 'field':
                if (fieldMap) {
                    if (fieldMap[this.value].sqlType)
                        return this._sqlCast(
                            fieldMap[this.value].target,
                            fieldMap[this.value].sqlType
                        );
                    else return fieldMap[this.value].target;
                } else return `"${this.value}"`;

            case 'variable':
                //ENH: move this check inside the actual method
                if (this.variableValue(variableMap) === undefined) return 'NULL';
                else return this._parseLiteral(this.variableValue(variableMap, dialect));

            case 'named_const':
                if (this.value === null) return 'NULL';
                return this.value;

            default:
                return this.value;
        }
    }

    _parseLiteral(value, dialect) {
        if (this.isNull(value)) return 'NULL';
        if (dialect === 'SQL' && typeof value === 'string') {
            //  SQLite requires single quotes to be escaped to two single quotes
            return `'${value.replace(/'/g, "''")}'`;
        } else {
            return `'${value}'`;
        }
    }

    /** ==============================================================================
     *                                MATCHING
     *================================================================================
     */
    matches(record, sessionVars) {
        if (this.type == 'unary_op')
            return this._evaluateUnaryOp(record, this.operands[0], sessionVars);
        if (this.type == 'join_op')
            return this._evaluateJoinOp(record, this.operands[0], this.operands[1], sessionVars);
        if (this.type == 'comp_op')
            return this._evaluateCompOp(record, this.operands[0], this.operands[1], sessionVars);
        if (this.type == 'func_op')
            return this._evaluateInOp(record, this.operands[0], this.operands[1], sessionVars);
        if (this.type == 'bool_const') return this.value;

        throw Error(`Unknown parse node type: ${this.type}`);
    }

    _evaluateUnaryOp(record, operand1, sessionVars) {
        if (this.value == 'not') return !operand1.matches(record, sessionVars);

        throw Error(`Unknown parse node type: ${this.type}`);
    }

    _evaluateJoinOp(record, operand1, operand2, sessionVars) {
        const sqlOp1 = operand1.matches(record, sessionVars);
        const sqlOp2 = operand2.matches(record, sessionVars);

        if (this.value == '&') return sqlOp1 && sqlOp2;
        if (this.value == '|') return sqlOp1 || sqlOp2;

        throw Error(`Unknown join_op type: ${this.value}`);
    }

    _evaluateCompOp(record, operand1, operand2, sessionVars) {
        const op1 = operand1._evaluateOperand(record, sessionVars);
        const op2 = operand2._evaluateOperand(record, sessionVars);
        const compOp = this.value;

        if (compOp == '=') return op1 == op2;
        if (compOp == '<>') return op1 != op2;
        if (compOp == '<=') return op1 <= op2;
        if (compOp == '>=') return op1 >= op2;
        if (compOp == '<') return op1 < op2;
        if (compOp == '>') return op1 > op2;
        if (compOp == 'like') return this._eavluateStrLike(op1, op2, true);
        if (compOp == 'ilike') return this._eavluateStrLike(op1, op2, false);

        throw Error(`Unknown comparison parse node type: ${this.type}`);
    }

    _eavluateStrLike(str, sqlPattern, caseSensitive) {
        /**
         * True if STR matches SQL_PATTERN
         * SQL_PATTERN is a SQL style 'like' pattern (special chars %, _ and \)
         */

        const rePattern = DBPredicate.prototype._regexFor(sqlPattern);
        let flag = 'm';
        if (!caseSensitive) flag += 'i';
        const regex = new RegExp(rePattern, flag);

        if (!str) str = '';
        return !!str.match(regex);
    }
    _evaluateInOp(record, operand1, operand2, sessionVars) {
        // Evaluate 'in' operator on REC

        //Get arg to perform in test on
        const op1 = operand1._evaluateOperand(record, sessionVars);

        //Build args to in(), expanding session variables (where necessary)
        let value;
        let values = [];
        operand2.operands.forEach(operand => {
            value = operand.variableValue(sessionVars);
            if (Array.isArray(value))
                values = values.concat(value.map(x => DBPredicate.prototype._evaluateValue(x)));
            else values.push(operand._evaluateOperand(record, sessionVars));
        });

        return values.includes(op1);
    }
    _evaluateOperand(record, sessionVars) {
        //Self's value as an expression operand on REC
        let value;
        if (this.type == 'field') return record.properties[this.value];

        if (this.type == 'variable') {
            value = this.variableValue(sessionVars);
            //ENH: move this check inside the actual method
            if (value === undefined) return null;
            else return value;
        }

        if (this.type.endsWith('const')) return this.value;

        throw Error(`Not an operand:${this.type}`);
    }
    _evaluateValue(value) {
        return value === '' || value === null || value === undefined ? null : value;
    }

    /**
     * ==============================================================================
     *                              HELPERS
     * ==============================================================================
     */

    _regexFor(sqlPattern) {
        /**
         * The python regex pattern equivalent to SQL_PATTERN
         *
         * SQL_PATTERN can contain the following wildcards:
         * %  Any number of any char
         * _  Exactly one char
         *
         * The character '\' can be used to escape a wildcard
         */

        const wildcardReps = {
            _: '.', // Convert sql wildcard -> regex wildcard
            '%': '.*'
        };

        const specialCharReps = {
            '.': '\\.', // Escape regex special chars
            '*': '\\*',
            '^': '\\^',
            $: '\\$',
            '+': '\\+',
            '?': '\\?',
            '{': '\\{',
            '}': '\\}',
            '[': '\\[',
            ']': '\\]',
            '(': '\\(',
            ')': '\\)',
            '|': '\\|'
        };

        let rePattern = '';
        let escaping = false;
        let i;
        for (i = 0; i < sqlPattern.length; i++) {
            if (escaping) {
                rePattern += specialCharReps[sqlPattern[i]] || sqlPattern[i]; //Case: Previous char was '\'
                escaping = false;
            } else if (sqlPattern[i] == '\\') escaping = true;
            // Case: This char is SQL escape
            else if (sqlPattern[i] in wildcardReps) {
                rePattern += wildcardReps[sqlPattern[i]]; // Case: This char is SQL wildcard
            } else {
                rePattern += sqlPattern[i]; // Case: This char is SQL literal
            }
        }
        return rePattern;
    }

    variableValue(variableMap) {
        // Get value of a session variable node (handling default)
        let name, defaultValue, value;
        const parts = this.value?.toString().split(':') ?? [];

        name = parts[0];
        if (parts.length > 1) {
            parts.shift();
            defaultValue = parts.join(':');
        } else {
            defaultValue = undefined;
        }

        if (variableMap && name in variableMap) value = variableMap[name];
        else value = defaultValue;

        return value;
    }

    _sqlCast(field, type) {
        return `cast( ${field} as ${type} ) `;
    }

    isNull(value) {
        if ([null, undefined].includes(value)) return true;
        if ('string' === typeof value)
            return ['', 'null'].includes(value.toLowerCase()) ? true : false;
        return false;
    }
}

DBPredicate.true = new DBPredicate('bool_const', true);
DBPredicate.false = new DBPredicate('bool_const', false);
