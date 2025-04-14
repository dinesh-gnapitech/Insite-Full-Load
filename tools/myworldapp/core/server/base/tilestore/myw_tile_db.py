# General imports
# Copyright: IQGeo Limited 2010-2023

import os

from .myw_mw_tile_db import MywMWTileDB
from .myw_mb_tile_db import MywMBTileDB


def MywTileDB(filename, mode="r", type=None, progress=None):
    """
    Open a tile file for reading or writing

    MODE is one of:
     r  Readonly (file must exist)
     u  Update (file must exist)
     w  Write (file created if doesn't exist, updated if it does)

    TYPE is once of mb_file or myw_file. If not given, format
    deduced from file extension.

    Returns an object implementing the MywTileDBMixin interface"""

    if type == None:
        ext = os.path.splitext(filename)[1]
        type = "mb_file" if (ext in [".mbt", ".mbtiles"]) else "myw_file"

    if type == "mb_file":
        return MywMBTileDB(filename, mode, progress=progress)
    if type == "myw_file":
        return MywMWTileDB(filename, mode, progress=progress)

    raise Exception("Bad type: " + type)  # Internal error
