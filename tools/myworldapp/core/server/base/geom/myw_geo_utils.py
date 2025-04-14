################################################################################
# myWorld utils for geographic geometry
################################################################################
# Copyright: IQGeo Limited 2010-2023
# ENH: Find an open source library that does this

from math import atan2, cos, pi, radians, sin, sqrt


# ==============================================================================
#                               GEODETIC COMPUTATIONS
# ==============================================================================

# Earth radius (WGS84, at equator)
earth_radius = 6371008.8  # to match turf


# Nominal conversion factor from degrees to meters (correct at equator)
# ENH: Add class MywEarthModel?
degrees_to_metres = (2 * pi * earth_radius) / 360


def geodeticDistanceBetween(coord1, coord2):
    """
    Great circle distance between two points, in metres

    COORD1 and COORD2 are (lon,lat) in decimal degrees
    """
    # Uses haversine formula, which assumes earth is a sphere

    # ENH: Unstable at edge cases?

    (lon1, lat1) = coord1
    (lon2, lat2) = coord2

    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = list(map(radians, [lon1, lat1, lon2, lat2]))

    # Apply haversine formula
    lon_diff = lon2 - lon1
    lat_diff = lat2 - lat1
    a = sin(lat_diff / 2) ** 2 + cos(lat1) * cos(lat2) * sin(lon_diff / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))  # to match turfjs

    return c * earth_radius


def scaleDistortionAt(lat):
    """
    Conversion factor from projected space (Google projection) to real world space at LAT (in degrees)
    """

    lat = lat * (2.0 * pi / 360.0)  # Get latitude in radians

    p1 = degrees_to_metres
    p2 = -93.5 / p1
    p3 = 0.118 / p1

    factor = cos(lat) + (p2 * cos(3 * lat)) + (p3 * cos(5 * lat))

    return factor
