###############################################################################
# Parser for myWorld title and search expressions
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import copy


class MywExpressionParser:
    """
    Helper to parse a myWorld title expresion
    """

    def __init__(self, expr, pseudo_fields={}):
        """
        Create a parser for expression string EXPR

        EXPR is a expression containing field refs and literals e.g.
            Pole: [name] ([material])

        Optional PSEUDO_FIELDS is a dict of pseudo-field values to
        be expanded prior to evaluation (title expression etc)"""

        self.expr = expr
        self.pseudo_fields = pseudo_fields

    def parse(self):
        """
        Parse self's expression

        Returns a list of tuples of the form (<el_type>,<value>) where:
          EL_TYPE  is 'field' or 'literal'
          VALUE    is the field name or literal string"""

        # ENH: Return named tuples

        expression = copy.copy(self.expr)

        # Expand pseudo-fields (in order)
        for name, value in list(self.pseudo_fields.items()):
            ref = "{" + name + "}"
            expression = expression.replace(ref, value or "")

        # Parse expression
        els = []

        while expression:

            # ENH: Use a regex?
            fst_ch = expression.find("[")
            lst_ch = expression.find("]")
            if fst_ch != -1 and lst_ch != -1:

                if fst_ch > 0:
                    els.append(("literal", expression[:fst_ch]))

                els.append(("field", expression[fst_ch + 1 : lst_ch]))
                expression = expression[lst_ch + 1 :]

            else:
                els.append(("literal", expression))
                expression = ""

        return els

    def fields(self):
        """
        Names of the fields in self's expression (sorted)
        """

        fields = set()

        for el_type, value in self.parse():
            if el_type == "field":
                fields.add(value)

        return sorted(fields)
