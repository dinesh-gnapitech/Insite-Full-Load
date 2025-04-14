# Copyright: IQGeo Limited 2010-2023

import json
from sqlalchemy.sql import null

from myworldapp.core.server.base.core.utils import sort_by_key

from .myw_field import MywField


class MywFileField(MywField):
    """
    Wrapper for accessing an file field
    """

    def asDbValue(self, value):
        """
        Cast property VALUE to GeoAlchemy field format
        """

        if value is None or value == "":
            return null()

        # Convert 'file' JSON object to strings (ensuring repeatable tag order)
        if isinstance(value, dict):
            return json.dumps(sort_by_key(value))

        return value

    def asJsonValue(self):
        """
        Json formatted value of field
        """

        value = self.raw_value
        if value:
            value = json.loads(value)

        return value

    def displayValue(self):
        """
        Value to show in editor for self (if different from self's raw value)

        Returns string of form:
          "<name> (<size in KB>)" """

        # ENH: better to just return the info and let client format it?

        value = self.raw_value

        if not value:
            return None

        value = json.loads(value)

        return "{} ({}KB)".format(value.get("name"), value.get("size"))
