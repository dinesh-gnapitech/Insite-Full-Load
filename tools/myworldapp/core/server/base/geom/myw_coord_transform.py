# ******************************************************************************
# Coordinate Transform Definition
# ******************************************************************************
# Copyright: IQGeo Limited 2010-2023

import os.path
import pyproj, pyproj.exceptions
from myworldapp.core.server.base.core.myw_error import MywCoordSystemError, MywProjFileMissingError


class MywCoordTransform:
    """
    A geographic transform definition

    Wraps pyproj.Transaction. Provided to reskin proj string parse errors."""

    def __init__(self, transform_proj):
        """transform_proj should be a pipeline-like proj string defining the transform."""
        # reject anything that should probably be handled by MywCoordSystem:
        if not (isinstance(transform_proj, str) and transform_proj.startswith("+")):
            raise MywCoordSystemError(f"Bad transform definition: {transform_proj}")

        self._proj_str = transform_proj

        try:
            self._transformer = pyproj.Transformer.from_pipeline(transform_proj)
        except pyproj.exceptions.ProjError as ex:
            pyproj_err_message = str(ex)
            exclass = MywCoordSystemError
            path = ""
            if "File not found or invalid" in pyproj_err_message:

                path = os.path.join(os.path.dirname(pyproj.__file__), "proj_dir", "share", "proj")
                exclass = MywProjFileMissingError

            raise exclass(
                "Bad coodinate system definition. pyproj error:", pyproj_err_message, path=path
            )

    def __repr__(self):
        return f'MywCoordTransform("{self._proj_str}")'

    def __str__(self):
        return repr(self)

    def __ident__(self):
        return repr(self)

    @property
    def transform_function(self):
        return self._transformer.transform
