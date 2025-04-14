################################################################################
# Stream writing feature objects to file via OGR
################################################################################
# Copyright: IQGeo Limited 2010-2023

import sys, datetime
from decimal import Decimal
from collections import OrderedDict
from osgeo import ogr, osr

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from .myw_feature_ostream import MywFeatureOStream


class MywOgrFeatureOStream(MywFeatureOStream):
    """
    Stream for writing features to file via a OGR

    Supports shapefiles, Esri GDB, .. (see .drivers).
    Determines file type from extension

    Acts as a Pyhton context manager"""

    # Mapping from file extensions to driver names
    # ENH: Get these from GDAL
    drivers = {
        "shp": "ESRI Shapefile",  # Esri (field name len limited, no multi-geoms)
        "tab": "MapInfo File",  # Mapinfo
        #'dgn' : 'DGN',              # Intergraph (doesn't support arbitrary fields)
        #'dxf' : 'DXF',              # Autocad (doesn't support arbitrary fields)
        "gpkg": "GPKG",  # Geopackage http://www.geopackage.org/
        "gtm": "GPSTrackMaker",  # Track Maker http://www.trackmaker.com
        "gpx": "GPX",  # GPS exchange format http://www.topografix.com/gpx.asp
        "bna": "BNA",  # Strategic Mapping (Atlas) Boundary ASCII
        "kml": "KML",
    }  # Google KML

    def __init__(self, file_name, field_descs, file_format=format, coord_sys=None):
        """
        Create stream writing to FILE_NAME

        FIELD_DESCS are the names of the fields to write."""

        self.file_name = file_name
        self.format = file_format
        self.coord_sys = coord_sys

        self.date_format = "%Y-%m-%d"  # ENH: Pass these in
        self.timestamp_format = "%Y-%m-%dT%H:%M:%S.%f"

        self.driver_name = self.drivers.get(self.format)

        if not self.driver_name:
            raise MywError("Unknown file format:", self.format)

        self.srid = coord_sys.srid if coord_sys else 4326

        self.field_descs = field_descs
        self.ogr_geom_code = self._ogrGeomCodeFrom(field_descs)
        self.ogr_schema = self._ogrSchemaFrom(field_descs)

    def __enter__(self):
        """
        Open stream
        """

        driver = ogr.GetDriverByName(self.driver_name)

        self.ds = driver.CreateDataSource(self.file_name)  # TODO: Catch errors
        ftr_name = "test"  # TODO

        # Create the layer
        srs = osr.SpatialReference()
        srs.ImportFromEPSG(self.srid)
        self.layer = self.ds.CreateLayer(ftr_name, srs, self.ogr_geom_code)

        # Define attribute fields
        for fld_name, fld_defn in list(self.ogr_schema.items()):
            self.layer.CreateField(fld_defn)

        return self

    def writeFeature(self, rec):
        """
        Write feature REC to the file

        REC is a database record or dict."""

        ftr = ogr.Feature(self.layer.GetLayerDefn())

        # Set attributes
        for fld_name, fld_desc in list(self.field_descs.items()):

            if fld_desc.isGeometry():
                geom_wkt = rec._field(fld_name).encode("wkt", self.coord_sys)
                geom_ogr = ogr.CreateGeometryFromWkt(geom_wkt)
                ftr.SetGeometry(geom_ogr)
            else:

                fld_defn = self.ogr_schema[fld_name]
                ogr_fld_name = fld_defn.GetName()

                val = rec[fld_name]
                if (
                    self.driver_name == "ESRI Shapefile"
                    and fld_defn.GetType() == ogr.OFTString
                    and val
                    and len(val) > 254
                ):
                    val = val[0:254]  # ENH: Raise warning

                # TODO: Convert dates etc to strings
                if isinstance(val, (datetime.date, datetime.datetime, Decimal)):
                    val = str(val)

                ftr.SetField(ogr_fld_name, val)

        # Create feature
        self.layer.CreateFeature(ftr)
        ftr = None

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Close the output stream
        """

        self.layer = None

    def _ogrGeomCodeFrom(self, field_descs):
        """
        Get layer geometry type from myWorld field descriptors FIELD_DESCS
        """
        # ENH: Detect multiple goem fields

        for (field_name, field_desc) in list(field_descs.items()):

            if field_desc.isGeometry():
                return self._ogrGeomCodeFor(field_name, field_desc)

        return None

    def _ogrGeomCodeFor(self, field_name, field_desc):
        """
        The OGR geometry code for myWorld geometry field FIELD_DESC
        """

        ogr_types = {
            "point": ogr.wkbPoint,
            "linestring": ogr.wkbLineString,
            "polygon": ogr.wkbPolygon,
        }

        myw_type = field_desc.type_desc

        ogr_type = ogr_types.get(myw_type.base)

        if not ogr_type:
            raise MywInternalError("Unknown myWorld data type:", myw_type.base)

        return ogr_type

    def _ogrSchemaFrom(self, field_descs):
        """
        Build OGR schema definition from myWorld field descriptors FIELD_DESCS

        Returns a list of OGR field definitions, keyed by myWorld field name"""

        fld_defns = OrderedDict()
        geom_type = None

        for (field_name, field_desc) in list(field_descs.items()):

            if not field_desc.isGeometry():
                fld_defns[field_name] = self._ogrFieldDefnFor(field_name, field_desc)

        return fld_defns

    def _ogrFieldDefnFor(self, field_name, field_desc):
        """
        The OGR field definition corresponsing to FIELD_DESC
        """

        # Mapping from myw_type -> ogr_type (see http://www.gdal.org/ogr__core_8h.html)
        ogr_types = {
            "string": ogr.OFTString,
            "boolean": ogr.OFTInteger,
            "integer": ogr.OFTInteger,
            "double": ogr.OFTReal,
            "numeric": ogr.OFTReal,
            "date": ogr.OFTDate,
            "timestamp": ogr.OFTDateTime,
            "foreign_key": ogr.OFTString,
            "reference": ogr.OFTString,
            "reference_set": ogr.OFTString,
            "link": ogr.OFTString,
            "image": ogr.OFTString,
        }  # ENH: Use binary for drivers that support it

        myw_type = field_desc.type_desc

        # Construct output field name
        field_name = str(field_name)  # OGR fails on unicode # ENH: Handle conversion errors
        if self.driver_name == "ESRI Shapefile" and len(field_name) > 10:
            sys.stderr.write(
                "Warning: Truncating field name: " + field_name + "->" + field_name[0:9] + "\n"
            )
            field_name = field_name[0:9]  # ENH: Warn if truncating

        # Get OGR type
        ogr_type = ogr_types.get(myw_type.base)
        if ogr_type == None:
            raise MywInternalError("Unknown myWorld data type:", myw_type.base)

        # Build field definition
        field_defn = ogr.FieldDefn(field_name, ogr_type)

        if myw_type.base == "boolean":
            field_defn.SetSubType(ogr.OFSTBoolean)

        if ogr_type == ogr.OFTString:
            length = myw_type.length or 2000
            field_defn.SetWidth(length)

        # TODO: Handle string with unspecified length (which OGR truncates to 80 chars)

        return field_defn
