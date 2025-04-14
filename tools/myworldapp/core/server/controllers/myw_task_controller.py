################################################################################
# Controller for myw.configuration_task
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.myw_configuration_task import MywConfigurationTask

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywTaskController(MywController):
    """
    Controller for accessing myw.configuration_task
    """

    @view_config(route_name="myw_task_controller.get", request_method="GET", renderer="json")
    def get(self):
        """
        Gets the status of configuration task ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, application="config")

        task_rec = Session.query(MywConfigurationTask).get(id)

        if task_rec:
            return {"query": {"id": task_rec.id, "status": task_rec.status}}
        else:
            return {"query": None}
