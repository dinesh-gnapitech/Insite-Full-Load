################################################################################
# MywLineSegment
################################################################################

from shapely.geometry import LineString
from .myw_geo_utils import geodeticDistanceBetween
from .myw_geometry import MywGeometry
from .myw_vector import MywVector


class MywGeomLoc:
    """
    A location on a linear geometry
    """

    def __init__(self, coord, pos=None, seg=None):
        """
        Init slots of self
        """

        self.coord = coord
        self.pos = pos  # Position along segment (0 to 1)
        self.seg = seg  # Segment number

    def __ident__(self):
        """
        String identifying self in progress and error messages
        """

        return f"MywGeomLoc({self.coord},pos={self.pos},seg={self.seg})"


class MywLineSegment(MywGeometry):
    """
    A straight directed linear geometry (line string with only one segment.)
    """

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return LineString(args)

    @property
    def coord1(self):
        return self.coords[0]

    @property
    def coord2(self):
        return self.coords[1]

    def __ident__(self):
        """
        String identifying self in progress and error messages
        """

        return f"MywLineSegment({self.coord1}->{self.coord2})"

    def length(self):
        """
        Euclidean length of self
        """

        vec = MywVector.between(self.coord1, self.coord2)

        return vec.length()

    def geoLocNear(self, coord):  # ENH: Pass in max dist
        """
        The location on self closest to COORD (a MywGeomLoc)
        """
        # Note: Computation is performed in euclean space (not strictly correct, but matches Turf)
        # ENH: Return distance too

        # Get projection onto self
        vec = MywVector.between(self.coord1, self.coord2)
        vec_to_coord = MywVector.between(self.coord1, coord)

        vec_length2 = vec.length2()
        vec_dot = vec.dot(vec_to_coord)

        # Case: Before or at start
        if vec_dot <= 0:
            return MywGeomLoc(self.coord1, pos=0)

        # Case: After or at end
        if vec_dot >= vec_length2:
            return MywGeomLoc(self.coord2, pos=1)

        # Case: Within segment
        pos = vec_dot / vec_length2
        near_coord = self.geoCoordAtPos(pos)

        return MywGeomLoc(near_coord, pos=pos)

    def geoCoordAtDistance(self, dist):
        """
        The point along self at distance DIST (geodetic distance in m)

        Performs computation in geodetic space. DIST must be between
        0 and the self's geodetic length"""

        pos = dist / self.geoLength()

        return self.geoCoordAtPos(pos)

    def geoCoordAtPos(self, pos):
        """
        Coordinate on self at position POS

        POS is position along self (range 0.0 to 1.0)"""

        dx = self.coord2[0] - self.coord1[0]
        dy = self.coord2[1] - self.coord1[1]

        return (self.coord1[0] + pos * dx, self.coord1[1] + pos * dy)

    def geoLength(self):
        """
        'True' length of self on earth's surface (in metres)
        """

        return geodeticDistanceBetween(self.coord1, self.coord2)
