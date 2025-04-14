################################################################################
# Stream yielding feature objects read via OGR
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os, traceback
from collections import OrderedDict
from osgeo import ogr
from shapely.geometry import Point, LineString, Polygon
import shapely.geometry as shapely_geometry
import shapely.wkt as shape_wkt

from myworldapp.core.server.base.core.myw_error import MywError, MywDataLoadError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from .myw_feature_istream import MywFeatureIStream


class MywOgrFeatureIStream(MywFeatureIStream):
    """
    Stream yielding features from a vector file

    Supports shapefiles, Esri GDB, .. (see http://www.gdal.org/ogr_formats.html).
    Determines file type from extension

    Acts as a Python context manager"""

    def __init__(
        self,
        file_name,
        key_name,
        primary_geom_name,
        encoding=None,
        feature_type=None,
        progress=MywProgressHandler(),
    ):
        """
        Create stream yielding features from FILE_NAME
        """

        super().__init__(file_name, key_name, primary_geom_name, None, progress)

        self.feature_type = feature_type
        self.encoding = encoding

        self.ds = None
        self.line_num = 0

    def __enter__(self):
        """
        Open stream
        """
        # ENH: Cleaner to use @contextmanager

        previous_encoding = self.switch_env_var(
            "SHAPE_ENCODING", self.encoding
        )  # switch encoding, catching any previous value
        self.ds = ogr.Open(self.file_name)
        self.switch_env_var(
            "SHAPE_ENCODING", previous_encoding
        )  # switch encoding back to previous value

        if not self.ds:
            raise MywError("Open failed:", self.file_name)  # ENH: Use GDAL conditions?

        self.format = self.ds.GetDriver().GetName()

        return self

    def __iter__(self):
        """
        Yields records from the file (as dicts)
        """

        # Get layer to read
        if self.feature_type:
            layer = self._ogrLayerFor(self.feature_type)
        else:
            layer = self.ds.GetLayer(0)

        ogr_schema = self._ogrSchemaFor(layer)

        # Yield its features
        for ftr in layer:
            self.line_num += 1

            rec = {}

            for fld_name, fld_defn in list(ogr_schema.items()):
                ogr_fld_name = fld_defn.GetName()
                rec[fld_name] = ftr.GetField(ogr_fld_name)

            geom_ref = ftr.GetGeometryRef()
            if geom_ref:
                wkt = geom_ref.ExportToWkt()  # ENH: Better as WKB?
                geom = shape_wkt.loads(wkt)  # ENH: Avoid switching between WKT and Shapely geometry

                # Simplify MultiPoint, MultiLineString, or MultiPolygon
                geom = self.simplify_multigeometry(geom)

                # Strip z-coordinates if present
                if geom.has_z:
                    geom = self.to_2D(geom)

                rec_geom = geom.wkt
            else:
                rec_geom = None

            rec[self.primary_geom_name] = rec_geom

            yield rec

    def __exit__(self, exc_type, exc_value, traceback_arg):
        """
        Close stream

        Returns True if exception is to be re-raised"""

        # Tidy up
        # Note: 'if self.ds' not safe here
        if self.ds != None:
            self.ds = None  # No explicit close in OGR?

        # If exiting due to error ..
        if exc_type and not exc_type in [KeyboardInterrupt, SystemExit, MemoryError, GeneratorExit]:

            # Show the error
            # ENH: Better to embed traceback in MywDataLoadError
            # ENH: Use traceback_arg
            if exc_type != ValueError:
                print()
                traceback.print_exc()
                print()

            # Include line number in error messages
            # ENH: Do this inside MywDataLoadError
            err_msg = "File {}: record {}: {}".format(self.file_name, self.line_num, exc_value)
            raise MywDataLoadError(err_msg, internal_exception=exc_value)

    def coordSystem(self):
        """
        The coordinate system in which self's data is returned (if known)

        Returns a MywCoordSystem (or None)"""

        srs = self.ds.GetLayer(0).GetSpatialRef()
        if srs:
            return MywCoordSystem(srs.ExportToProj4())

    def featureTypeInfos(self):
        """
        Summary info for feature types in self (a list of dicts, keyed by layer name)
        """

        infos = OrderedDict()

        for layer in self.ds:
            layer_name = layer.GetName()
            ftr_name = layer_name.split(".")[0]

            infos[ftr_name] = {
                "name": ftr_name,
                "layer_name": layer_name,
                "geom_type": self._mywGeomTypeFor(layer),
            }

        return infos

    def featureDef(self, ftr_name):
        """
        myWorld feature definition for self's objects
        """

        layer = self._ogrLayerFor(ftr_name)
        ogr_schema = self._ogrSchemaFor(layer)

        # Build field defs
        fld_defs = []

        for fld_name, fld_defn in list(ogr_schema.items()):
            fld_def = {"name": fld_name, "type": self._mywFieldTypeFor(fld_name, fld_defn)}

            fld_defs.append(fld_def)

        # Add geometry field
        # ENH: Try using layer.GetGeometryColumn()
        fld_defs.append(
            {
                "name": "geometry",  # TODO: use primary_geom_name ... or location/route/extent
                "type": self._mywGeomTypeFor(layer),
            }
        )

        return {"name": ftr_name, "fields": fld_defs}

    def _ogrLayerFor(self, ftr_name):
        """
        Get OGR schema definition for LAYER

        Returns a list of OGR field definitions, keyed by myWorld field name"""

        # Get name of corresponding layer
        ftr_type_info = self._ogrLayerInfoFor(ftr_name)

        layer_name = ftr_type_info["layer_name"]

        # Get its definition
        return self.ds.GetLayerByName(layer_name)

    def _ogrLayerInfoFor(self, ftr_name):
        """
        Get OGR layer name for FTR_NAME
        """

        for ogr_name, info in list(self.featureTypeInfos().items()):
            if (ogr_name == ftr_name) or (
                ogr_name.lower() == ftr_name
            ):  # ENH: Sort out name strategy and remove this
                return info

        raise MywError("No such layer:", ftr_name)

    def _ogrSchemaFor(self, layer):
        """
        Get OGR schema definition for LAYER

        Returns a list of OGR field definitions, keyed by myWorld field name"""

        fld_defns = OrderedDict()

        for fld_defn in layer.schema:

            myw_fld_name = fld_defn.GetName().lower()
            fld_defns[myw_fld_name] = fld_defn

        return fld_defns

    def _mywFieldTypeFor(self, fld_name, fld_defn):
        """
        The myWorld field type corresponsing to OGR field definition FLD_DEFN
        """

        ogr_type_code = fld_defn.GetType()
        ogr_base = fld_defn.GetFieldTypeName(ogr_type_code)
        ogr_width = fld_defn.GetWidth()

        # ENH: Handle time etc
        # ENH: Check for unused bits

        if ogr_base == "String":
            myw_type = "string"
            if ogr_width:
                myw_type += "({})".format(ogr_width)
            return myw_type

        if ogr_base == "Integer":
            return "integer"

        if ogr_base == "Integer64":
            return "integer"  # ENH: Support 64 bit ints in myWorld?

        if ogr_base == "Real":
            return "double"

        if ogr_base == "Date":
            return "date"

        if ogr_base == "DateTime":
            return "timestamp"

        if ogr_base == "Binary":
            return "binary"  # TODO:

        raise MywError("Field", fld_name, ":", "Unknown OGR type:", ogr_base)

    def _mywGeomTypeFor(self, layer):
        """
        The myWorld geometry type corresponsing to OGR_CODE
        """

        ogr_code = layer.GetGeomType()

        # ogr_codes match geometry, Multi, 3D , 3D Mulit
        if ogr_code in [1, 4, -2147483647, -2147483644]:
            return "point"
        if ogr_code in [2, 5, -2147483646, -2147483643]:
            return "linestring"
        if ogr_code in [3, 6, -2147483645, -2147483642]:
            return "polygon"

        raise MywError("Unknown OGR geometry type:", ogr_code)

    def simplify_multigeometry(self, geom):
        """
        If a multigeometry has only one geometry, return the single geometry
        ie: MultiPoint with single element can be replaced with Point

        Returns a shapely geometry"""

        if isinstance(
            geom,
            (
                shapely_geometry.MultiLineString,
                shapely_geometry.MultiPoint,
                shapely_geometry.MultiPolygon,
            ),
        ):
            if len(geom.geoms) == 1:
                geom = geom.geoms[0]
        return geom

    def to_2D(self, geom):
        """
        Return 2D version of Geometry

        Returns a shapely geometry"""

        if geom.is_empty:
            return geom

        if not geom.has_z:
            return geom

        if isinstance(geom, LineString):
            return LineString([xy[0:2] for xy in list(geom.coords)])
        elif isinstance(geom, Point):
            return Point([xy[0:2] for xy in list(geom.coords)])
        elif isinstance(geom, Polygon):
            exterior = self.to_2D(geom.exterior)
            interiors = []
            for poly in geom.interiors:
                interiors.append(self.to_2D(poly))
            return Polygon(exterior, interiors)

        return geom

    def switch_env_var(self, key, value):
        """
        Change an environment variable, and return previous value
        """
        if key is None:
            return

        previous = os.getenv(key)
        if value is None:
            if previous is None:
                return previous
            del os.environ[key]
        else:
            os.environ[key] = value

        return previous
