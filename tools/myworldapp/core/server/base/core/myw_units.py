################################################################################
# myWorld support for unit conversion
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError


class MywUnitScale:
    """
    A unit conversion scale
    """

    # ENH: Support long names, groups, ...
    # ENH: Convert to a DB model?

    def __init__(self, scale_type, scale_def):
        """
        Returns a new unit convertor object

        SCALE_DEF is a dict"""

        self.type = scale_type
        self.base_unit = scale_def["base_unit"]
        self.unit_sizes = scale_def["units"]

    def conversionFactor(self, from_unit, to_unit):
        """
        Conversion factor from FROM_UNIT to TO_UNIT (multiplier)

        Raises MywError if either unit not known"""

        return self._sizeOf(from_unit) / float(self._sizeOf(to_unit))

    def _sizeOf(self, unit):
        """
        Size of UNIT in self.base_unit

        Raises MywError if not known"""

        size = self.unit_sizes.get(unit)

        if not size:
            raise MywError("Unknown", self.type, "unit:", unit)

        return size
