################################################################################
# Stream writing feature objects to a CSV file
################################################################################
# Copyright: IQGeo Limited 2010-2023

import datetime
import csv


from .myw_feature_ostream import MywFeatureOStream


class MywCsvFeatureOStream(MywFeatureOStream):
    """
    Stream for writing features to a CSV file

    Creates file with header line and comma delimiters.

    Acts as a Pyhton context manager"""

    def __init__(
        self,
        file_name,
        field_descs,
        encoding=None,
        geom_encoding="ewkb",
        date_format="%Y-%m-%d",
        timestamp_format="%Y-%m-%dT%H:%M:%S.%f",
        coord_sys=None,
    ):
        """
        Create stream writing to FILE_NAME

        FIELD_DESCS is a dictionary of columns to write.
        GEOM_ENCODING defines the format in which geometry is
        output ('wkb', 'wkt' or 'ewkt')"""

        self.file_name = file_name
        self.field_descs = field_descs
        self.encoding = encoding or "utf8"
        self.geom_encoding = geom_encoding
        self.date_format = date_format
        self.timestamp_format = timestamp_format
        self.coord_sys = coord_sys

    def __enter__(self):
        """
        Open stream
        """

        self.strm = open(self.file_name, "w", encoding=self.encoding, newline="")
        self.writer = csv.DictWriter(self.strm, fieldnames=self.field_descs)
        self.writer.writeheader()

        return self

    def writeFeature(self, rec):
        """
        Write feature REC to the file

        REC is a database record or dict."""

        # Format record for output (handling special types)
        rec_as_dict = {}
        for field_name in self.field_descs:
            value = rec[field_name]

            if value is None:
                pass

            if hasattr(value, "geom_from"):  # ENH: Find a better test
                value = rec._field(field_name).encode(self.geom_encoding, self.coord_sys)

            elif isinstance(value, datetime.datetime):
                value = datetime.datetime.strftime(value, self.timestamp_format)

            elif isinstance(value, datetime.date):
                value = datetime.datetime.strftime(value, self.date_format)

            rec_as_dict[field_name] = value

        # Write it
        self.writer.writerow(rec_as_dict)

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Close the output stream
        """

        self.strm.close()
