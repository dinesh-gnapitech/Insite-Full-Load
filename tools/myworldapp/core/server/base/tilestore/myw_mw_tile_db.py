################################################################################
# A myWorld format sqlite tile file
################################################################################
# Copyright: IQGeo Limited 2010-2023

# General imports
import os
import re
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine

from .myw_tile_db_mixin import MywTileDBMixin


class MywMWTileDB(MywTileDBMixin):
    """
    A myWorld format sqlite tile database (read/write)

    Format is an extension of MB Tiles. Supports multiple
    layers, change detection etc. As with MB tiles, tile
    addresses are stored in TMS format (i.e. origin bottom left)

    Internally, uses Java engine to accelerate load operations"""

    def __init__(self, filename, mode, progress=None):
        """
        Initialise self
        """

        # Init super
        super(MywMWTileDB, self).__init__(filename, mode, progress)

        # Init self
        self.type = "myw_tile"

        # If new file .. create schema
        if (mode == "w") and (self.schemaVersion() == -1):
            self.ensureSchema()

    # ==============================================================================
    #                                  CREATION
    # ==============================================================================

    def upgradeSchema(self):
        """
        Update schema to latest version
        """

        self.ensureSchema()

    # ==============================================================================
    #                                  PROPERTIES
    # ==============================================================================

    def basename(self):
        """
        The basename of self's file
        """

        return os.path.basename(self.filename)

    def format(self):
        """
        String used to identify self's format in GUI
        """

        return "{}({})".format(self.type, self.schemaVersion())

    def schemaVersion(self):
        """
        Schema version (-1 in not a myWorld DB)
        """

        if self.hasTable("myw_version_stamp"):
            return self.versionStamp("schema")

        if self.hasTable("myw_version"):
            return 1

        if self.hasTable("myw_tiles"):
            return 0

        return -1

    # ==============================================================================
    #                                  LAYER STATS
    # ==============================================================================

    def layers(self, reeval=False):
        """
        The names of the layers in self
        """

        if not reeval and self.schemaVersion() > 4:
            sql = "SELECT id FROM myw_layers ORDER BY id"
        else:
            sql = "SELECT DISTINCT (id) FROM myw_tiles"

        cur = self.connection.cursor()  # TODO: Should clean self up?
        cur.execute(sql)

        layers = []
        for row in cur.fetchall():
            layers.append(row[0])

        return layers

    def layerStats(self, layer, **tile_filter):
        """
        Statistics for LAYER (a keyed list)

        TILE_FILTER optionally restricts the query by bounds, since_verison etc"""

        sql = "SELECT count(*), min(zoom_level), max(zoom_level) FROM myw_tiles WHERE id = '{}'"
        sql = self.addFilters(sql, layer, tile_filter)
        res = self.executeSql(sql, layer)

        return {"count": res[0], "min_zoom": res[1], "max_zoom": res[2]}

    def levelStats(self, layer, zoom, **tile_filter):
        """
        Statistics for level ZOOM of LAYER (a keyed list)

        TILE_FILTER optionally restricts the query by bounds, since_verison etc"""

        sql = "SELECT count(*), min(tile_column), min(tile_row), max(tile_column), max(tile_row) FROM myw_tiles WHERE id = '{}' AND zoom_level = {}"
        sql = self.addFilters(sql, layer, tile_filter)
        res = self.executeSql(sql, layer, zoom)

        # Get tile ID range
        # ENH: Faster to do this all in one call
        stats = {
            "count": res[0],
            "min_x": res[1],
            "min_y": self._flipY(zoom, res[4]),
            "max_x": res[3],
            "max_y": self._flipY(zoom, res[2]),
        }

        return stats

    # ==============================================================================
    #                                   TILE ACCESS
    # ==============================================================================

    def tile(self, layer, zoom, x, y):
        """
        Returns specified tile (or None if not found)

        LAYER is the layer name. ZOOM, X and Y are the Google-format
        address of the tile (i.e. origin top-left)"""

        # Convert to internal address scheme
        y = self._flipY(zoom, y)

        # Find the tile
        cur = self.connection.cursor()

        cur.execute(
            "SELECT tile_data FROM myw_tiles where id = ? and zoom_level = ? and tile_column = ? and tile_row = ?",
            [layer, zoom, x, y],
        )

        res = cur.fetchone()

        if res is None:
            return None

        return res[0]

    def tiles(self, layer, **tile_filter):
        """
        Generator yielding tiles for LAYER

        Yields dict with Google-format elements:
          zoom
          y
          x
          data

        TILE_FILTER optionally restricts the query by bounds, since_verison etc"""

        # Construct query
        sql = "SELECT zoom_level,tile_row,tile_column,tile_data FROM myw_tiles WHERE id = '{}'"
        sql = self.addFilters(sql, layer, tile_filter)

        # Yield values
        for rec in self.selectQuery(sql, layer):
            zoom = rec[0]

            yield {"zoom": rec[0], "y": self._flipY(zoom, rec[1]), "x": rec[2], "data": rec[3]}

    # ==============================================================================
    #                                HELPERS
    # ==============================================================================

    def addFilters(self, sql, layer, tile_filter):
        """
        Add select filters to SQL if requested
        """

        for key, val in list(tile_filter.items()):
            if val == None:
                continue

            if key == "since_version":
                sql = self.addTransactionFilter(sql, val)

            elif key == "bounds":
                sql = self.addBoundsFilter(sql, layer, val, tile_filter.get("since_version"))

            elif key == "clip":
                pass

            else:
                raise Exception("Bad filter key: " + key)  # Internal error

        return sql

    def addTransactionFilter(self, sql, since_version):
        """
        Add version filter to string SQL, if requested
        """

        sql += " AND version >" + str(since_version)

        return sql

    def addBoundsFilter(self, sql, layer, bounds, since_version=None):
        """
        Add the 'where' clause for finding the tiles of LAYER in BOUNDS

        BOUNDS is a (min,max) pair of tuples in WGS84 long/lat degrees"""

        selects = []
        for zoom, tile_id_range in self._tileIdRangesFor(layer, bounds, since_version):

            level_select = "(zoom_level = {} AND tile_column >= {} AND tile_row >= {} AND tile_column <= {} AND tile_row <= {})".format(
                zoom,
                tile_id_range[0][0],
                self._flipY(zoom, tile_id_range[1][1]),  # Converts Google Tile ID to TMS
                tile_id_range[1][0],
                self._flipY(zoom, tile_id_range[0][1]),
            )  # Converts Google Tile ID to TMS

            selects.append(level_select)

        if selects:
            sql += " AND ({})".format(" OR ".join(selects))

        return sql

    def layer(self):
        """
        Returns the layer this tilestore represents. If a tilestore contains more than
        one layer then the result will be any one of those layers.
        """

        res = self.executeSql("SELECT id FROM myw_tiles")

        return res[0]

    # ==============================================================================
    #                                   OPERATIONS
    # ==============================================================================

    def ensureSchema(self):
        """
        Ensure self's file contains the most recent schema (upgrading if necessary)
        """

        self.__runTileLoader(self.filename, "ensure_schema")

    def loadFromTree(
        self, filepath, layer, format, compress, skip_empty, min_zoom=None, max_zoom=None
    ):
        """
        Load tiles from directory tree FILEPATH
        """
        skip_mt_str = "yes" if skip_empty else "no"
        z_levels = ":"
        if max_zoom != None:
            z_levels = z_levels + str(max_zoom)
        if min_zoom != None:
            z_levels = str(min_zoom) + z_levels
        return self.__runTileLoader(
            self.filename, "load_tree", filepath, format, layer, compress, skip_mt_str, z_levels
        )

    def loadFromDB(
        self,
        tile_db,
        layer="",
        compress=False,
        skip_empty=None,
        clip=True,
        use_index=False,
        skip_unchanged=False,
        min_zoom=None,
        max_zoom=None,
        **tile_filter,
    ):
        """
        Load tile records from another database
        """

        # Unpick tile filter
        since_version = -1
        bounds = "-"

        for key, val in list(tile_filter.items()):
            if val == None:
                continue

            if key == "since_version":
                since_version = val

            elif key == "bounds":
                bounds = "{},{},{},{}".format(val[0][0], val[0][1], val[1][0], val[1][1])

            else:
                raise Exception("Bad filter key: " + key)  # Internal error

        # Convert arguments into the format for the Java process
        clip_str = "yes" if clip else "no"
        comp_str = "yes" if compress else "no"
        skip_mt_str = "yes" if skip_empty else "no"
        skip_unchg = "yes" if skip_unchanged else "no"
        use_idx_str = "yes" if use_index else "no"

        z_levels = ":"
        if max_zoom != None:
            z_levels = z_levels + str(max_zoom)
        if min_zoom != None:
            z_levels = str(min_zoom) + z_levels

        # Run command
        return self.__runTileLoader(
            self.filename,
            "load_db",
            tile_db.filename,
            tile_db.type,
            layer,
            comp_str,
            skip_mt_str,
            since_version,
            bounds,
            clip_str,
            use_idx_str,
            skip_unchg,
            z_levels,
        )

    def __runTileLoader(self, *args):
        """
        Run the Java tileloader engine with ARGS

        See TileLoader.java for supported values for ARGS"""

        # (?)Filter for counting tiles
        # ENH: Support pass in proc to os_engine
        filter = "^System:TileCount"

        def filter_tile_count(line):
            if re.match(filter, line) == None:
                return 0
            else:
                return 4

        # Set verbosity
        if hasattr(self.progress, "level"):
            tile_loader_verbosity = (self.progress.level - self.progress.op_level) + 1
        else:
            tile_loader_verbosity = 1

        # Construct command line to run the java util
        cmd = ["java", "TileLoader"]

        cmd.append(str(tile_loader_verbosity))

        for arg in args:
            cmd.append(str(arg))

        # Launch the command
        os_eng = MywOsEngine(self.progress)
        output = os_eng.run(
            *cmd, log_output_level=0, log_command_level=4, use_pipes=True, filter=filter_tile_count
        )

        # Get number of tiles loaded
        n_tiles = 0
        for line in output.split("\n"):
            if re.match(filter, line):
                n_tiles = int(line.split()[1])

        return n_tiles

    def importTiles(
        self,
        server_type,
        server_url,
        server_username,
        server_password,
        server_layer,
        layer,
        bounds,
        z_min,
        z_max,
    ):
        """
        Load tile records from an external server

        SERVER_TYPE is 'OGC' or 'ESRI'. SERVER_LAYER is the name of
        the WMS layer or Esri map. LAYER is the layer name for the
        tiles. BOUNDS is a pair of (?)WGS84 long/lat coords."""

        bounds_arg = (
            str(bounds[0][0])
            + ","
            + str(bounds[0][1])
            + ","
            + str(bounds[1][0])
            + ","
            + str(bounds[1][1])
        )

        # Set verbosity
        if hasattr(self.progress, "level"):
            verbosity = (self.progress.level - self.progress.op_level) - 1
        else:
            verbosity = 1

        # Construct command line to run the java util
        cmd = [
            "java",
            "TileImporter",
            self.filename,
            server_type,
            server_url,
            server_username,
            server_password,
            server_layer,
            layer,
            str(z_min),
            str(z_max),
            bounds_arg,
            str(verbosity),
        ]

        # Run it
        os_eng = MywOsEngine(self.progress)
        output = os_eng.run(*cmd, use_pipes=True)

        # ENH: Get number of tiles imported

    def renameLayer(self, layer, new_name):
        """
        Rename all tiles in given layer
        """

        # Get number of records we are about to change
        n_recs = self.scalarQuery("SELECT count(*) FROM myw_tiles WHERE id = '{}'", layer)

        # Do the rename
        self.executeSql("UPDATE myw_tiles SET ID = '{}' WHERE ID = '{}'", new_name, layer)

        # If necessary, update the meta data
        if self.schemaVersion() > 4:
            self.executeSql("UPDATE myw_layers SET ID = '{}' WHERE ID = '{}'", new_name, layer)

        self.commit()

        return n_recs

    def deleteLayer(self, layer):
        """
        Delete all tiles in given layer
        """

        # Get number of records we are about to change
        n_recs = self.scalarQuery("SELECT count(*) FROM myw_tiles WHERE id = '{}'", layer)

        # Do the delete
        self.executeSql("DELETE FROM myw_tiles WHERE ID = '{}'", layer)

        # If necessary, update the meta data
        if self.schemaVersion() > 4:
            self.executeSql("DELETE FROM myw_layers WHERE ID = '{}'", layer)

        self.commit()

        return n_recs

    def updateLayerData(self):
        """
        manage the layer meta-data table

        """
        real_layers = self.layers(reeval=True)
        # delete ALL the records (table may contain records for layers that no longer have any tiles)
        self.executeSql("DELETE FROM myw_layers")
        # Insert new ones
        for layer in real_layers:
            stats = self.layerStats(layer)
            self.executeSql(
                "INSERT INTO myw_layers (id, min_zoom_level, max_zoom_level) VALUES ('{}',{},{})",
                layer,
                stats["min_zoom"],
                stats["max_zoom"],
            )

        self.commit()

    # ==============================================================================
    #                                CHECKPOINTS
    # ==============================================================================

    def setCheckpoint(self, name, version=None):
        """
        Create or reposition checkpoint NAME to current disk version

        If optional version is supplied, reposition at that version"""

        if version == None:
            version = self.versionStamp("data")
            self.setVersionStamp("data", version + 1)

        self.executeSql(
            "INSERT or REPLACE INTO myw_checkpoint (name,version) VALUES ('{}',{})", name, version
        )

        return version

    def deleteCheckpoint(self, name):
        """
        Remove a checkpoint
        """

        self.executeSql("DELETE FROM myw_checkpoint WHERE name='{}'", name)

    def checkpoints(self):
        """
        Names of checkpoints in self (in name order)
        """

        if self.hasTable("myw_checkpoint"):

            cur = self.connection.cursor()  # TODO: Should clean self up?
            cur.execute("SELECT name, version, date FROM myw_checkpoint ORDER BY name")

            for rec in cur.fetchall():
                yield rec[0]

    def checkpointRec(self, name):
        """
        Yields checkpoint object (if there is one)
        """

        rec = self.executeSql("SELECT version, date FROM myw_checkpoint WHERE name='{}'", name)

        if not rec:
            return None

        return {"name": name, "version": rec[0], "date": rec[1]}

    def hasChangesSince(self, version):
        """
        True if any record in self has been changed since VERSION
        """

        res = self.executeSql("SELECT 1 FROM myw_tiles WHERE version > '{}' LIMIT 1", version)

        return res != None

    # ==============================================================================
    #                                  VERSION STAMPS
    # ==============================================================================

    def versionStamp(self, component):
        """
        Value for version stamp COMPONENT (if any)
        """

        return self.scalarQuery(
            "SELECT version FROM myw_version_stamp WHERE component = '{}'", component
        )

    def setVersionStamp(self, component, version):
        """
        Set, update or delete a version stamp
        """

        if version != None:
            self.executeSql(
                "INSERT or REPLACE INTO myw_version_stamp (component,version) VALUES ('{}',{})",
                component,
                version,
            )  # TODO: Set timestamp
        else:
            self.executeSql("DELETE FROM myw_version_stamp WHERE component='{}'", component)

    def versionStampRecs(self):
        """
        Yields version stamp objects
        """

        if self.hasTable("myw_version_stamp"):

            cur = self.connection.cursor()  # TODO: Should clean self up?
            cur.execute("SELECT component, version, date FROM myw_version_stamp ORDER BY component")

            for rec in cur.fetchall():
                yield {"component": rec[0], "version": rec[1], "date": rec[2]}

        else:
            yield {"component": "schema", "version": self.schemaVersion(), "date": None}

    def dataVersionFor(self, name, error_if_none=True):
        """
        Data version for NAME (if there is one)

        NAME is a checkpoint name or string representation of a version stamp"""

        # ENH: Better on myw_tilestore command?

        version = None

        # Try checkpoint
        cp_rec = self.checkpointRec(name)
        if cp_rec:
            version = cp_rec["version"]

        # If not found, try version id
        else:
            try:
                version = int(name)
            except ValueError:
                pass

        # Check for not found
        if error_if_none and (version is None):
            msg = "{}: No such checkpoint or version: {}".format(self.basename(), name)
            raise MywError(msg)

        return version
