################################################################################
# MywMultiLineString
################################################################################

from shapely.geometry import MultiLineString
from .myw_geometry import MywGeometry


class MywMultiLineString(MywGeometry):
    """
    A set of (possibly intersecting) line strings

    Extends shapely to add geodetic calculations etc"""

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return MultiLineString(*args)
