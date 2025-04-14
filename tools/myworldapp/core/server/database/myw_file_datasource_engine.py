################################################################################
# An external datasource engine wrapping a file
################################################################################
# Copyright: IQGeo Limited 2010-2023


from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.io.myw_feature_istream import MywFeatureIStream

from .myw_datasource_engine import MywDatasourceEngine


class MywFileDatasourceEngine(MywDatasourceEngine):
    """
    Engine wrapping a data file as if it were a datasource
    """

    # Hack to allow myw_eds command to be used on files

    def __init__(self, url, progress=MywProgressHandler()):
        """
        Init slots of self
        """

        super(MywFileDatasourceEngine, self).__init__(url, progress=progress)

        self.file_name = url

    def properties(self, full=False):
        """
        Information about self's server (a dict)
        """

        with MywFeatureIStream.streamFor(
            self.file_name, "id", "geometry"
        ) as strm:  # TODO: Remove need for geom and key
            return strm.properties(full)

    def all_feature_type_infos(self):
        """
        The feature types provided by self's server

        Returns a list of dicts, keyed by fully qualified feature type name"""

        with MywFeatureIStream.streamFor(
            self.file_name, "id", "geometry"
        ) as strm:  # TODO: Remove need for geom and key
            return strm.featureTypeInfos()

    # ==============================================================================
    #                               FEATURE TYPES ACCESS
    # ==============================================================================

    def get_feature_type_def(self, feature_type, force=False):
        """
        Request and return data for a feature type definition

        If FORCE is True, we ignore whether the feature is "advertised" (This can be valid, for example
        when a feature name is un-advertised but revealed through its presence in a LayerGroup)"""

        with MywFeatureIStream.streamFor(
            self.file_name, "id", "geometry"
        ) as strm:  # TODO: Remove need for geom and key
            return strm.featureDef(feature_type)

    # ==============================================================================
    #                                 FEATURE DATA ACCESS
    # ==============================================================================

    def get_feature_data(
        self, feature_type, bounds=None, geom_name=None, geom_format="wkb", limit=None
    ):
        """
        Yields records for FEATURE_TYPE within BOUNDS (in chunks)

        Yields:
          List of feature records"""

        # Check for no such feature
        if not feature_type in self.all_feature_type_infos():
            raise MywError("Feature not known:", feature_type)

        # Yield data
        with MywFeatureIStream.streamFor(
            self.file_name, "id", "geometry", feature_type=feature_type
        ) as strm:
            n_read = 0

            recs = []

            for rec in strm:
                if len(recs) > 10000:
                    yield recs
                recs.append(rec)

                n_read += 1
                if limit and n_read >= limit:
                    break

            yield recs
