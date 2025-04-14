# Copyright: IQGeo Limited 2010-2023

from datetime import datetime
from sqlalchemy.sql import null

from .myw_field import MywField


class MywDateField(MywField):
    """
    Wrapper for accessing an date field
    """

    def default_format(self):
        return "%Y-%m-%d"

    def asDbValue(self, value, date_format=None):
        """
        Cast property VALUE to GeoAlchemy field format
        """

        # Deal with defaults
        if date_format is None:
            date_format = self.default_format()

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()

        return datetime.strptime(value, date_format).date()

    def asJsonValue(self, date_format=None):
        """
        JSON representation of Value for self
        """

        # Deal with defaults
        if date_format is None:
            date_format = self.default_format()

        if self.raw_value is None:
            return None

        return self.raw_value.strftime(date_format)
