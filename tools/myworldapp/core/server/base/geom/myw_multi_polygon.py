################################################################################
# MywMultiPolygon
################################################################################

from shapely.geometry import MultiPolygon
from .myw_geometry import MywGeometry


class MywMultiPolygon(MywGeometry):
    """
    A set of (possibly overlapping) polygons

    Extends shapely to add geodetic calculations etc"""

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return MultiPolygon(*args)
