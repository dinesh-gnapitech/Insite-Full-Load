################################################################################
# A myWorld format sqlite tile file
################################################################################
# Copyright: IQGeo Limited 2010-2023

# General imports
import os
from myworldapp.core.server.startup.myw_python_mods import injectsqlite3dll

injectsqlite3dll()
import sqlcipher3
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from .globalmaptiles import GlobalMercator


class MywTileDBMixin:
    """Abstract superclass for random access tile files

    A tile DB presents an API for accessing tile data via
    Google-format tile IDs (that is, origin top left)

    Subclasses must implement:
      .format()
      .schemaVersion()
      .layers()
      .layerStats(layer,**tile_filter)
      .levelStats(layer,**tile_filter)
      .tiles(layer,**tile_filter)
      .tile(layer,zoom,x,y)"""

    # ==============================================================================
    #                              CONNECTION MANAGEMENT
    # ==============================================================================

    def __init__(self, filename, mode, progress=MywSimpleProgressHandler(1)):
        """
        Initialise self
        """

        self.filename = filename
        self.mode = mode
        self.progress = progress

        self._openConnection(filename, mode)

    def _openConnection(self, filename, mode):
        """
        Open SQLITE file

        MODE is one of:
         r  Readonly (file must exist)
         u  Update (file must exist)
         w  Write (file created if doesn't exist, updated if it does)

        Stores connection in self.connection"""

        # Avoid creating files (sqlite creates them automatically)
        if mode in "ru" and not os.path.exists(filename):
            raise MywError("Cannot open file: " + filename)

        opt_str = ""
        if mode == "r":
            opt_str = "?mode=ro"

        # Open file
        try:
            self.connection = sqlcipher3.connect(
                f"file:{filename}{opt_str}", uri=True, check_same_thread=False
            )

        except Exception as cond:
            msg = "File {}: {}".format(filename, cond)
            raise MywError(msg)

    def close(self):
        """
        Close the connection
        """
        # ENH: Better as dispose?

        self.commit()
        self.connection.close()

    def hasTable(self, table_name):
        """
        True if self contains a table table_name
        """

        res = self.executeSql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='{}'", table_name
        )

        return res != None

    def scalarQuery(self, sql_str, *params):
        """
        Run a query that returns a single value
        """

        res = self.executeSql(sql_str, *params)

        if res == None:
            return None

        return res[0]

    def executeSql(self, sql_str, *params):
        """
        Run a query that returns a single result
        """

        try:
            sql = str(sql_str).format(*params)

            cur = self.connection.cursor()
            cur.execute(sql)

        except Exception as cond:
            msg = "File {}: {}".format(self.filename, cond)
            raise MywError(msg)

        return cur.fetchone()

    def selectQuery(self, sql_str, *params):
        """
        Run a select query and yield its results
        """

        cur = self.connection.cursor()

        # Construct query
        sql = str(sql_str).format(*params)
        cur.execute(sql)

        # Yield values (avoiding memory errors for large queries)
        # Note: On windows at least, .fetchall() gets all records into memory first :-(
        while True:
            recs = cur.fetchmany()

            if not recs:
                break

            for rec in recs:
                yield rec

    def commit(self):
        """
        Commit any pending changes (retrying if necessary)
        """

        retry_wait = 100  # Milliseconds
        n_retries = 0

        while True:

            # Try to commit
            try:
                self.connection.commit()
                return

            # If database locked .. wait and retry
            except sqlcipher3.OperationalError as cond:

                print(cond.message)

                if cond.message != "database is locked":
                    raise Exception(cond)

                # time.sleep( retry_wait/1000.0 )
                n_retries += 1

                # if (n_retries % 5) == 0:
                self.progress(1, "Waiting for lock on", self.filename, "...")

    # ==============================================================================
    #                                      STATS
    # ==============================================================================

    def geoLevelStatsFor(self, zoom, stats):
        """
        Compute geographic bounds from level statistics STATS

        STATS contains Google-format tile-id bounds (see levelStats())"""

        if stats["count"] > 0:
            tile_id_bounds = ((stats["min_x"], stats["min_y"]), (stats["max_x"], stats["max_y"]))
            geo_bounds = self.geoBoundsFor(zoom, tile_id_bounds)
        else:
            geo_bounds = (None, None, None, None)

        stats["min_x"] = geo_bounds[0][0]
        stats["min_y"] = geo_bounds[0][1]
        stats["max_x"] = geo_bounds[1][0]
        stats["max_y"] = geo_bounds[1][1]

        return stats

    # ==============================================================================
    #                                   TILE ACCESS
    # ==============================================================================

    def _flipY(self, zoom, y):
        """
        Convert between Google-format and TMS-format tile IDs
        """

        if y == None:
            return None

        return (2**zoom - 1) - y

    def _tileIdRangesFor(self, layer, bounds, since_version=None):
        """
        Yields the Google-format tile ID ranges to select LAYER

        BOUNDS is a pair of coords in WGS84 long/lat decimal degrees"""

        # Find range of zoom levels
        # Note: Can't use bounds here .. causes infinite recursion
        stats = self.layerStats(layer, since_version=since_version)
        min_zoom = stats["min_zoom"]
        max_zoom = stats["max_zoom"]

        # Avoid problems with null zoom range
        if stats["count"] == 0:
            return

        # Yield range for each level
        for zoom in range(min_zoom, max_zoom + 1):
            yield zoom, self._tileIdBoundsFor(bounds, zoom)

    def _tileIdBoundsFor(self, bounds, zoom):
        """
        The Google-format tile ID range covering long/lat area BOUNDS at zoom level ZOOM

        BOUNDS is a pair of coords in WGS84 long/lat decimal degrees"""
        # TODO: Duplicates code with controllers/geojson_tiles

        # ENH: Cache this?
        gm = GlobalMercator()

        # Convert WGS84 bounding box to projected metres
        proj_min = gm.LatLonToMeters(bounds[0][1], bounds[0][0])  # Note: Y,X is correct here
        proj_max = gm.LatLonToMeters(bounds[1][1], bounds[1][0])  # Note: Y,X is correct here

        # Convert projected metres to TMS tile ids
        tms_tile_id_min = gm.MetersToTile(proj_min[0], proj_min[1], zoom)
        tms_tile_id_max = gm.MetersToTile(proj_max[0], proj_max[1], zoom)

        # Convert TMS tile ids to Google tile ids
        tile_id_min = gm.GoogleTile(tms_tile_id_min[0], tms_tile_id_min[1], zoom)
        tile_id_max = gm.GoogleTile(tms_tile_id_max[0], tms_tile_id_max[1], zoom)

        # Ensure min are less than max
        if tile_id_min[0] > tile_id_max[0]:
            tile_id_min, tile_id_max = (tile_id_max[0], tile_id_min[1]), (
                tile_id_min[0],
                tile_id_max[1],
            )
        if tile_id_min[1] > tile_id_max[1]:
            tile_id_min, tile_id_max = (tile_id_min[0], tile_id_max[1]), (
                tile_id_max[0],
                tile_id_min[1],
            )

        return (tile_id_min, tile_id_max)

    def geoBoundsFor(self, zoom, tile_id_range):
        """
        The long/lat range covered by Google-format tile ids TILE_ID_RANGE

        Returns a pair of coords in WGS84 long/lat decimal degrees"""

        tl_tile_bounds = self.geoBoundsForTile(zoom, tile_id_range[0])  # Top-left tile
        br_tile_bounds = self.geoBoundsForTile(zoom, tile_id_range[1])  # Bottom-right tile

        return (
            (tl_tile_bounds[0][0], br_tile_bounds[0][1]),
            (br_tile_bounds[1][0], tl_tile_bounds[1][1]),
        )

    def geoBoundsForTile(self, zoom, tile_id):
        """
        Long/lat bounds for Google-format TILE_ID

        Returns (min_coord,max_coord)"""

        gm = GlobalMercator()

        tms_tile_id = self.tmsIdForTile(zoom, tile_id)
        tile_coords = gm.TileLatLonBounds(
            tms_tile_id[0], tms_tile_id[1], zoom
        )  # Returns lat1,lon1,lat2,lon2

        return ((tile_coords[1], tile_coords[0]), (tile_coords[3], tile_coords[2]))

    def tmsIdForTile(self, zoom, tile_id):
        """
        Convert Google TILE_ID to TMS tile id
        """

        return (tile_id[0], (2**zoom - 1) - tile_id[1])

    # ==============================================================================
    #                                     EXPORT
    # ==============================================================================

    def exportToTree(self, layer, dir, format, verbosity=1, **tile_filter):
        """
        Export tiles for LAYER to myworld directory tree DIR

        TILE_FILTER specifies filtering options (see .tiles())

        Returns number of tiles exported"""

        # ENH: Support other formats

        layer_parts = layer.split("/")

        n_written = 0
        for tile in self.tiles(layer, **tile_filter):
            z = str(tile["zoom"])
            y = str(tile["y"])
            x = str(tile["x"])

            # Build list of directory names
            path_parts = layer_parts[:]
            if format == "myw_tree":
                path_parts += [z, x[0:2], x]
                file_name = "{}_{}_{}.png".format(z, x, y)

            elif format == "zxy_tree":
                path_parts += [z, x]
                file_name = "{}.png".format(y)

            elif format == "zyx_tree":
                path_parts += [z, y]
                file_name = "{}.png".format(x)

            else:
                raise MywError("Bad tree format:", format)

            # Ensure directory exists
            path = dir
            for path_part in path_parts:
                path = os.path.join(path, path_part)
                if not os.path.exists(path):
                    os.mkdir(path)

            # Create file
            path = os.path.join(path, file_name)
            with open(path, "wb") as strm:
                strm.write(tile["data"])

            n_written += 1

        return n_written

    def updateStatistics(self):
        """
        Analyse db and create statistics that optimize index usage
        """

        self.executeSql("ANALYZE")
