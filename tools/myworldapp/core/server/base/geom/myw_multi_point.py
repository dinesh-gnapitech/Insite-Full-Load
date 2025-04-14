################################################################################
# MywMultiPoint
################################################################################

from shapely.geometry import MultiPoint
from .myw_geometry import MywGeometry


class MywMultiPoint(MywGeometry):
    """
    A set of (possibly overlapping) points

    Extends shapely to add geodetic calculations etc"""

    # ENH: Override element accessor to return myWorld objects
    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return MultiPoint(*args)
