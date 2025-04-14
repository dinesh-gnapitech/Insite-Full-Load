################################################################################
# Superclass for feature input streams
################################################################################
# Copyright: IQGeo Limited 2010-2023

from abc import ABC, abstractmethod
import os
from typing import Optional, Type
from collections import OrderedDict
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from .myw_feature_stream_analyser import MywFeatureStreamAnalyser


class MywFeatureIStream(ABC):
    """
    Abstract superclass for streams yielding feature records (dicts)

    Subclasses must implement:
      format
      __init__(file_name,key_name,primary_geom_name,encoding,progress)
      __enter__()
      __iter__()
      __exit__()

    Also optionally:
     featureDef(ftr_name)
     coordSystem()"""

    @classmethod
    def streamFor(
        self,
        filepath,
        key_name,
        primary_geom_name,
        encoding=None,
        geom_heuristics=False,
        feature_type=None,
        progress=MywProgressHandler(),
    ):
        """
        Returns feature input stream for reading file FILEPATH

        KEY_NAME is the name of the field in which the primary key
        is to be stored (populated from GeoJSON member 'id')

        PRIMARY_GEOM_NAME is the name of the field in which the main
        geometry will be stored (from GeoJSON member 'geometry' or
        CSV heuristics)

        Determines stream type based on file extension"""

        ext = filepath.split(".")[-1].lower()

        if ext == "csv":
            from .myw_csv_feature_istream import MywCsvFeatureIStream

            return MywCsvFeatureIStream(
                filepath,
                key_name,
                primary_geom_name,
                encoding=encoding,
                progress=progress,
                geom_heuristics=geom_heuristics,
            )

        elif ext == "json":
            from .myw_json_feature_istream import MywJsonFeatureIStream

            return MywJsonFeatureIStream(
                filepath, key_name, primary_geom_name, encoding=encoding, progress=progress
            )

        elif ext in ("kml", "kmz"):
            from .myw_kml_feature_istream import MywKmlFeatureIStream

            return MywKmlFeatureIStream(filepath, key_name, primary_geom_name, progress=progress)

        else:
            from .myw_ogr_feature_istream import MywOgrFeatureIStream

            return MywOgrFeatureIStream(
                filepath,
                key_name,
                primary_geom_name,
                encoding=encoding,
                feature_type=feature_type,
                progress=progress,
            )

    def __init__(self, file_name, key_name, primary_geom_name, format, progress):
        """base constructor which sets default properties."""
        self.file_name = file_name
        self.key_name = key_name
        self.primary_geom_name = primary_geom_name
        self.format = format
        self.progress = progress

    def properties(self, full=False):
        """
        Properties of self (a dict)
        """

        props = OrderedDict()

        props["format"] = self.format

        coord_sys = self.coordSystem()
        if coord_sys:
            coord_sys = coord_sys.name
        props["coord_system"] = coord_sys

        if full:
            props["driver"] = self.__class__.__name__

        return props

    @abstractmethod
    def coordSystem(self) -> Optional[MywCoordSystem]:
        """
        The coordinate system in which self's data is returned (if known)

        Returns a MywCoordSystem (or None)"""

        raise NotImplementedError()

    def featureTypeInfos(self):
        """
        Summary info for feature types in self (a list of dicts, keyed by layer name)
        """
        # Backstop implementation determines feature name from file name

        infos = {}

        ftr_name = os.path.split(self.file_name)[-1].split(".")[0]
        infos[ftr_name] = {"name": ftr_name}

        return infos

    def featureDef(self, ftr_name):
        """
        myWorld feature definition for self's objects
        """
        # Backstop implementation deduces structure from records

        analyser = MywFeatureStreamAnalyser()

        return analyser.featureDefinitionFor(ftr_name, self)
