# Copyright: IQGeo Limited 2010-2023

import re
from datetime import datetime
from sqlalchemy.sql import null

from myworldapp.core.server.base.db.globals import Session
from .myw_field import MywField


class MywTimestampField(MywField):
    """
    Wrapper for accessing an timestamp field
    """

    def default_format(self):
        return "%Y-%m-%dT%H:%M:%S.%f"

    def asDbValue(self, value, timestamp_format=None):
        """
        Helper returning string VALUE as an object that is appropriate for the database dialect
        This is usually a datetime object, but can be overridden by the db driver
        """

        if timestamp_format is None:
            timestamp_format = self.default_format()

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()
        m = re.match(r"^(?P<date_format>.*T)%H:%M:%S.%f", timestamp_format)
        dt = None
        if m:
            # Avoid Oracle errors when microseconds are missing
            parts = value.split(".")
            dt = datetime.strptime(parts[0], m.group("date_format") + "%H:%M:%S")
            if len(parts) > 1:
                dt = dt.replace(microsecond=int(parts[1][:6].ljust(6, "0")))
        else:
            dt = datetime.strptime(value, timestamp_format)

        return Session.myw_db_driver.sqlForTimestamp(dt)  # pylint: disable=no-member

    def asJsonValue(self, timestamp_format=None):
        """
        JSON representation of Value for self
        """

        # Deal with defaults
        if timestamp_format is None:
            timestamp_format = self.default_format()

        if self.raw_value is None:
            return None

        return self.raw_value.strftime(timestamp_format)
