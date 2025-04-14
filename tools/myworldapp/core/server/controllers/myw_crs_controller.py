################################################################################
# Controller for fetching stored CRS definitions
################################################################################
# Copyright: IQGeo Limited 2010-2023

import re
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywCRSController(MywController):
    """
    Controller for fetching stored CRS information
    """

    @view_config(route_name="myw_crs_controller.list", request_method="GET", renderer="json")
    def list(self):
        """
        Get settings for supported CRS defintions, stored in myw_coord_system
        """
        self.current_user.assertAuthorized(self.request)

        crs = MywCoordSystem.getSridDefs()
        return {"keys": [key for key in crs.keys()]}

    @view_config(route_name="myw_crs_controller.get", request_method="GET", renderer="json")
    def get(self):
        """
        Gets the definition of a specified CRS
        """
        crs = self.request.matchdict["crs"]

        self.current_user.assertAuthorized(self.request)
        match = re.match("(EPSG:)?(\d+)", crs)
        if match is None:
            raise exc.HTTPBadRequest("Invalid CRS format:" + crs)

        crs = int(match.group(2))
        return MywCoordSystem.getCRSDef(crs)
