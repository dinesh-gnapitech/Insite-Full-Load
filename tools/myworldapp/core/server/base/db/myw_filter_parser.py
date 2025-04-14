###############################################################################
# Parser for myWorld filter expressions
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import re
from collections import namedtuple
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError

from .myw_db_predicate import MywDbPredicate


# BNF definition of filter langauge (formulated for recursive descent parsing) is:
#
#    <expr>         ::=  <and_expr> { '|' <and_expr> }
#    <and_expr>     ::=  <clause> { '&' <clause> }
#    <clause>       ::=  'not' <clause> | <bool_clause>
#    <bool_clause>  ::=  <bool_expr> | '(' <expr> ')'
#    <bool_expr>    ::=  <bool_const> | <operand> <comp_op> <operand> | <operand> 'in' <operand_list>
#    <comp_op>      ::=  '=' | '<>' | '<' | '<=' | '>=' | '>' | 'like' | 'ilike'
#    <operand_list> ::=  '(' <operand> { ',' <operand> } ')'
#    <operand>      ::=  <field> | <variable> | <str_const> | <num_const> | <bool_const> | <named_const>
#    <field>        ::=  '[' <name> ']'
#    <variable>     ::=  '{' <name> [':' <default>] '}'
#    <str_const>    ::=   '<string>'
#    <num_const>    ::=  [ '+' | '-' ] <digits> [ '.' <digits> ]
#    <bool_const>   ::=  true | false
#    <named_const>  ::=  null
#
# Examples:
#    [owner] = 'fred'
#    [owner] = 'burt' & [status] <> 1
#    ( [owner]='fred' | [status]>1 ) & ( [closed]=false )
#
# This formulation gives operator binding as a per SQL
# i.e. comp_ops bind tightest, then & then |. This permits
# conversion to SQL by simple textual substitution in Native App.
#
# See https://www.engr.mun.ca/~theo/Misc/exp_parsing.htm for
# info on recursive descent parsing

lex_els = []

# Helper to add an element to the lex_els table
def defineToken(type, regexp, skip=0, ignore_case=False, cast=None):
    flags = re.IGNORECASE if ignore_case else 0
    regexp = re.compile(regexp, flags)
    lex_els.append([type, regexp, skip, ignore_case, cast])


# Helper to 'cast' named constants to their values
def constant(value):
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "null":
        return None
    raise Exception("Unknown named constant: " + value)


# Definition of lexical elements
defineToken("field", "\[(.*?)\]", skip=2)  # Database field
defineToken("variable", "\{(.*?)\}", skip=2)  # Session variable
defineToken("str_const", "'(.*?)'", skip=2)  # Quoted string # ENH: Handle escaped quotes
defineToken("num_const", "([-+]?\d+\.\d*)", cast=float)  # Float
defineToken("num_const", "([-+]?\d+)", cast=int)  # Integer
defineToken("bool_const", "(false)(\W|$)", ignore_case=True, cast=constant)  # Named literals
defineToken("bool_const", "(true)(\W|$)", ignore_case=True, cast=constant)
defineToken("named_const", "(null)(\W|$)", ignore_case=True, cast=constant)
defineToken("comp_op", "(<>)")  # Comparison operators
defineToken("comp_op", "(<=)")
defineToken("comp_op", "(>=)")
defineToken("comp_op", "(<)")
defineToken("comp_op", "(>)")
defineToken("comp_op", "(=)")
defineToken("comp_op", "(like)\W", ignore_case=True)
defineToken("comp_op", "(ilike)\W", ignore_case=True)
defineToken("func_op", "(in)\W", ignore_case=True)
defineToken("unary_op", "(not)\W", ignore_case=True)
defineToken("join_op", "(&)")  # Clause joins
defineToken("join_op", "(\|)")
defineToken("punct", "(\()")  # Punctuation
defineToken("punct", "(\))")
defineToken("punct", "(\,)")

# A lexical token
Token = namedtuple("Token", "type value")


class MywFilterParser:
    """
    Helper to parse a myWorld record filter expresion (as used in query configuration)
    """

    # Implemented using classic recursive-descent approach
    # See https://www.engr.mun.ca/~theo/Misc/exp_parsing.htm

    def __init__(self, expr, progress=MywProgressHandler()):
        """
        Create a parser for filter string EXPR

        EXPR is a filter expression containing field refs, literals, etc e.g.
            [owner]='fred' & [status]>1"""

        self.expr = expr
        self.progress = progress
        self.ch = 0  # Index of next character to read
        self.next_token = None  # Next token to yield

    def parse(self):
        """
        Parse the expression

        Returns a MywDbPredicate"""

        self.progress(1, "Parsing filter expression:", self.expr)

        tree = self.readExpression()

        self.progress(2, "Parse result:", tree)  # ENH: Find an efficient way to show whole tree

        return tree

    def readExpression(self, closing_token=Token("eof", None)):
        """
        Read an expression from the stream

           <expr> ::=  <and_expr> { '|' <and_expr> }

        Returns a MywDbPredicate"""

        # Read first clause
        node = self.readAndExpression()

        # Read remaining clauses
        while self.nextTokenIs("join_op", "|"):
            token = self.readToken()
            node = MywDbPredicate("join_op", "|", node, self.readAndExpression())

        # Deal with trailing bracket (if present)
        token = self.readToken()
        if token != closing_token:
            self.error("Expected {}: Got: {}", closing_token.value, token)

        return node

    def readAndExpression(self):
        """
        Read an AND expression from the parse stream

           <and_expr> ::= <clause> { '&' <clause> }

        Returns a MywDbPredicate"""

        # Read first clause
        node = self.readClause()

        # Read remaining clauses
        while self.nextTokenIs("join_op", "&"):
            token = self.readToken()
            node = MywDbPredicate("join_op", "&", node, self.readClause())

        return node

    def readClause(self):
        """
        Reads a clause from the parse stream

           <clause> ::= 'not' <clause> | <bool_clause>

        Returns a MywDbPredicate"""

        if self.nextTokenIs("unary_op", "not"):
            token = self.readToken()
            op1_node = self.readClause()
            return MywDbPredicate(token.type, token.value, op1_node)

        else:
            return self.readBoolClause()

    def readBoolClause(self):
        """
        Reads a boolean clause from the parse stream

           <clause> ::= <bool_expr> | '(' <expr> ')'

        Returns a MywDbPredicate"""

        if self.nextTokenIs("punct", "("):
            self.readToken()
            return self.readExpression(Token("punct", ")"))

        else:
            return self.readBoolExpr()

    def readBoolExpr(self):
        """
        Read a boolean expression from the parse stream

             <bool_expr> ::= <operand> <comp_op> <operand> | <operand> 'in' <operand_list>

        Returns a MywDbPredicate"""

        op1_node = self.readOperand()

        # Case: Literal
        if op1_node.type == "bool_const" and not self.nextTokenTypeIs("comp_op", "func_op"):
            return op1_node

        # Case: Function or comparitor
        op_token = self.readToken("comp_op", "func_op")

        if op_token.type == "func_op":
            op2_node = self.readOperandList()
        else:
            op2_node = self.readOperand()

        return MywDbPredicate(op_token.type, op_token.value, op1_node, op2_node)

    def readOperandList(self):
        """
        Reads an operand list from the parse stream

           <operand>  ::=  '(' <operand> { ',' <operand> } ')'

        Returns a MywDbPredicate"""

        operands = []

        # Check start of list
        token = self.readToken()
        self.assertTokenIs(token, "punct", "(")

        # Case: Empty list
        if self.nextTokenIs("punct", ")"):
            token = self.readToken()

        # Case: Comma-separated list
        else:
            while True:
                operands.append(self.readOperand())

                token = self.readToken("punct")
                if token.value != ",":
                    break

        # Check terminator
        self.assertTokenIs(token, "punct", ")")

        return MywDbPredicate("operand_list", "", *operands)

    def readOperand(self):
        """
        Reads an operand from the parse stream

           <operand>  ::=  '[' <field> ']' | '{' <variable> '}' | <str_const> | <num_const> | <bool_const> | <named_const>

        Returns a MywDbPredicate"""

        token = self.readToken(
            "field", "variable", "str_const", "num_const", "bool_const", "named_const"
        )

        return MywDbPredicate(token.type, token.value)

    def nextTokenTypeIs(self, *types):
        """
        Peek the token type that .readToken() will return
        """

        if self.next_token == None:
            self.next_token = self._readToken()

        return self.next_token.type in types

    def nextTokenIs(self, type, value):
        """
        Peek the token that .readToken() will return
        """

        if self.next_token == None:
            self.next_token = self._readToken()

        return self.next_token == (type, value)

    def assertTokenIs(self, token, type, value):
        """
        Raise an error if TOKEN is not (type,value)
        """

        if token != (type, value):
            self.error("Expected {}: Got: {}", value, token.value)

    def readToken(self, *permitted_types):
        """
        Reads next token from the parse stream (if there is one)

        Returns a tuple (type,value)"""

        if self.next_token == None:
            self.next_token = self._readToken()

        token = self.next_token

        if permitted_types and not (token[0] in permitted_types):
            self.error("Expected {}: Got: {}", "|".join(permitted_types), token)

        self.next_token = self._readToken()

        self.progress(5, "Token:", token)

        return token

    def _readToken(self):
        """
        Reads next token from the parse stream (if there is one)

        Performs the lexical analysis and token type recogition"""

        if not self.advanceToNextToken():
            return Token("eof", None)

        for args in lex_els:
            token = self._readTokenIfPresent(*args)
            if token == None:
                continue

            return token

        self.error("Unexpected token: '{}'", self.exprTail(True))

    def _readTokenIfPresent(self, type, regexp, skip=0, ignore_case=False, cast=None):
        """
        Read the next token from the stream (if it matches REGEXP)

        Returns token (or None)"""

        expr_str = self.exprTail()

        # Do match
        match = re.match(regexp, expr_str)
        if not match:
            return None

        # Get value
        value = match.groups(1)[0]
        if ignore_case:
            value = value.lower()

        # Advance stream pointer
        self.ch += len(value) + skip

        # Convert value to required type
        if cast != None:
            value = cast(value)

        return Token(type, value)

    def advanceToNextToken(self):
        """
        Skip to start of next token

        Returns True if there is a token to read"""

        whitespace = " \t\n"

        while True:
            if self.ch >= len(self.expr):
                return False

            if not (self.expr[self.ch] in whitespace):
                return True

            self.ch += 1

    def exprTail(self, first_token_only=False):
        """
        The part of self.expr not yet processed (if any)
        """

        if self.ch >= len(self.expr):
            return None

        rem = self.expr[self.ch :]

        if first_token_only:
            rem = rem.split()[0]

        return rem

    def error(self, msg, *args):
        """
        Raise a parse error
        """

        err = msg.format(*args)

        raise MywError("Cannot parse '{}': Near char {}: {}".format(self.expr, self.ch, err))
