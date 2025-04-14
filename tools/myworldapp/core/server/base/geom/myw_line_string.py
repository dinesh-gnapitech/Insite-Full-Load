################################################################################
# MywLineString
################################################################################

from shapely.geometry import LineString
from myworldapp.core.server.base.core.myw_error import MywError
from .myw_geometry import MywGeometry
from .myw_point import MywPoint

from .myw_line_segment import MywLineSegment, MywGeomLoc
from .myw_vector import MywVector


class MywLineString(MywGeometry):
    """
    A list of connected line segments

    Extends shapely geometry to add geodetic calculations, convenience methods etc"""

    # ENH: Add start_coord, end_coord, ..

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        return LineString(*args)

    @property
    def start_point(self):
        """
        Start location of self (a MywPoint)
        """
        return MywPoint(self.coords[0])

    @property
    def end_point(self):
        """
        End location of self (a MywPoint)
        """
        return MywPoint(self.coords[-1])

    def __ident__(self):
        """
        String identifying self in progress and error messages
        """

        return f"MywLineString({len(self.coords)})"

    def __defn__(self):
        """
        String fully identifying self
        """

        coords_strs = [f"({c[0]},{c[1]})" for c in self.coords]
        return f"MywLineString({','.join(coords_strs)})"

    def geoSplitNearCoord(self, coord):
        """
        Split self at nearest location to COORD

        Returns PARTS (a list of MywLineStrings)"""

        loc = self.geoLocNear(coord)
        return self.geoSplitAtLoc(loc)

    def geoLocNear(self, coord):  # ENH: Pass in giveup offset
        """
        The position on self closest to COORD

        Returns a MywGeomLoc"""

        # ENH: Return distance too

        best_dist = 1.0e20  # Safe because geo distances are limited to earth circumference
        best_loc = None

        for i_seg, seg in enumerate(self.geoSegments()):
            seg_loc = seg.geoLocNear(coord)
            seg_dist = MywVector.between(
                seg_loc.coord, coord
            ).length()  # ENH: Should use geodeticDistanceBetween() here ... but not reliable

            if seg_dist < best_dist:
                best_dist = seg_dist
                best_loc = seg_loc
                best_loc.seg = i_seg

        return best_loc

    def geoSplitAtLoc(self, loc):
        """
        Split self at geometry location LOC (a geomLoc)

        Returns PARTS (a list of MywLineStrings) (empty if no split)"""

        last_seg = len(self.coords) - 2

        # Case: At start or end point
        if (loc.seg == 0 and loc.pos == 0) or (loc.seg == last_seg and loc.pos == 1):
            return []

        # Case: At existing vertex
        if loc.pos == 0:
            return MywLineString(self.coords[: loc.seg + 1]), MywLineString(self.coords[loc.seg :])

        if loc.pos == 1:
            return MywLineString(self.coords[: loc.seg + 2]), MywLineString(
                self.coords[loc.seg + 1 :]
            )

        # Case: Within segment
        split_coord = self.geoSegment(loc.seg).geoCoordAtPos(loc.pos)

        return MywLineString(self.coords[: loc.seg + 1] + [split_coord]), MywLineString(
            [split_coord] + self.coords[loc.seg + 1 :]
        )

    def geoCoordAtPos(self, pos):
        """
        Coordinate on self at position POS

        POS is position along self (range 0.0 to 1.0)"""

        if pos == 0:
            return self.coords[0]  # return first point if pos == 0
        if pos == 1:
            return self.coords[-1]  # return last point if pos == 1
        return self.geoCoordAtDistance(pos * self.geoLength())

    def geoCoordAtDistance(self, dist):
        """
        The point along self at distance DIST (geodetic distance in m)

        Performs computation in geodetic space. DIST must be between
        0 and the self's geodetic length"""

        return self.geoLocAtDistance(dist).coord

    def geoLocAtDistance(self, dist):
        """
        The location along self at distance DIST (geodetic distance in m)

        Performs computation in geodetic space. DIST must be between
        0 and the self's geodetic length"""

        # ENH: Return a self location object?

        full_dist = dist

        if dist < 0:
            raise MywError("Not within linestring:", full_dist)

        for i_seg, seg in enumerate(self.geoSegments()):
            seg_len = seg.geoLength()

            if dist <= seg_len:
                pos = dist / seg_len
                coord = seg.geoCoordAtPos(pos)
                return MywGeomLoc(coord=coord, pos=pos, seg=i_seg)

            dist -= seg_len

        raise MywError("Not within linestring:", full_dist)

    def geoLength(self):
        """
        'True' length of self on earth's surface (in metres)
        """

        length = 0
        for seg in self.geoSegments():
            length += seg.geoLength()

        return length

    def geoSegments(self):
        """
        Segments of self (a list of MywLineSegments)
        """

        segs = []

        for i_vertex in range(0, len(self.coords) - 1):
            seg = MywLineSegment(self.coords[i_vertex], self.coords[i_vertex + 1])
            segs.append(seg)

        return segs

    def geoSegment(self, n):
        """
        The n'th segment of self (which must exist)
        """

        return MywLineSegment(self.coords[n], self.coords[n + 1])
