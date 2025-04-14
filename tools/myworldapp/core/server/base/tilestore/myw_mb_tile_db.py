################################################################################
# A Mapbox Tiles format sqlite tile file
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os
from myworldapp.core.server.base.core.myw_error import MywError
from .myw_tile_db_mixin import MywTileDBMixin


class MywMBTileDB(MywTileDBMixin):
    """
    A Maxbox Tiles format sqlite tile database (readonly)

    Supports a single layer per file. See http://www.mapbox.com/developers/mbtiles/"""

    # ==============================================================================
    #                                  CREATION
    # ==============================================================================

    def __init__(self, filename, mode, progress=None):
        """
        Initialise self
        """

        if mode != "r":
            raise MywError("Update of MB tiles format not supported")

        # Init super
        super(MywMBTileDB, self).__init__(filename, mode, progress)

        # Init self
        self.type = "mb_tile"
        self.layer = "geo/{}".format(os.path.splitext(os.path.basename(filename))[0])

    # ==============================================================================
    #                                  PROPERTIES
    # ==============================================================================

    def format(self):
        """
        String used to identify self's format in GUI
        """

        return self.type

    def schemaVersion(self):
        """
        Schema version (always 0 for MB Tiles)
        """

        return 0

    def versionStampRecs(self):
        """
        Yields version stamp objects
        """

        yield {"component": "schema", "version": self.schemaVersion()}

    def checkpoints(self):
        """
        Yields names of checkpoints
        """

        return []

    # ==============================================================================
    #                                      STATS
    # ==============================================================================

    def layers(self):
        """
        The names of the layers in self
        """

        return [self.layer]

    def layerStats(self, layer, **tile_filter):
        """
        Statistics for LAYER (a keyed list)

        TILE_FILTER optionally restricts the query by bounds, since_verison etc"""

        if layer == self.layer:
            sql = "SELECT count(*), min(zoom_level), max(zoom_level) FROM tiles WHERE 1 = 1"
            sql = self.addFilters(sql, layer, tile_filter)
            res = self.executeSql(sql)
        else:
            res = (0, None, None)

        return {"count": res[0], "min_zoom": res[1], "max_zoom": res[2]}

    def levelStats(self, layer, zoom, **tile_filter):
        """
        Statistics for level ZOOM of LAYER (a keyed list)

        TILE_FILTER optionally restricts the query by bounds, since_verison etc"""

        # Run query
        if layer == self.layer:
            sql = "SELECT count(*), min(tile_column), min(tile_row), max(tile_column), max(tile_row) FROM tiles WHERE zoom_level = {}"
            sql = self.addFilters(sql, layer, tile_filter)
            res = self.executeSql(sql, zoom)
        else:
            res = (0, None, None, None, None)

        # Build result
        stats = {
            "count": res[0],
            "min_x": res[1],
            "min_y": self._flipY(zoom, res[4]),  # Converts internal tile ID to Google
            "max_x": res[3],
            "max_y": self._flipY(zoom, res[2]),  # Converts internal tile ID to Google
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

        # Convert Google tile ID to internal
        y = self._flipY(zoom, y)

        # Find the tile
        cur = self.connection.cursor()

        cur.execute(
            "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?",
            (zoom, x, y),
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

        # Check for layer not in self
        if layer != self.layer:
            return

        # Construct query
        sql = "SELECT zoom_level,tile_row,tile_column,tile_data FROM tiles WHERE 1 = 1"
        sql = self.addFilters(sql, layer, tile_filter)

        # Yield values
        for rec in self.selectQuery(sql, layer):
            zoom = rec[0]

            yield {
                "zoom": rec[0],
                "y": self._flipY(zoom, rec[1]),  # Converts internal tile ID to Google
                "x": rec[2],
                "data": rec[3],
            }

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

            else:
                raise Exception("Bad key: " + key)  # Internal error

        return sql

    def addTransactionFilter(self, sql, since_version):
        """
        Add version filter to string SQL, if requested
        """

        if since_version != -1:
            raise MywError("MB tiles format does not support change tracking")

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
                self._flipY(zoom, tile_id_range[1][1]),  # Converts Google tile ID to TMS
                tile_id_range[1][0],
                self._flipY(zoom, tile_id_range[0][1]),
            )  # Converts Google tile ID to TMS

            selects.append(level_select)

        if selects:
            cond = " OR ".join(selects)
            sql += " AND ({})".format(cond)

        return sql

    # ==============================================================================
    #                                   OPERATIONS
    # ==============================================================================

    def renameLayer(self, layer, new_name):
        """
        Rename all tiles in given layer
        """

        raise MywError("MB tiles format does not support layer renaming")

    def deleteLayer(self, layer):
        """
        Delete all tiles in given layer
        """

        if layer != self.layer:
            return 0

        cur = self.connection.cursor()  # TODO: Should clean this up?

        # Get number of records we are about to change
        sql = "SELECT count(*) FROM tiles"
        cur.execute(sql)
        n_recs = cur.fetchone()[0]

        # Do the delete
        sql = "DELETE FROM tiles"
        cur.execute(sql)
        self.connection.commit()

        return n_recs

    # ==============================================================================
    #                                CHANGE DETECTION
    # ==============================================================================

    def dataVersionFor(self, checkpoint_name, error_if_none=True):
        """
        Rename all tiles in given layer
        """

        raise MywError("MB tiles format does not support change tracking")
