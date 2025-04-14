################################################################################
# Controller for tile requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# General imports
import os
import pyramid.httpexceptions as exc

from pyramid.view import view_config
from pyramid.response import Response, FileResponse

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.database.myw_database import MywDatabase

from myworldapp.core.server.controllers.base.myw_controller import MywController

# Create shared tilestore
# ENH: Put database in globals?
TILESTORE = MywDatabase(Session).tilestore()

# Set location of the backstop tile
BACKSTOP_TILE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "resources", "transparent_tile.png")
)


class MywTileController(MywController):
    """
    Controller for tile access requests
    """

    @view_config(route_name="myw_tile_controller.get_tile", request_method="GET")
    def get_tile(self):
        """
        Entry point from the routing table.

        UNIVERSE is usually 'geo' or 'int'. ZOOM, X and Y are the
        Google-format address of the tile (i.e. origin top-left)."""
        universe = self.request.matchdict["universe"]
        layer_or_world = self.request.matchdict["layer_or_world"]
        zoom = self.request.matchdict["zoom"]
        x = self.request.matchdict["x"]
        y = self.request.matchdict["y"]
        format = self.request.matchdict["format"]
        vectorFormats = ["mvt", "topojson"]

        # Check user is authorised to access the data
        if universe == "geo":
            self.current_user.assertAuthorized(
                self.request, tile_layer=layer_or_world, ignore_csrf=True
            )
        else:
            self.current_user.assertAuthorized(self.request, tile_layer=universe, ignore_csrf=True)

        # Get tile data from tilestore
        tile = self._get_tile(universe, layer_or_world, int(zoom), int(x), int(y))

        # Build response
        if tile is None:
            if format in vectorFormats:
                # return 404
                raise exc.HTTPNotFound()
            else:
                # return empty/transparent tile
                return FileResponse(BACKSTOP_TILE_PATH)

        response = Response()
        response.body = bytes(tile)
        response.content_length = len(tile)
        if format == "mvt":
            response.content_type = "application/vnd.mapbox-vector-tile"
            response.content_encoding = "gzip"
        elif format == "topojson":
            response.content_type = "application/json"
            response.content_encoding = "gzip"
        else:
            # assume png for backwards compatibility
            response.content_type = "image/png"

        return response

    def _get_tile(self, universe, layer_or_world, zoom, x, y):
        """
        Entry point from tests
        """

        full_world = universe + "/" + layer_or_world

        return TILESTORE.get_tile(full_world, zoom, x, y)
