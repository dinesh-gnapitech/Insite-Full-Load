################################################################################
# MywPolygon
################################################################################

from shapely.geometry import Polygon, box
from .myw_geometry import MywGeometry


class MywPolygon(MywGeometry):
    """
    A connected region of 2D space (possibly containing holes)

    Extends shapely to add geodetic calculations etc"""

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return Polygon(*args)

    @classmethod
    def newBox(self, minx, miny, maxx, maxy, srid=None):
        """
        Creates rectangular polygon from the provided bounding box values

        CCW indicates counter-clockwise order (see shapely box)"""

        shapely_poly = box(minx, miny, maxx, maxy)

        return self.newFromShapely(shapely_poly, srid=srid)
