# Copyright: IQGeo Limited 2010-2023

import os, argparse, glob, fnmatch, shutil

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter
from myworldapp.core.server.base.tilestore.myw_tile_db import MywTileDB

from .myw_command import MywCommand
from .myw_argparse_help_formatter import MywArgparseHelpFormatter


def _define_operation(arg_subparsers, operation, help):
    """
    Helper to add definition for an operation
    """

    op_def = arg_subparsers.add_parser(
        operation, help=help, formatter_class=MywArgparseHelpFormatter
    )
    op_def.set_defaults(operation=operation)

    return op_def


def _add_standard_args(op_def):
    """
    Define the 'standard' arguments
    """
    # Note: Done with separate proc to get the standard args at end

    op_def.add_argument("--verbosity", type=int, metavar="LEVEL", default=2, help="Witterage level")
    op_def.add_argument(
        "--summary", type=int, metavar="LEVEL", default=0, help="Summary output level"
    )


class MywTilestoreCommand(MywCommand):
    """
    Engine implementing the tilestore management command line utility

    Example of use:
      MywTilestoreCommand().run('tiles.sqlite','list','levels','t*')"""

    # ==============================================================================
    #                                 CLASS VARIABLES
    # ==============================================================================

    # Definition of command syntax (gets extended in operation clauses below)
    arg_parser = argparse.ArgumentParser(
        prog="myw_tilestore", formatter_class=MywArgparseHelpFormatter
    )
    arg_parser.add_argument(
        "--version", action="version", version="%(prog)s " + MywCommand.version()
    )
    arg_parser.epilog = "Utility for managing myWorld tile files."

    arg_parser.add_argument(
        "sqlite_file", type=str, help="Tilestore on which operation is to be performed"
    )
    arg_subparsers = arg_parser.add_subparsers(
        dest="operation", help="Operation to perform", required=True
    )

    # ==============================================================================
    #                                  RUNNING
    # ==============================================================================

    def run_method(self, meth):
        """
        Execute method METH

        Subclassed to init progress handler"""

        self.progress = MywSimpleProgressHandler(self.args.verbosity)

        MywCommand.run_method(self, meth)

        if self.args.summary:
            self.progress.print_statistics(self.args.summary)

    # ==============================================================================
    #                               OPERATION CREATE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "create", help="Create an empty tile file")
    op_def.add_argument(
        "--overwrite", action="store_true", help="Overwrite existing file (if there is one)"
    )
    _add_standard_args(op_def)

    def operation_create(self):
        """
        Create empty file
        """

        # Check for already exists
        if os.path.exists(self.args.sqlite_file):

            if not self.args.overwrite:
                raise MywError("File already exists:", self.args.sqlite_file)

            self.progress(2, "Removing", self.args.sqlite_file)
            os.unlink(self.args.sqlite_file)  # ENH: Use os_engine

        # Create it
        self.progress(2, "Creating", self.args.sqlite_file)
        tile_db = MywTileDB(self.args.sqlite_file, mode="w", progress=self.progress)

    # ==============================================================================
    #                               OPERATION LIST
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "list", help="Show summary of file contents")
    op_def.add_argument(
        "what",
        type=str,
        choices=["layers", "levels", "tiles", "versions", "checkpoints"],
        nargs="?",
        default="layers",
        help="Type of information to show",
    )
    op_def.add_argument(
        "name", type=str, nargs="?", default="*", help="Item to show (can be wildcard)"
    )
    op_def.add_argument("--area", type=str, help="Geographic region (lon1,lat1):(lon2,lat2)")
    op_def.add_argument(
        "--since", type=str, metavar="CHECKPOINT", help="Show only changes since this checkpoint"
    )
    _add_standard_args(op_def)

    def operation_list(self):
        """
        List file contents
        """

        # Open input file
        tile_db = MywTileDB(self.args.sqlite_file, progress=self.progress)

        # Build tile selection filter
        tile_filter = {}
        if self.args.since != None:
            tile_filter["since_version"] = tile_db.dataVersionFor(self.args.since)
        if self.args.area != None:
            tile_filter["bounds"] = self.parse_bounds_arg("area", self.args.area)

        # Do operation
        if self.args.what == "layers":
            self.list_layers(tile_db, self.args.name, tile_filter)
        elif self.args.what == "levels":
            self.list_levels(tile_db, self.args.name, tile_filter)
        elif self.args.what == "tiles":
            self.list_tiles(tile_db, self.args.name, tile_filter)
        elif self.args.what == "versions":
            self.list_versions(tile_db, self.args.name)
        elif self.args.what == "checkpoints":
            self.list_checkpoints(tile_db, self.args.name)
        else:
            raise Exception("Bad value for show")  # Should never happen

    def list_layers(self, tile_db, layer_filter, tile_filter):
        """
        Helper to show layers in a tile file
        """

        # Show file properties
        print("format:", tile_db.format())

        # Get layers
        layers = fnmatch.filter(tile_db.layers(), layer_filter)
        n_layers = len(layers)

        # Show number of layers (if we know yet)
        if not tile_filter:
            print("layers:", n_layers)
        print()

        # Build data to display
        rows = []
        for layer in layers:
            stats = tile_db.layerStats(layer, **tile_filter)
            stats["layer"] = layer
            stats["levels"] = "{}:{}".format(stats["min_zoom"], stats["max_zoom"])
            rows.append(stats)

        # Display it
        tab_fmtr = MywTableFormatter("layer", "levels", "count")
        self.print_lines(tab_fmtr.format(rows))

    def list_levels(self, tile_db, layer_filter, tile_filter):
        """
        Helper to list zoom level stats for a tile file
        """

        # Get layers
        layers = fnmatch.filter(tile_db.layers(), layer_filter)

        # Build data to display
        rows = []
        for layer in layers:
            universe = layer.split("/")[0]

            # Find zoom levels
            layer_stats = tile_db.layerStats(layer, **tile_filter)

            if layer_stats["count"] == 0:
                continue

            # For each level in layer
            for zoom in range(layer_stats["min_zoom"], layer_stats["max_zoom"] + 1):

                # Get stats for level
                stats = tile_db.levelStats(layer, zoom, **tile_filter)

                if stats["count"] == 0:
                    continue

                stats["layer"] = layer
                stats["level"] = zoom
                stats["x_range"] = "{}:{}".format(stats["min_x"], stats["max_x"])
                stats["y_range"] = "{}:{}".format(stats["min_y"], stats["max_y"])

                if universe == "geo":
                    geo_stats = tile_db.geoLevelStatsFor(zoom, stats)
                    stats["bounds"] = "({:0.5f},{:0.5f}):({:0.5f},{:0.5f})".format(
                        geo_stats["min_x"],
                        geo_stats["min_y"],
                        geo_stats["max_x"],
                        geo_stats["max_y"],
                    )
                else:
                    stats["bounds"] = None
                rows.append(stats)

        # Display it
        tab_fmtr = MywTableFormatter("layer", "level", "count", "x_range", "y_range", "bounds")
        self.print_lines(tab_fmtr.format(rows))

    def list_tiles(self, tile_db, layer_filter, tile_filter):
        """
        Helper to list tiles in a tile file
        """

        # Get layers
        layers = fnmatch.filter(tile_db.layers(), layer_filter)

        # For each layer .. show its tiles
        for layer in layers:
            for tile in tile_db.tiles(layer, **tile_filter):
                data_len = len(tile["data"])
                print(
                    "{}/{}/{}/{}.png {:>7} bytes".format(
                        layer, tile["zoom"], tile["x"], tile["y"], data_len
                    )
                )

    def list_versions(self, tile_db, filter):
        """
        Show version stamps matching FILTER
        """

        rows = []
        for rec in tile_db.versionStampRecs():
            if fnmatch.fnmatch(rec["component"], filter):
                rows.append(rec)

        tab_fmtr = MywTableFormatter("component", "version")
        self.print_lines(tab_fmtr.format(rows))

    def list_checkpoints(self, tile_db, filter):
        """
        Show checkpoints matching FILTER
        """

        rows = []
        for name in tile_db.checkpoints():
            if fnmatch.fnmatch(name, filter):
                rows.append(tile_db.checkpointRec(name))

        tab_fmtr = MywTableFormatter(["name", "checkpoint"], "version")
        self.print_lines(tab_fmtr.format(rows))

    # ==============================================================================
    #                                  OPERATION LOAD
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "load", help="Load tiles from png files or another sqlite file"
    )
    op_def.add_argument(
        "directory_or_file",
        type=str,
        nargs="+",
        help="Directory or sqlite file to import tiles from (can be wildcard)",
    )
    op_def.add_argument(
        "--format",
        type=str,
        choices=["myw_tree", "zxy_tree", "zyx_tree", "myw_file", "mb_file"],
        default=None,
        help="Format of the input data",
    )
    op_def.add_argument(
        "--exclude", type=str, default="", help="Exclude these file names from the match"
    )
    op_def.add_argument("--levels", type=str, default=":", help="Zoom levels to load: min:max")
    op_def.add_argument(
        "--compress",
        type=str,
        choices=["yes", "no"],
        default="no",
        help="Compress the tiles as they are loaded (non-lossy)",
    )
    op_def.add_argument(
        "--skip_empty",
        type=str,
        choices=["yes", "no"],
        default=None,
        help="Ignore tiles that contain no data",
    )
    op_def.add_argument(
        "--skip_unchanged",
        type=str,
        choices=["yes", "no"],
        default="yes",
        help="Only update tiles that have genuinely changed",
    )
    _add_standard_args(op_def)

    def operation_load(self):
        """
        Load tiles from file or other tilestore
        """

        # Deal with defaults
        skip_empty = self.args.skip_empty or self.args.compress

        # Check args
        if skip_empty == "yes" and self.args.compress == "no":
            raise MywError("skip_empty can only be used with compress=yes")

        # For each file specification ...
        for filespec in self.args.directory_or_file:

            # Expand wildcards
            filepaths = sorted(glob.glob(filespec))

            if len(filepaths) == 0:
                self.progress("warning", "File not found", filespec)
                continue

            # For each file .. load it
            for filepath in sorted(glob.glob(filespec)):

                # Apply exclusions
                (parentpath, filename) = os.path.split(filepath)
                if fnmatch.fnmatch(filename, self.args.exclude):
                    continue

                # Open output file, creating if necessary (here to avoid creating if load fails)
                tile_db = MywTileDB(self.args.sqlite_file, "w", progress=self.progress)

                # Parse the
                zooms = self.args.levels.split(":")
                try:
                    min_z = int(zooms[0])
                except ValueError:
                    min_z = None
                try:
                    max_z = int(zooms[1])
                except ValueError:
                    max_z = None

                # Do the operation
                if os.path.isdir(filepath):
                    self.load_from_tree(
                        tile_db,
                        filepath,
                        format=self.args.format,
                        compress=self.args.compress,
                        skip_empty=skip_empty,
                        min_zoom=min_z,
                        max_zoom=max_z,
                    )
                else:
                    self.load_from_file(
                        tile_db,
                        filepath,
                        format=self.args.format,
                        compress=self.args.compress,
                        skip_unchanged=self.args.skip_unchanged,
                        skip_empty=skip_empty,
                        min_zoom=min_z,
                        max_zoom=max_z,
                    )

                # Tidy up
                tile_db.close()

    def load_from_tree(
        self, tile_db, dir_path, format, compress, skip_empty, min_zoom=None, max_zoom=None
    ):
        """
        Helper to load tiles from a directory tree
        """

        # Convert flags to bools
        skip_empty = skip_empty == "yes"

        # Determine tree format
        format = format or "myw_tree"

        # Determine layer name
        (parent_path, dir_name) = os.path.split(dir_path)
        (junk, parent_dir_name) = os.path.split(parent_path)
        layer = parent_dir_name + "/" + dir_name

        # Load the tiles
        self.progress("starting", "Loading tiles from", dir_path, "(layer={})".format(layer), "...")

        n_tiles = tile_db.loadFromTree(
            dir_path, layer, format, compress, skip_empty, min_zoom, max_zoom
        )
        self.progress("finished", tiles=n_tiles)

    def load_from_file(
        self,
        tile_db,
        from_sqlite_file,
        format=None,
        compress="no",
        skip_empty=None,
        skip_unchanged="no",
        since_version=-1,
        min_zoom=None,
        max_zoom=None,
    ):
        """
        Load tiles from another database
        """

        # Convert flags to bools
        compress = compress == "yes"
        skip_empty = skip_empty == "yes"
        skip_unchanged = skip_unchanged == "yes"

        # Open input file
        from_tile_db = MywTileDB(from_sqlite_file, "r", type=format, progress=self.progress)

        # Load the tiles
        self.progress("starting", "Loading tiles from", from_sqlite_file, "...")
        n_tiles = tile_db.loadFromDB(
            from_tile_db,
            compress=compress,
            skip_empty=skip_empty,
            skip_unchanged=skip_unchanged,
            since_version=since_version,
            min_zoom=min_zoom,
            max_zoom=max_zoom,
        )

        self.progress("finished", tiles=n_tiles)

    # ==============================================================================
    #                               OPERATION DUMP
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "dump", help="Export tiles to a directory tree or SQLite file"
    )
    op_def.add_argument(
        "directory_or_file", type=str, help="Directory or SQLite file to export files to"
    )
    op_def.add_argument(
        "layer", type=str, nargs="?", default="*", help="Layer to dump (can be wildcard)"
    )
    op_def.add_argument(
        "--overwrite", action="store_true", help="If target file exists, replace it"
    )
    op_def.add_argument("--update", action="store_true", help="If target file exists, update it")
    op_def.add_argument(
        "--since",
        type=str,
        metavar="CHECKPOINT",
        help="Copy only tiles changed since this checkpoint",
    )
    op_def.add_argument("--area", type=str, help="Region to dump (lon1,lat1):(lon2,lat2)")
    op_def.add_argument(
        "--clip", type=str, choices=["yes", "no"], default="yes", help="Clip tiles to region"
    )
    op_def.add_argument(
        "--checkpoint",
        type=str,
        metavar="NAME",
        help="Mark the dumped version with this name (atomic)",
    )
    op_def.add_argument(
        "--format",
        type=str,
        choices=["myw_tree", "zxy_tree", "zyx_tree", "myw_file"],
        default=None,
        help="Format to dump to",
    )
    _add_standard_args(op_def)

    def operation_dump(self):
        """
        Export tiles to directory tree
        """

        # Open input file
        tile_db = MywTileDB(self.args.sqlite_file, progress=self.progress)

        # Build tile selection filter
        tile_filter = {}
        if self.args.since != None:
            tile_filter["since_version"] = tile_db.dataVersionFor(self.args.since)
        if self.args.area != None:
            tile_filter["bounds"] = self.parse_bounds_arg("area", self.args.area)

        # Get output format
        dir_or_file = self.args.directory_or_file
        format = self.args.format
        if not format:
            if "." in os.path.basename(dir_or_file):
                format = "myw_file"
            else:
                format = "myw_tree"

        to_tree = format.endswith("_tree")

        # Handle output file already exists
        if os.path.exists(dir_or_file):

            if self.args.overwrite:
                if to_tree:
                    shutil.rmtree(dir_or_file, ignore_errors=True)  # ENG: Use OS Engine
                    if os.path.exists(dir_or_file):
                        raise MywError("Remove tree failed:", dir_or_file)
                else:
                    os.remove(dir_or_file)

            elif not self.args.update:
                raise MywError("File already exists:", dir_or_file)

        # Do export
        if to_tree:
            self.dump_to_tree(tile_db, self.args.layer, dir_or_file, format, tile_filter)
        else:
            self.dump_to_file(
                tile_db, self.args.layer, dir_or_file, tile_filter, clip=self.args.clip
            )

        # Mark the dumped version (for use as a baseline later)
        if self.args.checkpoint:
            version = tile_db.setCheckpoint(self.args.checkpoint)
            self.progress(1, "Set checkpoint", self.args.checkpoint, "at version", version)

        tile_db.close()

    def dump_to_file(self, tile_db, layer_spec, to_sqlite_file, tile_filter, clip):
        """
        Export tiles for LAYER_SPEC to tile file TO_SQLITE_FILE

        TILE_FILTER is a dict specifying filtering options ('bounds', 'since_version', etc)"""

        # Say what we are about to do
        self.progress(1, "Exporting tiles to", to_sqlite_file, "...")

        # Create output file
        to_tile_db = MywTileDB(to_sqlite_file, "w", progress=self.progress)

        # Get layers to export (making fast if all layers)
        if layer_spec == "*":
            layers = [""]
        else:
            layers = fnmatch.filter(tile_db.layers(), layer_spec)
        clip_b = True if clip == "yes" else False
        # Copy the tiles
        for layer in layers:
            self.progress(
                "starting", "Exporting all layers" if layer == "" else "Exporting layer " + layer
            )
            n_tiles = to_tile_db.loadFromDB(
                tile_db, layer=layer, compress=False, clip=clip_b, **tile_filter
            )
            self.progress("finished", tiles=n_tiles)

        # Commit the change
        to_tile_db.close()

    def dump_to_tree(self, tile_db, layer_spec, dir, format, tile_filter):
        """
        Export tiles for LAYERS to myworld directory tree DIR

        TILE_FILTER is a dict specifying filtering options ('bounds', 'since_version', etc)"""

        # ENH: Support other formats

        # Say what we are about to do
        self.progress(1, "Exporting tiles to", dir, " ...")

        # Get layers to export
        layers = fnmatch.filter(tile_db.layers(), layer_spec)

        # Create root directory (if necessary)
        if not os.path.exists(dir):
            os.mkdir(dir)

        # For each layer .. export it
        for layer in layers:
            self.progress("starting", "Exporting layer", layer)
            n_tiles = tile_db.exportToTree(layer, dir, format, **tile_filter)
            self.progress("finished", tiles=n_tiles)

    # ==============================================================================
    #                              OPERATION RENAME
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "rename", help="Rename layer")
    op_def.add_argument("layer", type=str, help="Layer to rename")
    op_def.add_argument("new_name", type=str, help="New name for layer")
    _add_standard_args(op_def)

    def operation_rename(self):
        """
        Rename a layer
        """

        # ENH: Should update record versions?

        tile_db = MywTileDB(self.args.sqlite_file, mode="u", progress=self.progress)

        n_recs = tile_db.renameLayer(self.args.layer, self.args.new_name)
        self.progress(1, "Renamed", n_recs, "tiles")

    # ==============================================================================
    #                              OPERATION DELETE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "delete", help="Delete layer")
    op_def.add_argument("layer", type=str, help="Layer to delete")
    _add_standard_args(op_def)

    def operation_delete(self):
        """
        Delete tiles for specified layer(s)
        """

        tile_db = MywTileDB(self.args.sqlite_file, mode="u", progress=self.progress)

        n_recs = tile_db.deleteLayer(self.args.layer)
        self.progress(1, "Deleted", n_recs, "tiles")

    # ==============================================================================
    #                              OPERATION CHECKPOINT
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "checkpoint", help="Create a checkpoint")
    op_def.add_argument("name", type=str, help="Checkpoint name")
    op_def.add_argument(
        "--at", type=str, help="Version to create checkpoint at (default: current version)"
    )
    op_def.add_argument(
        "--reposition", action="store_true", help="If checkpoint already exists, reposition it"
    )
    _add_standard_args(op_def)

    def operation_checkpoint(self):
        """
        Create or update checkpoint
        """

        tile_db = MywTileDB(self.args.sqlite_file, "u", progress=self.progress)

        # Check for already exists
        if not self.args.reposition and (tile_db.dataVersionFor(self.args.name, False) != None):
            raise MywError("Checkpoint already exists: {}".format(self.args.name))

        # Get version
        if self.args.at:
            version = tile_db.dataVersionFor(self.args.at)
        else:
            version = None

        # Create or reposition
        version = tile_db.setCheckpoint(self.args.name, version)

        self.progress(1, "Set checkpoint", self.args.name, "at data version", version)

        tile_db.commit()

    # ==============================================================================
    #                                OPERATION MAINTAIN
    # ==============================================================================

    op_def = _define_operation(
        arg_subparsers, "maintain", help="Maintain statistics and internal tables"
    )
    op_def.add_argument("what", choices=["statistics", "layer_data"], help="Information to update")
    _add_standard_args(op_def)

    def operation_maintain(self):
        """
        Maintain internal tables and statistics
        """

        tile_db = MywTileDB(self.args.sqlite_file, mode="u", progress=self.progress)

        if self.args.what == "statistics":
            self.progress("starting", "Building statistics...")
            tile_db.updateStatistics()
            self.progress("finished", "Statistics updated")
        elif self.args.what == "layer_data":
            if tile_db.schemaVersion() > 4:  # Catches MB tiles format
                self.progress("starting", "Updating Layer data...")
                tile_db.updateLayerData()
                self.progress("finished", "Layer data updated")
            # else - inform user that they're doing something silly

    # ==============================================================================
    #                              OPERATION UPGRADE
    # ==============================================================================

    op_def = _define_operation(arg_subparsers, "upgrade", help="Upgrade to lastest schema")
    _add_standard_args(op_def)

    def operation_upgrade(self):
        """
        Upgrade to lastest schema
        """

        tile_db = MywTileDB(self.args.sqlite_file, "u", progress=self.progress)

        self.progress(1, "Upgrading from schema version", tile_db.schemaVersion(), "...")
        tile_db.upgradeSchema()
