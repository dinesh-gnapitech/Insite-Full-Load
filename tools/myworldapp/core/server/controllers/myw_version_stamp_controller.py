################################################################################
# Controller for myw.version_stamp
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_version_stamp import MywVersionStamp

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywVersionStampController(MywController):
    """
    Controller for accessing myw.version_stamp
    """

    @view_config(
        route_name="myw_version_stamp_controller.index", request_method="GET", renderer="json"
    )
    def index(self):
        """
        return all records
        """
        self.current_user.assertAuthorized(self.request)

        recs = Session.query(MywVersionStamp).all()

        return {"version_stamps": [rec.definition() for rec in recs]}
