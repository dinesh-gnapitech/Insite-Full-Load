###############################################################################
# Parse node from a myWorld filter expression
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import re
from typing import Dict
from sqlalchemy import literal, null, not_, or_
from sqlalchemy.sql.elements import Null as null_element
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.geom.myw_geo_utils import degrees_to_metres


class MywDbPredicate:
    """
    A node in a filter expression parse tree

    Represents an operator, literal or variable reference (see .type).
    Also implements tree-like behaviour that operates on it's subtree"""

    # ==============================================================================
    #                                 CONSTRUCTION
    # ==============================================================================

    def __init__(self, type, value, *operands):
        """
        Init slots of self
        """

        self.type = type
        self.value = value
        self.operands = operands

    def __str__(self):
        """
        String representation of self
        """

        operands_str = ""
        for operand in self.operands:
            operands_str += "," + str(operand)

        return "{}({},{}{})".format(self.__class__.__name__, self.type, self.value, operands_str)

    @staticmethod
    def newFrom(raw_pred):
        """
        Create a new instance from a array/dict representation
        """
        try:
            type = raw_pred[0]
            op = raw_pred[1]
            if type == "comp_op":
                return MywDbPredicate(
                    "comp_op",
                    op,
                    MywDbPredicate.operand(raw_pred[2]),
                    MywDbPredicate.operand(raw_pred[3]),
                )
            elif type == "func_op":
                return MywDbPredicate(
                    "func_op",
                    op,
                    MywDbPredicate.operand(raw_pred[2]),
                    MywDbPredicate.operand(raw_pred[3]),
                )
            elif type == "geom_op":
                return MywDbPredicate(
                    "geom_op",
                    op,
                    MywDbPredicate.operand(raw_pred[2]),
                    MywDbPredicate.operand(raw_pred[3]),
                )
            elif type == "unary_op":
                return MywDbPredicate("unary_op", op, MywDbPredicate.newFrom(raw_pred[2]))
            elif op == "and":
                return MywDbPredicate(
                    "join_op",
                    "&",
                    MywDbPredicate.newFrom(raw_pred[2]),
                    MywDbPredicate.newFrom(raw_pred[3]),
                )
            elif op == "or":
                return MywDbPredicate(
                    "join_op",
                    "|",
                    MywDbPredicate.newFrom(raw_pred[2]),
                    MywDbPredicate.newFrom(raw_pred[3]),
                )
            elif op == False:
                return MywDbPredicate.false
            elif op == True:
                return MywDbPredicate.true
            else:
                return MywDbPredicate.true
        except Exception as ex:
            print("Failed conversion to MywDbPredicate: ", raw_pred, "Exception:", ex)
            raise MywInternalError("MywDbPredicate.newFrom()", raw_pred)

    @staticmethod
    def operand(raw_operand: Dict):
        """
        Create an predicate operand instance from a dict with type and value properties
        """
        if raw_operand["type"] == "field":
            return MywDbPredicate.fieldItem(raw_operand["fieldName"])
        elif raw_operand["type"] == "literal":
            return MywDbPredicate.constItem(raw_operand["value"])
        elif raw_operand["type"] == "geom":
            from shapely.geometry import shape

            shapely_geom = shape(raw_operand["value"])
            return MywGeometry.newFromShapely(shapely_geom)
        elif raw_operand["type"] == "list":
            return MywDbPredicate.operandListItem(raw_operand["values"])

    # ==============================================================================
    #                                 CONSTRUCTION API
    # ==============================================================================
    # ENH: Use this API in MywFilterParser

    def __eq__(self, value):
        return self._compItem("=", value)  # ENH: Replace by ItemsFrom(value)?

    def __ne__(self, value):
        return self._compItem("<>", value)

    def __le__(self, value):
        return self._compItem("<=", value)

    def __ge__(self, value):
        return self._compItem(">=", value)

    def __lt__(self, value):
        return self._compItem("<", value)

    def __gt__(self, value):
        return self._compItem(">", value)

    def like(self, value):
        return self._compItem("like", value)

    def ilike(self, value):
        return self._compItem("ilike", value)

    def in_(self, values):
        return MywDbPredicate("func_op", "in", self, MywDbPredicate.operandListItem(values))

    def __and__(self, pred):
        return MywDbPredicate("join_op", "&", self, pred)

    def __or__(self, pred):
        return MywDbPredicate("join_op", "|", self, pred)

    def __invert__(self):
        return MywDbPredicate("unary_op", "not", self)

    # See https://geoalchemy-2.readthedocs.io/en/latest/spatial_functions.html
    # ENH: Add geomType, geomValid, ...
    def geomWithinDist(self, geom, dist, fully=False):
        dist_deg = dist / degrees_to_metres
        if fully:
            return MywDbPredicate(
                "geom_op", "d_fully_within", self, geom, dist_deg
            )  # Any point of B within DIST metres of A
        else:
            return MywDbPredicate(
                "geom_op", "d_within", self, geom, dist_deg
            )  # All points of B within DIST metres of A

    def geomContains(self, geom):
        return MywDbPredicate(
            "geom_op", "contains", self, geom
        )  # B intersects the interior of A but not the boundary

    def geomCovers(self, geom):
        return MywDbPredicate("geom_op", "covers", self, geom)  # No point in B is outside A

    def geomEquals(self, geom):
        return MywDbPredicate("geom_op", "equals", self, geom)  # A and B are the same

    def geomTouches(self, geom):
        return MywDbPredicate(
            "geom_op", "touches", self, geom
        )  # A and B share boundary but interiors do not intersect

    def geomCrosses(self, geom):
        return MywDbPredicate(
            "geom_op", "crosses", self, geom
        )  # A and B share some, but not all, interior points

    def geomOverlaps(self, geom):
        return MywDbPredicate(
            "geom_op", "overlaps", self, geom
        )  # A and B are same dimension, share some but not all points

    def geomCoveredBy(self, geom):
        return MywDbPredicate("geom_op", "covered_by", self, geom)  # No point in A is outside B

    def geomIntersects(self, geom, include_zero_lines=False):
        op = "intersects" if not include_zero_lines else "intersects_including_zero_lines"
        return MywDbPredicate("geom_op", op, self, geom)  # A and B share at least one points

    def geomDisjoint(self, geom):
        return MywDbPredicate("geom_op", "disjoint", self, geom)  # A and B do not share any points

    def _compItem(self, op, value):
        """
        Returns predicate node for comparitor OP

        VALUE is a leaf node or constant"""

        if not isinstance(value, MywDbPredicate):
            value = self.constItem(value)

        return MywDbPredicate("comp_op", op, self, value)

    @classmethod
    def fieldItem(self, field_name):
        """
        Returns predicate leaf node for FIELD_NAME
        """

        return MywDbPredicate("field", field_name)

    @classmethod
    def operandListItem(self, values):
        """
        Returns predicate node for operand list VALUES
        """

        operands = []

        for value in values:
            operands.append(self.constItem(value))

        return MywDbPredicate("operand_list", "", *operands)

    @classmethod
    def constItem(self, value):
        """
        Returns predicate leaf node for constant VALUE
        """

        if value == "" or value is None:
            return MywDbPredicate("named_const", None)
        if isinstance(value, str):
            return MywDbPredicate("str_const", value)
        if isinstance(value, (int, float)):
            return MywDbPredicate("num_const", value)
        if isinstance(value, bool):
            return MywDbPredicate("bool_const", value)

        raise MywInternalError("Cannot build predicate: Bad constant:", value)

    def __bool__(self):
        """
        Prevent accidential use in if statements etc

        Required because we have override __eq__()"""

        # ENH: Introduce separate class for leaf nodes, remove this?

        raise MywInternalError("Invalid boolean expression:", self)

    # ==============================================================================
    #                                TREE BEHAVIOUR
    # ==============================================================================

    def treeStr(self, indent=""):
        """
        String representation of self's sub-tree (recursive)

        Returns a multi-line pprint-style indented string"""

        lines = "{}{} {}\n".format(indent, self.type, self.value)

        indent += "   "
        for operand in self.operands:
            if isinstance(operand, MywDbPredicate):
                lines += operand.treeStr(indent)

        return lines

    def fieldNames(self):
        """
        Names of the fields that self's tree references (recursive)

        Returns a set"""

        names = set()

        if self.type == "field":
            names.add(self.value)

        for operand in self.operands:
            names.update(operand.fieldNames())

        return names

    # ==============================================================================
    #                           SQLALCHEMY FILTER BUILDING
    # ==============================================================================

    def sqaFilter(self, table, table2=None, field_map=None, variables={}):
        """
        The SQLAlchemy filter corresponding to self's tree (recursive)

        TABLE is the SQLAlchemy descriptor for the table on which
        the filter will operate.

        If optional table descriptor TABLE2 is provided, build
        the query on that instead. FIELD_MAP gives mapping
        of field names TABLE1 -> TABLE2.

        VARIABLES is a dict of session variable values for substitution into the query"""

        # Bundle up params for operand evaluation (just to keep arg lists down)
        params = {"table": table, "table2": table2, "field_map": field_map, "variables": variables}

        return self._asSqaFilter(params)

    def _asSqaFilter(self, params):
        """
        The SQLAlchemy filter corresponding to self's tree (recursive)

        TABLE is the SQLAlchemy descriptor for the table on which
        the filter will operate.

        If optional table descriptor TABLE2 is provided, build
        the query on that instead. FIELD_MAP gives mapping
        of field names TABLE1 -> TABLE2.

        PARAMS is a dict containing table defs, session variable values etc"""

        if self.type == "unary_op":
            return self._asSqaUnaryOp(params, self.operands[0])
        if self.type == "join_op":
            return self._asSqaJoinOp(params, self.operands[0], self.operands[1])
        if self.type == "comp_op":
            return self._asSqaCompOp(params, self.operands[0], self.operands[1])
        if self.type == "func_op":
            return self._asSqaInOp(params, self.operands[0], self.operands[1])
        if self.type == "geom_op":
            # pylint: disable=no-value-for-parameter
            return self._asSqaGeomOp(params, self.operands[0], *self.operands[1:])
        if self.type == "bool_const":
            return literal(self.value)

        raise MywInternalError("Unknown parse node type:", str(self))

    def _asSqaUnaryOp(self, params, operand1):
        """
        The SQLAlchemy filter implementing a unary operator (NOT, ...)
        """

        if self.value == "not":
            return not_(operand1._asSqaFilter(params))

        raise MywInternalError("Unknown unary_op parse node type:", str(self))

    def _asSqaJoinOp(self, params, operand1, operand2):
        """
        The SQLAlchemy filter implementing a join operator (AND, OR, ...)
        """

        if self.value == "&":
            return operand1._asSqaFilter(params) & operand2._asSqaFilter(params)
        if self.value == "|":
            return operand1._asSqaFilter(params) | operand2._asSqaFilter(params)

        raise MywInternalError("Unknown join parse node type:", str(self))

    def _asSqaCompOp(self, params, operand1, operand2):
        """
        The SQLAlchemy filter implementing a field comparison
        """
        # ENH: Force cast of operand2 to type of operand1 using literal(<val>,<type>)?

        sqa_op1 = operand1._asSqaOperand(params)
        sqa_op2 = operand2._asSqaOperand(params)

        if self.value == "=":
            if (
                isinstance(sqa_op2, null_element)
                and operand1.type == "field"
                and self._isCharacterColumn(sqa_op1)
            ):
                return or_(sqa_op1 == sqa_op2, sqa_op1 == literal(""))
            return sqa_op1 == sqa_op2
        if self.value == "<>":
            return sqa_op1 != sqa_op2
        if self.value == "<=":
            return sqa_op1 <= sqa_op2
        if self.value == ">=":
            return sqa_op1 >= sqa_op2
        if self.value == "<":
            return sqa_op1 < sqa_op2
        if self.value == ">":
            return sqa_op1 > sqa_op2
        if self.value == "like":
            return sqa_op1.like(sqa_op2)
        if self.value == "ilike":
            return sqa_op1.ilike(sqa_op2)

        raise MywInternalError("Unknown comparison parse node type:", str(self))

    def _asSqaInOp(self, params, operand1, operand2):
        """
        The SQLAlchemy filter implementing an 'in' operator
        """

        # Get arg to perform in test on
        sqa_op1 = operand1._asSqaOperand(params)

        # Build args to sqlalchemy in(), expanding session variables (where necessary)
        sqa_args = []
        for arg in operand2.operands:

            val = arg._valueFrom(params["variables"])

            if isinstance(val, list):

                def asSqaOperand(value):
                    if value == "" or value is None:
                        return null_element()
                    return value

                sqa_args += list(map(asSqaOperand, val))

            else:
                sqa_args.append(arg._asSqaOperand(params))

        # If in() list contains Nulls extract them and handle using IS NULL
        if any(isinstance(x, null_element) for x in sqa_args):
            sqa_args = [x for x in sqa_args if not isinstance(x, null_element)]
            if operand1.type == "field" and self._isCharacterColumn(sqa_op1):
                return or_(or_(sqa_op1 == None, sqa_op1 == literal("")), sqa_op1.in_(sqa_args))
            return or_(sqa_op1 == None, sqa_op1.in_(sqa_args))

        return sqa_op1.in_(sqa_args)

    def _asSqaGeomOp(self, params, operand1, geom, dist=None):
        """
        The SQLAlchemy filter implementing an 'within_distance' operator

        DIST is a distance in long/lat degrees"""

        # ENH: Support distance in 'm' using geography() - see db-driver.withinDistExpr() + add indexes

        sqa_geom_fld = operand1._asSqaOperand(params)
        sqa_geom_op = geom.ewkt()

        if self.value == "d_within":
            return sqa_geom_fld.ST_DWithin(sqa_geom_op, dist)
        if self.value == "d_fully_within":
            return sqa_geom_fld.ST_DFullyWithin(sqa_geom_op, dist)
        if self.value == "contains":
            return sqa_geom_fld.ST_Contains(sqa_geom_op)
        if self.value == "covers":
            return sqa_geom_fld.ST_Covers(sqa_geom_op)
        if self.value == "equals":
            return sqa_geom_fld.ST_Equals(sqa_geom_op)
        if self.value == "touches":
            return sqa_geom_fld.ST_Touches(sqa_geom_op)
        if self.value == "crosses":
            return sqa_geom_fld.ST_Crosses(sqa_geom_op)
        if self.value == "overlaps":
            return sqa_geom_fld.ST_Overlaps(sqa_geom_op)
        if self.value == "covered_by":
            return sqa_geom_fld.ST_CoveredBy(sqa_geom_op)
        if self.value == "intersects":
            return sqa_geom_fld.ST_Intersects(sqa_geom_op)
        if self.value == "intersects_including_zero_lines":
            # Workaround for PostGIS bug that intermittently misses zero-length linestrings in
            # Intersects queries.
            return sqa_geom_fld.ST_Intersects(sqa_geom_op) | (
                (sqa_geom_fld.ST_GeometryType() == "ST_LineString")
                & sqa_geom_fld.ST_StartPoint().ST_Intersects(sqa_geom_op)
            )
        if self.value == "disjoint":
            return sqa_geom_fld.ST_Disjoint(sqa_geom_op)

        raise MywInternalError("Unknown geom_op node type:", str(self))

    def _asSqaOperand(self, params):
        """
        Self as a SQLAlchemy filter operand

        TABLE is the SQLAlchemy descriptor for the table on which the filter will operate"""

        # Case: Field
        if self.type == "field":
            return self._asSqaFieldRef(params["table"], params["table2"], params["field_map"])

        # Case: Session variable
        if self.type == "variable":
            return self._asSqaVariableRef(params["variables"])

        # Case: Literal
        if self.type.endswith("_const"):
            return self._sqaLiteralFrom(self.value)

        raise MywInternalError("Not an operand:", str(self))  # Internal error

    def _asSqaFieldRef(self, table, table2=None, field_map=None):
        """
        Self as a SQLAlchemy field reference

        TABLE is the SQLAlchemy descriptor for the table on which the filter will operate"""

        from sqlalchemy.sql.expression import cast

        field_name = self.value

        # Get column definition
        col = table.columns.get(field_name)

        if col is None:
            raise MywError("Table", table.name, ":", "No such field:", field_name)

        # Handle mapping to field in different table
        if table2 == None:
            return col

        index_field_name = field_map[field_name]
        index_col = table2.columns[index_field_name]
        return cast(index_col, col.type)

    def _asSqaVariableRef(self, variables):
        """
        Self as a SQLAlchemy literal from dict VARIABLES
        """

        value = self._valueFrom(variables)

        return self._sqaLiteralFrom(value)

    def _sqaLiteralFrom(self, value):
        """
        VALUE as a SQLAlchemy literal (handling nulls)

        Provided because literal(None) does not seem to work properly (breaks server_test 'query')"""

        if value == "" or value == None:
            return null()
        else:
            return literal(value)

    # ==============================================================================
    #                                 MATCHING
    # ==============================================================================
    # ENH: Support geom_ops

    def matches(self, rec, variables={}):
        """
        True if self matches REC (recursive)

        Optional VARIABLES is a dict of session variable values"""

        if self.type == "unary_op":
            return self._evaluateUnaryOp(rec, self.operands[0], variables)
        if self.type == "join_op":
            return self._evaluateJoinOp(rec, self.operands[0], self.operands[1], variables)
        if self.type == "comp_op":
            return self._evaluateCompOp(rec, self.operands[0], self.operands[1], variables)
        if self.type == "func_op":
            return self._evaluateInOp(rec, self.operands[0], self.operands[1], variables)
        if self.type == "bool_const":
            return self.value

        raise MywInternalError("Unknown parse node type:", str(self))

    def _evaluateUnaryOp(self, rec, operand1, variables):
        """
        Evaluate a unary operator (NOT, ...)
        """

        if self.value == "not":
            return not operand1.matches(rec, variables)

        raise MywInternalError("Unknown unary_op parse node type:", str(self))

    def _evaluateJoinOp(self, rec, operand1, operand2, variables):
        """
        Evaluate join operator (AND, OR, ...)
        """

        if self.value == "&":
            return operand1.matches(rec, variables) and operand2.matches(rec, variables)
        if self.value == "|":
            return operand1.matches(rec, variables) or operand2.matches(rec, variables)

        raise MywInternalError("Unknown join parse node type:", str(self))

    def _evaluateCompOp(self, rec, operand1, operand2, variables):
        """
        Evaluate field comparison
        """

        op1 = operand1._evaluateOperand(rec, variables)
        op2 = operand2._evaluateOperand(rec, variables)

        if self.value == "=":
            return op1 == op2
        if self.value == "<>":
            return op1 != op2
        if self.value == "<=":
            return op1 <= op2
        if self.value == ">=":
            return op1 >= op2
        if self.value == "<":
            return op1 < op2
        if self.value == ">":
            return op1 > op2
        if self.value == "like":
            return self._evaluateStrLike(op1, op2, True)
        if self.value == "ilike":
            return self._evaluateStrLike(op1, op2, False)

        raise MywInternalError("Unknown comparison parse node type:", str(self))

    def _evaluateStrLike(self, str, sql_pattern, case_sensitive):
        """
        True if STR matches SQL_PATTERN (matching SQA like() behaviour)

        SQL_PATTERN is a SQA style 'like' pattern (special chars %, _ and \)"""

        # Get cached regexp
        # ENH: Assumes sql_pattern is constant. Safer to use a dict .. or do when predicate built?
        if not hasattr(self, "regexp"):

            re_pattern = self._regexFor(sql_pattern)

            re_flags = re.DOTALL  # SQAlchemy % matches newlines
            if not case_sensitive:
                re_flags |= re.IGNORECASE

            self.regexp = re.compile(re_pattern, re_flags)

        # Do match
        match = self.regexp.match(str or "")

        return match != None

    def _evaluateInOp(self, rec, operand1, operand2, variables):
        """
        Evaluate 'in' operator on REC
        """

        # Get arg to perform in test on
        op1 = operand1._evaluateOperand(rec, variables)

        # Build args to in(), expanding session variables (where necessary)
        vals = []
        for arg in operand2.operands:

            val = arg._valueFrom(variables)

            if isinstance(val, list):
                vals += [self._evaluateValue(x) for x in val]
            else:
                vals.append(arg._evaluateOperand(rec, variables))

        # If in() list contains Nulls extract them and handle using IS NULL
        if None in vals:
            vals.remove(None)
            return op1 == None or op1 in vals

        return op1 in vals

    def _evaluateOperand(self, rec, variables):
        """
        Self's value as an expression operand on REC
        """

        # Case: Field
        if self.type == "field":
            return self._evaluateValue(getattr(rec, self.value))

        # Case: Session variable
        if self.type == "variable":
            return self._valueFrom(variables)

        # Case: Literal
        if self.type.endswith("_const"):
            return self._evaluateValue(self.value)

        raise MywInternalError("Not an operand:", str(self))

    # ==============================================================================
    #                                    HELPERS
    # ==============================================================================

    def _valueFrom(self, variables):
        """
        Self's value from dict VARIABLES (handling defaults)

        Returns None unless self is of type 'variable'"""

        if self.type != "variable":
            return None

        parts = self.value.split(":", 1)

        if len(parts) > 1:
            name = parts[0]
            default = parts[1]
        else:
            name = parts[0]
            default = None

        return self._evaluateValue(variables.get(name, default))

    def _evaluateValue(self, value):
        """
        VALUE as a SQLAlchemy literal (handling nulls)

        Provided to match logic used by _sqaLiteralFrom (treat '' and None the same)"""

        if value == "" or value == None:
            return None
        else:
            return value

    def _isCharacterColumn(self, column):
        """
        Column as a SQLAlchemy Column

        Returns True if Column is recognised as a character type"""
        from sqlalchemy.schema import Column
        from sqlalchemy import types
        from .myw_string_mappers import MywNullMappingString, MywUTF8MappingString, MywJsonString

        if not isinstance(column, Column):
            return False
        if isinstance(column.type, MywNullMappingString):
            return True
        if isinstance(column.type, MywUTF8MappingString):
            return True
        if isinstance(column.type, MywJsonString):
            return True
        if isinstance(column.type, types.String):
            return True
        return False

    def _regexFor(self, sql_pattern):
        """
        The python regex pattern equivalent to SQL_PATTERN

        SQL_PATTERN can contain the following wildcards:
          %  Any number of any char
          _  Exactly one char

        The character '\' can be used to escape a wildcard"""
        # ENH: Move this down into utils

        wildcard_reps = {"_": ".", "%": ".*"}  # Convert sql wildcard -> regex wildcard

        special_char_reps = {
            ".": "\\.",  # Escape regex special chars
            "*": "\\*",
            "^": "\\^",
            "$": "\\$",
            "+": "\\+",
            "?": "\\?",
            "{": "\\{",
            "}": "\\}",
            "[": "\\[",
            "]": "\\]",
            "(": "\\(",
            ")": "\\)",
            "|": "\\|",
        }

        re_pattern = ""
        escaping = False
        for ch in sql_pattern:

            if escaping:  # Case: Previous char was '\'
                re_pattern += special_char_reps.get(ch, ch)
                escaping = False

            elif ch == "\\":  # Case: This char is SQL escape
                escaping = True

            elif ch in wildcard_reps:  # Case: This char is SQL wildcard
                re_pattern += wildcard_reps[ch]

            else:
                re_pattern += special_char_reps.get(ch, ch)  # Case: This char is SQL literal

        return re_pattern


# ==============================================================================
#                                    CONSTANTS
# ==============================================================================

MywDbPredicate.false = MywDbPredicate("bool_const", False)
MywDbPredicate.true = MywDbPredicate("bool_const", True)
