################################################################################
# Stream yielding feature objects from a KML or KMZ file
################################################################################
# Copyright: IQGeo Limited 2010-2023

import traceback
from collections import OrderedDict
from osgeo import ogr

from myworldapp.core.server.base.core.myw_error import MywError, MywDataLoadError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from .myw_feature_istream import MywFeatureIStream


class MywKmlFeatureIStream(MywFeatureIStream):
    """
    Stream yielding features from a kml or kmz file

    Acts as a Python context manager"""

    def __init__(self, file_name, key_name, primary_geom_name, progress=MywProgressHandler()):
        """
        Create stream yielding features from file FILE_NAME

        Input file is assumed to contain a header record
        """

        super().__init__(file_name, key_name, primary_geom_name, "KML", progress)

        self.strm = None
        self.line_num = 0

    def __enter__(self):
        """
        Open stream
        """
        # ENH: Cleaner to use @contextmanager

        self.driver = ogr.GetDriverByName(
            "KML"
        )  # ENH: Get libKML on linux and use that (supports KMZ)

        # Open the file
        # ENH: Use GDAL exceptions to raise errors?
        self.file = self.driver.Open(self.file_name)
        if not self.file:
            raise MywError("Error opening file:", self.file_name)

        # Get the first placemarks layer
        layer_name = list(self.featureTypeInfos().keys())[0]
        self.strm = self.file.GetLayerByName(layer_name)
        self.layer_def = self.strm.GetLayerDefn()

        self.fields = ["name", "description"]

        return self

    def __iter__(self):
        """
        Yields records from the file (as dicts)
        """

        for ftr in self.strm:
            self.line_num += 1

            rec = {}

            for key in self.fields:
                rec[key.lower()] = ftr[key]

            geom = ftr.GetGeometryRef()
            geom.FlattenTo2D()
            rec[self.primary_geom_name] = geom.ExportToWkt()  # TODO: Better as WKB

            yield rec

    def __exit__(self, exc_type, exc_value, traceback_arg):
        """
        Close stream

        Returns True if exception is to be re-raised"""

        # Tidy up
        if self.file:
            self.file = None  # No way to explicitly close the file?

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

    def coordSystem(self):
        """
        The coordinate system in which self's data is returned (if known)

        Returns a MywCoordSystem (or None)"""

        return MywCoordSystem(4326)  # WGS84 lon/lat

    def featureTypeInfos(self):
        """
        Summary info for feature types in self (a list of dicts, keyed by layer name)

        Uses OGR, which flattens folders to a single level"""
        # ENH: Get folder-qualified names e.g. use https://github.com/Toblerity/keytree or FastKml

        infos = OrderedDict()

        for layer in self.file:
            name = layer.GetName()  # ENH: Store a myw_name (with spaces as underscores etc)

            if not name in infos:
                infos[name] = {
                    "name": name,
                    "description": layer.GetDescription(),
                    "n_recs": layer.GetFeatureCount(),
                    "geom_type": layer.GetGeomType(),
                }
            else:
                self.progress("warning", "Duplicate layer name:", name)

        return infos

    def featureDef(self, ftr_name):
        """
        myWorld feature definition for self's feature type FTR_NAME
        """
        # ENH: Include layer name (= folder name)

        fld_defs = []
        fld_defs.append({"name": "name", "type": "string", "key": True})
        fld_defs.append({"name": "description", "type": "string"})
        fld_defs.append(
            {"name": self.primary_geom_name, "type": "point"}
        )  # TODO: Get from object somehow

        return {"name": ftr_name, "fields": fld_defs}
