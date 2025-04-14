################################################################################
# myWorld geometry classes
################################################################################

from geoalchemy2 import shape
from shapely import set_srid, get_srid, Geometry as ShapelyGeometry
from inspect import ismethod

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.geom.myw_coord_transform import MywCoordTransform

transform_cache = {}

# ==============================================================================
#                                  MywGeometry
# ==============================================================================


class MywGeometry:
    """
    Superclass for myWorld in-memory geometries

    myWorld geometries encapsulate shapely in-memory geometry classes to add convenience
    methods and geodetic calculations (.geoLength(), etc). They also include a .srid
    attribute that identifies the coordinate system of the geometry (if known)

    The geodetic methods *assume* that the geometry's coordinates are in WGS84 long/lat."""

    # Encapsulation:

    def __init__(self, *args, **kwargs):
        """Set up the shapely geom that is the "inner object" for this wrapper."""
        first_positional = args[0] if args else None
        if isinstance(first_positional, ShapelyGeometry):
            shapely_geom = first_positional
        else:
            # Build a Shapely Geometry using the abstract factory.
            shapely_geom = self._shapely_factory(*args, **kwargs)
        self._shapely_geom = shapely_geom

    @staticmethod
    def _shapely_factory(*args, **kwargs):
        """Abstract static method, Factory which provides the shapely geom instance from the constructor args.
        Overriding classes should implement this, returning the concrete shapely geom instance they wrap."""
        raise NotImplementedError("Abstract imlpementation is missing.")

    def __getattr__(self, name):
        """Delegate missing attributes to the shapely geom we are encapsulating.
        We wrap methods we find, and inspect any arguments to check if they need to be converted to
        self._shapely_geom too."""
        value = getattr(self._shapely_geom, name)

        # ismethod only returns True for _bound instance methods_ where self is already enclosed.
        if ismethod(value):

            def downcast_wrapper(*args, **kwargs):
                """Wrap the shapely geometry method with a cheeky helper that checks for common
                type errors and corrects them."""
                if args and isinstance(args[0], MywGeometry):
                    args = [args[0]._shapely_geom] + list(args[1:])
                return value(*args, **kwargs)

            return downcast_wrapper
        return value

    @property
    def srid(self):
        return int(get_srid(self._shapely_geom))

    @srid.setter
    def set_srid(self, srid):
        if srid is not None:
            self._shapely_geom = set_srid(self._shapely_geom, srid)

    def __str__(self):
        return str(self._shapely_geom)

    def __repr__(self):
        return repr(self._shapely_geom)

    def __eq__(self, other):
        if isinstance(other, ShapelyGeometry):
            return self._shapely_geom == other
        elif isinstance(other, MywGeometry):
            return self._shapely_geom == other._shapely_geom

        return False

    def __ne__(self, other):
        return not self.__eq__(other)

    @property
    def __class__(self):
        """override isinstance(myw_geom, Shapely) since shapely internals use this to check the
        types of function arguments."""
        return self._shapely_geom.__class__

    @classmethod
    def decode(cls, raw_geom, default_srid=None):
        """
        Build myWorld geometry from RAW_GEOM (a WKT or WKB string, DB field or GeoJSON structure)
        """

        import base64
        from shapely.errors import GEOSException
        from shapely.geometry import shape as shapely_shape
        from shapely import from_wkb, from_wkt

        hex_digits = "0123456789ABCDEF"
        srid = default_srid

        # Case: GeoJSON
        if hasattr(raw_geom, "__geo_interface__"):
            shapely_geom = shapely_shape(raw_geom)
            if str(shapely_geom.geom_type).lower() != str(raw_geom.type).lower():
                raise ValueError("Bad value for GeoJSON geometry: " + repr(raw_geom))

        # Case: WKB or WKT
        else:

            # Strip off the SRID, if present
            if ";" in raw_geom:
                bits = raw_geom.split(";")
                srid = int(bits[0][5:])
                wk_geom = bits[1]
            else:
                wk_geom = raw_geom

            # Case: WKB geometry
            if wk_geom[0] in hex_digits:  # ENH: Make test stricter
                try:
                    shapely_geom = from_wkb(base64.b16decode(raw_geom))
                except TypeError:
                    raise ValueError("Bad value for WKB geometry: " + raw_geom)

            # Case: WKT geometry
            else:
                try:
                    shapely_geom = from_wkt(wk_geom)
                except GEOSException:
                    raise ValueError("Bad value for WKT geometry: " + raw_geom)

        return cls.newFromShapely(shapely_geom, srid)

    @classmethod
    def newFromWKB(cls, db_geom, srid=None):
        """
        Returns myWorld geom built from database field DB_GEOM
        """
        # ENH: Improve name?

        shapely_geom = shape.to_shape(db_geom)

        return cls.newFromShapely(shapely_geom, srid)

    @classmethod
    def newFromShapely(cls, shapely_geom, srid=None):
        """
        Returns myWorld geom built from SHAPELY_GEOM
        """
        # ENH: Modify to_shape() to build these directly

        from .myw_point import MywPoint
        from .myw_line_string import MywLineString
        from .myw_polygon import MywPolygon
        from .myw_multi_point import MywMultiPoint
        from .myw_multi_line_string import MywMultiLineString
        from .myw_multi_polygon import MywMultiPolygon

        myw_class_for = {
            "Point": MywPoint,
            "LineString": MywLineString,
            "Polygon": MywPolygon,
            "MultiPoint": MywMultiPoint,
            "MultiLineString": MywMultiLineString,
            "MultiPolygon": MywMultiPolygon,
        }

        myw_class = myw_class_for.get(shapely_geom.geom_type)

        if myw_class == None:
            raise ValueError("Unsupported geometry type:", str(shapely_geom.geom_type))

        if srid is not None:
            shapely_geom = set_srid(shapely_geom, srid)
        geom = myw_class(shapely_geom)

        return geom

    def geoJson(self):
        """
        GeoJSON representation of self (a dict)
        """

        from shapely.geometry import mapping

        return mapping(self)

    def geoEncode(self, srid, geom_encoding):
        """
        Returns self as a string in encoding GEOM_ENCODING

        COORD_SYS is the name of the coordinate system of SHAPELY_GEOM
        GEOM_ENCODING is one of:
         'wkb'
         'wkt'
         'ewkb'
         'ewkt'"""

        # ENH: get rid of SRID (use self.srid)?

        # Case: Supported directly via Shapely
        if geom_encoding == "wkb":
            return self.wkb_hex  # pylint: disable=no-member
        if geom_encoding == "wkt":
            return self.wkt  # pylint: disable=no-member

        # Case: Requires work
        if geom_encoding == "ewkb":
            return self._geoEncodehexEWKB(srid)
        if geom_encoding == "ewkt":
            return self.ewkt(srid)

        # Case: Other
        raise MywInternalError("Bad geometry encoding: " + geom_encoding)

    def ewkt(self, srid=4326):
        """
        Returns self in Extended WKT encoding
        """

        return "SRID={};{}".format(srid, self.wkt)  # pylint: disable=no-member

    def asWKBElement(self, srid=None):
        """
        Returns self as a geoalchemy WKBElement

        Optional SRID can be used to override self.srid"""

        return shape.from_shape(self._shapely_geom, srid or self.srid or -1)

    def _geoEncodehexEWKB(self, srid):
        """
        Returns self in Extended WKB encoding
        """

        from shapely.wkb import dumps

        return dumps(self._shapely_geom, hex=True, srid=srid)

    def geoLength(self):
        """
        Geodetic length of self

        Backstop implementation returns 0.0 (for convenience)"""
        # ENH: Remove this?

        return 0.0

    def geoTransform(self, from_coord_sys, to_coord_sys):
        """
        Returns copy of self projected into TO_COORD_SYS

        FROM_COORD_SYS and TO_COORD_SYS are MywCoordSystems"""

        from shapely.ops import transform

        # Check for nothing to do
        if from_coord_sys == to_coord_sys:
            return self

        # Transform
        try:
            proj_trans = self.getProjTransform(from_coord_sys, to_coord_sys)
            transformed_shapely = transform(proj_trans, self._shapely_geom)
            geom = self.newFromShapely(transformed_shapely, to_coord_sys.srid)

        except RuntimeError as cond:
            raise MywError("Error transforming geometry:", from_coord_sys, "->", to_coord_sys, cond)

        return geom

    def getProjTransform(self, from_coord_sys, to_coord_sys):
        """
        Returns a (possibily cached) projection transform function

        FROM_COORD_SYS and TO_COORD_SYS are MywCoordSystems"""

        if isinstance(from_coord_sys, MywCoordTransform):
            return from_coord_sys.transform_function

        key = (from_coord_sys.srid, to_coord_sys.srid)
        proj_trans = transform_cache.get(key, None)
        if proj_trans is None:
            import pyproj

            transform_cache[key] = proj_trans = pyproj.Transformer.from_proj(
                from_coord_sys.proj, to_coord_sys.proj, always_xy=True
            ).transform

        return proj_trans
