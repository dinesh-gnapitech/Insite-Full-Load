################################################################################
# A myWorld tilestore
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os, copy, fnmatch
from collections import OrderedDict
from myworldapp.core.server.base.core.utils import replace_env_variables_in
from .myw_tile_db import MywTileDB


class MywTilestore:
    """
    A set of tile files (+ mappings from layers to files)

    Deals with opening and caching these files and retrieving
    tiles from them (see .get_tile())"""

    def __init__(self, file_specs, db_dir=None, verbosity=0):
        """
        Init self

        FILE_SPECS is a list of dicts used to determine the mapping
        from layer names to files (keys 'layers' and 'files') e.g.

          geo/EO   ->  c:/myworld/tiles/eo.sqlite
          geo/GDO  ->  c:/myworld/tiles/gdo.sqlite
          *        ->  c:/myworld/tiles2/other.sqlite

        File paths can contain references to OS environment
        variables using {VAR_NAME}.

        Optional VERBOSITY can be used to output info on name lookups etc"""

        # Init slots
        self.name = "TILESTORE"
        self.file_specs = file_specs
        self.verbosity = verbosity

        self.layer_db_files = dict()  # Mapping from layer name to tile DB file (init lazily)
        self.file_db_files = dict()  # Mapping from file name to tile DB file  (init lazily)

        # Build lookup table
        self.layer_file_lookup = OrderedDict()

        for file_spec in file_specs:
            layer_spec = file_spec.get("layers", None)
            if layer_spec is None:
                continue
            file_name = file_spec["file"]
            file_name = replace_env_variables_in(file_name)
            file_name = os.path.normpath(file_name)

            self.layer_file_lookup[layer_spec] = file_name

        # Show progress
        for layer_spec, file_name in list(self.layer_file_lookup.items()):
            self._report_progress(layer_spec, "->", file_name)

    def tileFiles(self):
        """
        Names of the tile files of self
        """

        unique_names = set(self.layer_file_lookup.values())

        return sorted(unique_names)

    def tileFile(self, basename):
        """
        Path to tile file with name BASENAME (if any)
        """

        # ENH: Should check basename is unique

        for filename in list(self.layer_file_lookup.values()):
            if os.path.basename(filename) == basename:
                return filename

        return None

    def get_tile(self, layer, zoom, x, y):
        """
        Returns specified tile (or None if not found)

        LAYER is the layer name e.g. 'geo/telco'. ZOOM, X and Y are
        the Google-format address of the tile (i.e. origin top-left)"""

        # Get cached database file (if there is one)
        db_file = self._db_file_for_layer(layer)

        if not db_file:
            return None

        # Get tile from it (if there is one)
        return db_file.tile(layer, zoom, x, y)

    def _db_file_for_layer(self, layer):
        """
        The cached database file for LAYER (if there is one)
        """

        try:
            db_file = self.layer_db_files[layer]

        except KeyError:
            db_file = self._db_file_for(layer)

            # Cache it (even if None .. to prevent repeated lookups)
            self.layer_db_files[layer] = db_file

        return db_file

    def _db_file_for(self, layer):
        """
        The database file for layer (if there is one)
        """

        # Determine the file in whcih layer resides (if we can)
        filename = self._filename_for_layer(layer)

        if filename == None:
            self._report_error("Cannot determine file for layer", layer)
            return None

        # Get associated DB from cache (or open and cache it)
        try:
            db_file = self.file_db_files[filename]

        except KeyError:
            db_file = self._open_file(filename)
            self.file_db_files[filename] = db_file

        return db_file

    def _filename_for_layer(self, layer):
        """
        The file in which LAYER is stored (if known)
        """

        # Determine which file to open
        # ENH: Faster to translate kyes to regex and cache?
        for (key, filename) in list(self.layer_file_lookup.items()):
            if fnmatch.fnmatch(layer, key):
                return filename

        return None

    def _open_file(self, file):
        """
        Ope sqlite database FILE

        Returns connection (None if open failed)"""

        self._report_progress("Opening file", file)

        try:
            db_file = MywTileDB(file, "r")

        except Exception as e:
            self._report_error("Open failed:", "file=", file, "error=", e)
            db_file = None

        self._report_progress("Opened file", file)

        return db_file

    def _report_progress(self, *items):
        """
        Log a progress message
        """

        # ENH: Pass in a level arg
        # ENH: Log as notice (rather than error)

        if self.verbosity < 1:
            return

        msg = "INFO: " + self.name

        for item in items:
            msg += " " + str(item)

        print(msg)

    def _report_error(self, *items):
        """
        Report a error
        """

        msg = "myw_tile_server:"

        for item in items:
            msg += " " + str(item)

        print(msg)

    def mapped_spec(self, dir_name):
        """
        Return copy of self's file_specs with directory substituted by DIR_NAME
        """
        # Used in replication

        mapped_file_specs = []

        for file_spec in self.file_specs:
            mapped_file_spec = copy.copy(file_spec)

            file_name = os.path.basename(file_spec["file"])
            mapped_file_spec["file"] = os.path.join(dir_name, file_name)

            mapped_file_specs.append(mapped_file_spec)

        return mapped_file_specs
