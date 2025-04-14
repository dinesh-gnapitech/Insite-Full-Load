# Copyright: IQGeo Limited 2010-2023

from geoalchemy2 import shape
from sqlalchemy.sql import null

from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.base.geom.myw_geometry import MywGeometry

from .myw_field import MywField


class MywGeometryField(MywField):
    """
    Wrapper for accessing a feature's geometry field
    """

    # Name of oordinate system is which self's geometries are stored
    # Note: Internals geoms really in their own CS ... but coords are related to WGS84
    coord_sys = MywCoordSystem("epsg:4326")

    def asDbValue(self, value, coord_sys=None):
        """
        Cast property VALUE to GeoAlchemy field format

        VALUE can be None
        """
        # ENH: For Postgres, skip conversion to shapely

        # Make 'None' mean 'null' in database (rather than 'use default')
        if value is None or value == "":
            return null()

        # Check for null
        if not value or value.__class__.__name__ == "Default":
            # For Oracle
            return Session.myw_db_driver.null_geometry  # pylint: disable=no-member

        # Convert to in-memory geometry
        geom = MywGeometry.decode(value)

        # If no explicit coordinate system supplied, use the one from geometry (if present)
        if geom.srid and not coord_sys:
            coord_sys = MywCoordSystem(geom.srid)

        # Transform to internal coordinate system (if necessary)
        if coord_sys:
            geom = geom.geoTransform(coord_sys, self.coord_sys)

        # Coerce polygon boundaries to correct sense (Oracle)
        geom = Session.myw_db_driver.canonicalise_geometry(geom)  # pylint: disable=no-member

        # Convert to GeoAlchemy format
        db_geom = geom.asWKBElement(srid=self.coord_sys.srid)

        return db_geom

    def asWKB(self):
        """
        Self's geometry as well-known binary (None if field is unset)
        """
        # ENH: Find a quicker way?

        geom = self.geom()

        if geom:
            return geom.wkb

    def asWKT(self):
        """
        Self's geometry as well-known text (None if field is unset)
        """

        geom = self.geom()

        if geom:
            return geom.wkt

    def geom(self, coord_sys=None):
        """
        Self's geometry as an in-memory object

        Returns a Shapely geometry or None"""

        # Get raw geometry
        db_geom = self.raw_value
        if not hasattr(db_geom, "geom_from"):
            return None

        # Build in-memory geometry
        geom = MywGeometry.newFromWKB(db_geom, srid=self.coord_sys.srid)

        # Transform to required coordinate system (if necessary)
        if coord_sys:
            geom = geom.geoTransform(self.coord_sys, coord_sys)

        return geom

    def set(self, geom):
        """
        Set self's geometry from shapely geometry GEOM
        """

        db_geom = None

        if isinstance(geom, MywGeometry):
            db_geom = geom.asWKBElement(srid=self.coord_sys.srid)
        else:
            db_geom = shape.from_shape(geom, srid=self.coord_sys.srid)

        self.feature[self.name] = db_geom

    def encode(self, geom_encoding, coord_sys=None):
        """
        Self's geometry in selected encoding

        GEOM_ENCODING can be 'wkb', 'wkt', 'ewkb' or 'ewkt'"""

        # Deal with defaults
        coord_sys = coord_sys or self.coord_sys

        # Get in-memory geometry
        geom = self.geom(coord_sys)

        return geom.geoEncode(coord_sys.srid, geom_encoding)

    def geoLength(self):
        """
        Geodetic length of self (in metres)
        """
        # ENH: Support MultLineString

        geom = self.geom()

        if not geom or geom.geom_type != "LineString":
            return 0.0

        return geom.geoLength()
