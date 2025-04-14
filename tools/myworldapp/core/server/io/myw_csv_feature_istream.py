################################################################################
# Stream yielding feature objects from a CSV file
################################################################################
# Copyright: IQGeo Limited 2010-2023

import sys
import codecs
import traceback
import csv
from shapely.geometry import Point, LineString, Polygon

from myworldapp.core.server.base.core.myw_error import MywDataLoadError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from .myw_feature_istream import MywFeatureIStream

csv.field_size_limit(sys.maxsize)


class MywCsvFeatureIStream(MywFeatureIStream):
    """
    Stream yielding features from a CSV file

    Applies myWorld CSV conventions, including heuristics for
    constructing a primary geometry field if one is not present

    Acts as a Python context manager"""

    # Conventional names used to identify column(s) from which geometry is built
    xy_fields = [("x", "y"), ("longitude", "latitude"), ("long", "lat"), ("long_x", "lat_y")]

    point_fields = ["point", "location", "latlong"]

    linestring_fields = ["linestring", "chain", "route", "path"]

    polygon_fields = ["polygon", "area", "extent"]

    def __init__(
        self,
        file_name,
        key_name,
        primary_geom_name,
        encoding=None,
        geom_heuristics=False,
        progress=MywProgressHandler(),
    ):
        """
        Create stream yielding features from CSV file FILE_NAME

        Input file is assumed to contain a header record

        If optional GEOM_HEURISTICS is True, attempt to build
        geometry PRIMARY_GEOM_NAME from other fields ('x', 'y' etc)"""

        super().__init__(file_name, key_name, primary_geom_name, "CSV", progress)

        self.encoding = encoding or "utf8"
        self.geom_heuristics = geom_heuristics

        self.strm = None
        self.reader = None

    def coordSystem(self):
        return None

    def __enter__(self):
        """
        Open stream
        """
        # ENH: Cleaner to use @contextmanager

        self.strm = codecs.open(self.file_name, "r", encoding=self.encoding)
        self.reader = csv.DictReader(self.strm)

        if self.geom_heuristics:
            (self.geom_type, self.geom_fields) = self.findGeomFields()
            self.progress(2, "Geometry columns:", *self.geom_fields)
        else:
            (self.geom_type, self.geom_fields) = (None, False)

        return self

    def __iter__(self):
        """
        Yields records from the file (as dicts)
        """
        for rec in self.reader:

            # Convert empty strings to None
            # Note: This is safe since myWorld treats "" as null anyway
            for prop, value in list(rec.items()):
                if value == "":
                    rec[prop] = None

            # Build geometry field (if necessary)
            if self.geom_type != None and self.geom_type != "geom":
                rec[self.primary_geom_name] = self.geomFor(rec)

            yield rec

    def __exit__(self, exc_type, exc_value, traceback_arg):
        """
        Close stream

        Returns True if exception is to be re-raised"""

        # Tidy up
        if self.strm:
            self.strm.close()

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
            err_msg = "File {}: line {}: {}".format(self.file_name, self.line_num, exc_value)
            raise MywDataLoadError(err_msg, internal_exception=exc_value)

    def findUnmodelledFields(self, table):
        """TABLE is a MywFeatureTable"""

        # Some fields in this stream are handled seperately
        myw_fields = [
            "myw_title",
            "myw_short_description",
            "myworldlink",
            "myw_geometry_world_name",
            "myw_gwn_annotation",
        ]  # myWorld internal fields
        geom_type, geom_fields = self.findGeomFields()  # Geometry fields in this stream
        ignored_fields = [geom_type] + geom_fields + myw_fields

        unmodelled_fields = list(set(self.fieldnames).difference(table.descriptor.fields))
        return [
            x for x in unmodelled_fields if x not in ignored_fields
        ]  # return fields that are not in our table or fields that are not ignored

    def findGeomFields(self):
        """
        Determine which fields (if any) hold the feature geometry

        Uses conventional names to identify which fields hold the geometry"""

        # Note: Provided for pre 2.5 compatibility.
        # ENH: Apply higher up (so would work for JSON too)

        # Case: Already has geometry column
        if self.primary_geom_name in self.reader.fieldnames:
            return "geom", [self.primary_geom_name]

        # Case: Point ordinates in separate fields
        for (x_field, y_field) in self.xy_fields:
            if x_field in self.reader.fieldnames and y_field in self.reader.fieldnames:
                return "xy", [x_field, y_field]

        # Case: Point in single field
        for field in self.point_fields:
            if field in self.reader.fieldnames:
                return "point", [field]

        # Case: Linestring
        for field in self.linestring_fields:
            if field in self.reader.fieldnames:
                return "linestring", [field]

        # Case: Polygon
        for field in self.polygon_fields:
            if field in self.reader.fieldnames:
                return "polygon", [field]

        return None, []

    def geomFor(self, rec):
        """
        Extracts geometry from input row REC (if there is one)

        Uses heuristics based on column names. For example, if file
        has no 'the_geom' column but does have 'longitude' and
        'latitude', these are assumed to define a point.

        Returns a WKT string"""

        # Remove geometry fields from record
        geom_vals = []
        for field in self.geom_fields:
            geom_vals.append(rec.pop(field))

        # Check for empty field
        if geom_vals[0] == None:
            return None

        # Case: Point ordinates in separate fields
        if self.geom_type == "xy":
            return Point(float(geom_vals[0]), float(geom_vals[1])).wkt

        # Case: Point in single field
        elif self.geom_type == "point":
            coords = self.coordsFrom(geom_vals[0])
            return Point(coords[0]).wkt

        # Case: Linestring
        elif self.geom_type == "linestring":
            coords = self.coordsFrom(geom_vals[0])
            return LineString(coords).wkt

        # Case: Polygon
        elif self.geom_type == "polygon":
            coords = self.coordsFrom(geom_vals[0])
            return Polygon(coords).wkt

        # Case: Other
        return None

    def coordsFrom(self, coords_str):
        """
        Parse a delimited coordinate string

        Returns list of coordinates
        """

        # ENH: Report errors cleanly

        xy_delimiter = ":"
        coord_delimiter = " "

        coords = []

        # For each coord ...
        for coord_str in coords_str.split(coord_delimiter):

            if coord_str == "":
                continue

            # Parse it
            parts = coord_str.split(xy_delimiter)
            coord = [float(parts[0]), float(parts[1])]
            coords.append(coord)

        # ENH: check we found enough points

        return coords

    @property
    def line_num(self):
        """
        Number of most recently read line
        """

        if not self.reader:
            return 0

        return self.reader.line_num

    @property
    def fieldnames(self):
        """
        List of field names
        """

        if not self.reader:
            return []

        return self.reader.fieldnames
