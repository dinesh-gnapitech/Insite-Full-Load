################################################################################
# MywPoint
################################################################################

from shapely.geometry import Point
from .myw_geo_utils import geodeticDistanceBetween
from .myw_geometry import MywGeometry


class MywPoint(MywGeometry):
    """
    A point geometry

    Extends shapely to add geodetic calculations etc"""

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return Point(*args)

    @property
    def coord(self):
        """
        Location of self
        """
        return self.coords[0]

    def geoDistanceTo(self, coord):
        """
        Great circle distance from self to COORD, in m
        """

        # ENH: pass in geom instead

        return geodeticDistanceBetween(self.coords[0], coord)
