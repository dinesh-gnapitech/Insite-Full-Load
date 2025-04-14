################################################################################
# Stream for writing feature objects to a JSON file
################################################################################
# Copyright: IQGeo Limited 2010-2023

import datetime
from decimal import Decimal
import json, geojson


from .myw_feature_ostream import MywFeatureOStream


class MywGeoJsonEncoder(geojson.GeoJSONEncoder):
    """
    Extended GeoJSON encoder handling PostgreSQL types
    """

    def default(self, obj):
        """
        Returns value to output for OBJ
        """

        # Format timestamps
        if isinstance(obj, datetime.datetime):
            return datetime.datetime.strftime(obj, self.timestamp_format)

        # Format dates
        if isinstance(obj, datetime.date):
            return datetime.datetime.strftime(obj, self.date_format)

        # Handle others
        if hasattr(obj, "isoformat"):
            return obj.isoformat()

        # Handle values from fixed point decimal fields
        # ENH: Upgrade to simplejson 3.3.1 and remove this
        if isinstance(obj, Decimal):
            return float(obj)

        return super(MywGeoJsonEncoder, self).default(obj)


class MywJsonFeatureOStream(MywFeatureOStream):
    """
    Stream for writing features to a JSON file

    Acts as a Pyhton context manager"""

    def __init__(
        self,
        file_name,
        field_descs,
        encoding=None,
        compact=False,
        date_format="%Y-%m-%d",
        timestamp_format="%Y-%m-%dT%H:%M:%S.%f",
        coord_sys=None,
    ):
        """
        Create a stream writing features to GeoJSON file FILE_NAME

        Note: FIELD_DESCS currently ignored"""

        self.file_name = file_name
        self.field_descs = field_descs
        self.encoding = encoding or "utf8"
        self.compact = compact
        self.date_format = date_format
        self.timestamp_format = timestamp_format
        self.coord_sys = coord_sys

        self.strm = None

    def __enter__(self):
        """
        Open stream
        """

        # Open output stream (now, to ensure file gets wiped)
        encoding = "utf-8" if self.encoding is None else self.encoding
        self.strm = open(self.file_name, "w", encoding=encoding)

        # Create list to stash features in
        self.features = []

        return self

    def writeFeature(self, rec):
        """
        Write feature REC to the file

        REC is a database record."""

        if isinstance(rec, dict):
            feature = geojson.Feature(**rec)  # ENH: Transform geometry (if requested)
        else:
            feature = rec.asGeojsonFeature(
                for_file=True,
                include_titles=False,
                coord_sys=self.coord_sys,
                fields=list(self.field_descs.keys()),
            )

        self.features.append(feature)

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Close stream
        """

        indent = None if self.compact else 3

        # ENH: Find a way to pass these to constructor
        MywGeoJsonEncoder.date_format = self.date_format
        MywGeoJsonEncoder.timestamp_format = self.timestamp_format

        try:
            # Unless there was an error ... write the data
            if not exc_type:
                data = geojson.FeatureCollection(self.features)
                json.dump(data, self.strm, indent=indent, cls=MywGeoJsonEncoder, ensure_ascii=False)

        finally:
            if self.strm:
                self.strm.close()
