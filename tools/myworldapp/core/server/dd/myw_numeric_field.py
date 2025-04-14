# Copyright: IQGeo Limited 2010-2023

from sqlalchemy import types as sqa_types
from sqlalchemy.sql import null

from .myw_field import MywField


class MywNumericField(MywField):
    """
    Wrapper for accessing an numeric field
    """

    def asDbValue(self, value):
        """
        Cast property VALUE to GeoAlchemy field format
        """

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()

        if isinstance(self.column_def.type, (sqa_types.Integer, sqa_types.Float)):
            value = self.column_def.type.python_type(value)
        elif isinstance(self.column_def.type, sqa_types.Numeric):
            try:
                # Note: Value not changed as Decimal causes SQLAlchemy 'cannot map type' error on some m/cs
                self.column_def.type.python_type(value)
            except Exception as cond:
                raise ValueError(str(cond))

        return value
