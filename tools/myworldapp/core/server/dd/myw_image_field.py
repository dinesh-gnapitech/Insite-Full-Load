# Copyright: IQGeo Limited 2010-2023

import base64
from .myw_field import MywField


class MywImageField(MywField):
    """
    Wrapper for accessing an image field
    """

    def displayValue(self):
        """
        Value to show in editor for self (if different from self's raw value)

        Returns size of decoded image, in KB"""

        value = self.raw_value

        if value is None:
            return None

        display_value = round(len(value) * 3 / 4 / 1024)

        if display_value < 1:
            display_value = 1

        return display_value

    def image(self):
        """
        Self's decoded value
        """

        value = self.raw_value

        if value is None:
            return None

        return base64.b64decode(value)

    def set(self, value):
        """
        Set self's value from a decoded image VALUE
        """

        if value != None:
            value = base64.b64encode(value)

        self.feature[self.name] = value
