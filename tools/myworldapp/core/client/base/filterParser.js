// Copyright: IQGeo Limited 2010-2023
import { isEqual } from 'underscore';
import { DBPredicate } from './dbPredicate';

const lex_els = [];
function defineToken(type, regexp, skip, ignore_case, cast) {
    // Helper to define a lexeme
    if (!skip) skip = 0;
    if (!ignore_case) ignore_case = false;
    lex_els.push({ type: type, regexp: regexp, skip: skip, ignore_case: ignore_case, cast: cast });
}

function parseConstant(value) {
    if (value == 'true') return true;
    if (value == 'false') return false;
    if (value == 'null') return null;
}

defineToken('field', /^\[(.*?)\]/, 2, false);
defineToken('variable', /^\{(.*?)\}/, 2, false);
defineToken('str_const', /^'(.*?)'/, 2);
defineToken('num_const', /^([-+]?\d+\.\d*)/, 0, false, parseFloat);
defineToken('num_const', /^([-+]?\d+)/, 0, false, parseInt);
defineToken('bool_const', /^(false)(\W|$)/i, 0, true, parseConstant);
defineToken('bool_const', /^(true)(\W|$)/i, 0, true, parseConstant);
defineToken('named_const', /^(null)(\W|$)/i, 0, true, parseConstant);
defineToken('comp_op', /^(<>)/);
defineToken('comp_op', /^(<=)/);
defineToken('comp_op', /^(>=)/);
defineToken('comp_op', /^(<)/);
defineToken('comp_op', /^(>)/);
defineToken('comp_op', /^(=)/);
defineToken('comp_op', /^(like)\W/i, 0, true);
defineToken('comp_op', /^(ilike)\W/i, 0, true);
defineToken('func_op', /^(in)\W/i, 0, true);
defineToken('unary_op', /^(not)\W/i, 0, true);
defineToken('join_op', /^(&)/);
defineToken('join_op', /^(\|)/);
defineToken('punct', /^(\()/);
defineToken('punct', /^(\))/);
defineToken('punct', /^(\,)/);

export class FilterParser {
    constructor(expr) {
        this.expr = expr;
        this.ch = 0;
        this.next_token = undefined;
    }

    parse() {
        const tree = this.readExpression();
        return tree;
    }

    readExpression(closing_token) {
        // Read an expression from the stream
        //    <expr> ::=  <and_expr> { '|' <and_expr> }

        let token;

        if (!closing_token) closing_token = { type: 'eof' };

        // Read first clause
        let node = this.readAndExpression();

        // Read remaining clauses
        while (this.nextTokenIs('join_op', '|')) {
            token = this.readToken();
            const { type, value } = token;
            node = new DBPredicate(type, value, [node, this.readAndExpression()]);
        }

        // Deal with trailing spaces if pressent
        token = this.readToken();
        if (!isEqual(token, closing_token)) {
            throw Error(`Expected token '${closing_token}' got token '${token.type}'`);
        }

        return node;
    }

    readAndExpression() {
        // Read an AND expression from the parse stream
        //    <and_expr> ::= <clause> { '&' <clause> }

        let node = this.readClause();

        while (this.nextTokenIs('join_op', '&')) {
            const token = this.readToken();
            const { type, value } = token;
            node = new DBPredicate(type, value, [node, this.readClause()]);
        }
        return node;
    }

    readClause() {
        // Read a clause from the parse stream
        //    <clause> ::= 'not' <clause> | <bool_clause>

        if (this.nextTokenIs('unary_op', 'not')) {
            const token = this.readToken();
            const op1_node = this.readClause();
            const { type, value } = token;
            return new DBPredicate(type, value, [op1_node]);
        } else {
            return this.readBoolClause();
        }
    }

    readBoolClause() {
        // Read a  boolean clause from the parse stream
        //    <clause> ::= <bool_expr> | '(' <expr> ')'

        if (this.nextTokenIs('punct', '(')) {
            this.readToken();
            return this.readExpression({ type: 'punct', value: ')' });
        } else {
            return this.readBoolExpr();
        }
    }

    readBoolExpr() {
        // Read a comparison from the parse stream
        //    <bool_expr> ::= <bool_const> | <operand> <comp_op> <operand> | <operand> 'in' <operand_list>

        const op1_node = this.readOperand();

        // Case: Literal
        if (op1_node.type == 'bool_const' && !this.nextTokenTypeIs(['comp_op', 'func_op'])) {
            return op1_node;
        }

        // Case: Function or comparitor
        const op_token = this.readToken(['comp_op', 'func_op']);

        let op2_node;
        if (op_token.type == 'func_op') {
            op2_node = this.readOperandList();
        } else {
            op2_node = this.readOperand();
        }
        const { type, value } = op_token;
        return new DBPredicate(type, value, [op1_node, op2_node]);
    }

    readOperandList() {
        // Reads an operand list from the parse stream
        //    <operand>  ::=  '(' <operand> { ',' <operand> } ')'

        const operands = [];

        let token = this.readToken();
        this.assertTokenIs(token, 'punct', '(');

        if (this.nextTokenIs('punct', ')')) {
            // Case: Empty list
            token = this.readToken();
        } else {
            // Case: Comma-separated list
            do {
                operands.push(this.readOperand());

                token = this.readToken(['punct']);
            } while (token.value == ',');
        }

        this.assertTokenIs(token, 'punct', ')');

        return new DBPredicate('operand_list', '', operands);
    }

    readOperand() {
        // Reads an operand from the parse stream
        //    <operand>  ::=  '[' <field> ']' | '{' <variable> '}' | <str_const> | <num_const> | <bool_const> | <named_const>

        const token = this.readToken([
            'field',
            'str_const',
            'variable',
            'num_const',
            'bool_const',
            'named_const'
        ]);

        const { type, value } = token;
        return new DBPredicate(type, value);
    }

    assertTokenIs(token, type, value) {
        // Raise an error if TOKEN is not (type,value)
        if (!isEqual(token, { type, value })) {
            throw Error(
                `Error: Unexpected token.  : Expected: ${type} '${value}' : Got: ${token.type} '${token.value}' `
            );
        }
    }

    nextTokenTypeIs(types) {
        // Peek the type of the token that .readToken() will return
        if (!this.next_token) {
            this.next_token = this._readToken();
        }
        return types.includes(this.next_token.type);
    }

    nextTokenIs(type, value) {
        // Peek the token that .readToken() will return
        if (!this.next_token) {
            this.next_token = this._readToken();
        }
        return isEqual(this.next_token, { type, value });
    }

    readToken(permitted_types) {
        // Reads next token from the parse stream (if there is one)

        if (!this.next_token) {
            this.next_token = this._readToken();
        }

        const token = this.next_token;

        if (permitted_types && !permitted_types.includes(token.type)) {
            throw Error(
                `Error: Unexpected token.  : Expected: ${permitted_types} : Got: ${token.type} '${token.value}' `
            );
        }

        this.next_token = this._readToken();
        return token;
    }

    _readToken() {
        // Reads next token from the parse stream (if there is one)

        if (!this.advanceToNextToken()) {
            return { type: 'eof' };
        }

        for (const args of lex_els) {
            const token = this._readTokenIfPresent(args);

            if (token) return token;
        }

        throw Error(`Syntax error in filter: ${this.expr} : At char ${this.ch}`);
    }

    _readTokenIfPresent(args) {
        // type, regexp, skip, ignore_case, cast
        // Read the next token from the stream (if it matches REGEXP)
        //
        // Returns token (or None)

        const expr_str = this.exprTail();

        const match = expr_str.match(args['regexp']);
        if (!match) return;

        let value = match[1];
        if (args['ignore_case']) {
            value = value.toLowerCase();
        }

        this.ch += value.length + args['skip'];

        const caster = args['cast'];
        if (caster) value = caster(value);

        return { type: args['type'], value: value };
    }

    advanceToNextToken() {
        // Skip to start of next token (if there is one)

        const whitespace = ' \t\n';

        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (this.ch >= this.expr.length) {
                return false;
            }

            if (!whitespace.includes(this.expr[this.ch])) {
                return true;
            }
            this.ch++;
        }
    }

    exprTail(first_token_only) {
        // The part of self.expr not yet processed (if any)

        if (this.ch >= this.expr.length) {
            return;
        }

        let rem = this.expr.substr(this.ch);

        if (first_token_only) {
            rem = rem.split()[0];
        }

        return rem;
    }
}

FilterParser.truePredicate = () => new DBPredicate('named_const', 'TRUE');

FilterParser.falsePredicate = () => new DBPredicate('named_const', 'FALSE');
