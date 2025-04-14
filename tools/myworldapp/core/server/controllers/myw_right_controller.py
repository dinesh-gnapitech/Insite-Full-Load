################################################################################
# Controller for myw.right object
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config

from myworldapp.core.server.models.myw_right import MywRight
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywRightController(MywController):
    """
    Controller for accessing myw.right
    """

    @view_config(route_name="myw_right_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        return rights information
        """

        # Abort if the user is not an admin
        self.current_user.assertAuthorized(self.request, application="config")

        rights = []
        for right in Session.query(MywRight):
            rights.append(right.definition())

        return {"rights": rights}
