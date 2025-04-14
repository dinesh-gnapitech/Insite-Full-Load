################################################################################
# MywVector
################################################################################

from math import sqrt


class MywVector:
    """
    A vector in 2d space
    """

    @classmethod
    def between(self, coord1, coord2):
        """
        Returns vector coord1 -> coord2
        """

        # ENH: Replace by MywCoord

        return MywVector(coord2[0] - coord1[0], coord2[1] - coord1[1])

    def __init__(self, dx, dy):
        """
        Init slots of self
        """

        self.dx = dx
        self.dy = dy

    def __ident__(self):
        """
        String identifying self in progress and error messages
        """

        return f"MywVector({self.dx},{self.dy})"

    # Operator overloads
    def __add__(self, other):
        return MywVector(self.dx + other.dx, self.dy + other.dy)

    def __sub__(self, other):
        return MywVector(self.dx - other.dx, self.dy - other.dy)

    def __mul__(self, fac):
        return MywVector(self.dx * fac, self.dy * fac)

    def length(self):
        """
        Euclidean length of self
        """

        return sqrt(self.length2())

    def length2(self):
        """
        The square of self's length
        """

        return self.dx * self.dx + self.dy * self.dy

    def dot(self, other):
        """
        Dot product of self and OTHER
        """

        return self.dx * other.dx + self.dy * other.dy

    def cross(self, other):
        """
        Cross product of self and OTHER
        """

        return self.dx * other.dy - self.dy * other.dx
