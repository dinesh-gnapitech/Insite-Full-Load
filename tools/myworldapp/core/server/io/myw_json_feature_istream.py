################################################################################
# Stream yielding feature objects from a JSON file
################################################################################
# Copyright: IQGeo Limited 2010-2023

import codecs
import geojson
from geojson.geometry import Geometry as Geojson_Geometry
from simplejson.decoder import JSONDecodeError

from myworldapp.core.server.base.core.myw_error import MywDataLoadError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from .myw_feature_istream import MywFeatureIStream


class MywJsonFeatureIStream(MywFeatureIStream):
    """
    Stream yielding features from a GeoJSON file

    File must contain exactly one FeatureCollection object

    Acts as a Python context manager"""

    def __init__(
        self, file_name, key_name, primary_geom_name, encoding=None, progress=MywProgressHandler()
    ):
        """
        Create a stream yielding features from JSON file FILE_NAME

        Input file is assumed to have GeoJSON structure (with myWorld extensions)

        GeoJSON member 'id' is stored as an attribute KEY_NAME
        GeoJSON member 'geometry' is stored as an attribute PRIMARY_GEOM_NAME"""

        super().__init__(file_name, key_name, primary_geom_name, "GeoJSON", progress)

        self.encoding = encoding or "utf8"

    def coordSystem(self):
        return None

    def __enter__(self):
        """
        Open stream
        """

        factory = lambda ob: geojson.GeoJSON.to_instance(ob)

        with codecs.open(self.file_name, "r", encoding=self.encoding) as in_file:

            try:
                ftr_coll = geojson.load(in_file, object_hook=factory)

                if not isinstance(ftr_coll, geojson.FeatureCollection):
                    raise MywDataLoadError(
                        self.file_name + ": File does not contain a FeatureCollection object"
                    )

                self.features = ftr_coll.features

            except JSONDecodeError as cond:
                raise MywDataLoadError(
                    self.file_name + ": Bad JSON format: " + str(cond), internal_exception=cond
                )

        return self

    def __iter__(self):
        """
        Yields records from the file as dicts
        """

        for feature in self.features:
            rec = {}

            # Add key
            if feature.get("id") != None:
                rec[self.key_name] = feature.id

            # Add attributes
            for prop, val in list(feature.properties.items()):
                rec[prop] = val

            # Add geometries
            # ENH: Return WKT or shapely geometries (rather than geojson geoms)
            rec[self.primary_geom_name] = feature.geometry

            if hasattr(feature, "secondary_geometries"):
                for prop, geom in list(feature.secondary_geometries.items()):
                    if geom:
                        rec[prop] = Geojson_Geometry(
                            coordinates=geom["coordinates"], type=geom["type"]
                        )
                    else:
                        rec[prop] = None

            yield rec

    def __exit__(self, exc_type, exc_value, traceback):
        """
        Close stream
        """

        pass
