# Copyright: IQGeo Limited 2010-2023

from sqlalchemy.sql import null

from .myw_field import MywField


class MywBooleanField(MywField):
    """
    Wrapper for accessing an boolean field
    """

    def asDbValue(self, value):
        """
        Cast property VALUE to GeoAlchemy field format
        """

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()

        bool_mappings = {"true": True, "t": True, "false": False, "f": False}
        if isinstance(value, str):
            return bool_mappings.get(value.lower(), value)

        return value
