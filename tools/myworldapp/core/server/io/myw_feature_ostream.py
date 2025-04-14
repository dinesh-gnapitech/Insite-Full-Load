################################################################################
# Superclass for feature output streams
################################################################################
# Copyright: IQGeo Limited 2010-2023


class MywFeatureOStream:
    """
    Abstract superclass for streams for writing feature records

    Subclasses must implement:
      __init__(file_name,field_descs,encoding,...)
      __enter__()
      writeFeature()
      __exit__()"""

    @classmethod
    def streamFor(self, filepath, field_descs, encoding=None, **file_options):
        """
        Returns feature input stream for reading file FILEPATH

        Determines stream type based on file extension"""

        ext = filepath.split(".")[-1].lower()

        if ext == "csv":
            from .myw_csv_feature_ostream import MywCsvFeatureOStream

            return MywCsvFeatureOStream(filepath, field_descs, encoding=encoding, **file_options)

        elif ext == "json":
            from .myw_json_feature_ostream import MywJsonFeatureOStream

            return MywJsonFeatureOStream(filepath, field_descs, encoding=encoding, **file_options)

        else:
            from .myw_ogr_feature_ostream import MywOgrFeatureOStream

            return MywOgrFeatureOStream(
                filepath, field_descs, file_format=ext, coord_sys=file_options.get("coord_sys")
            )
