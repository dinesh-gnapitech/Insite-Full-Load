################################################################################
# Controller for replica metadata access
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_replica import MywReplica

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywReplicaController(MywController):
    """
    Controller for accessing myw.replica
    """

    @view_config(route_name="myw_replica_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        return all records
        """
        self.current_user.assertAuthorized(self.request, application="config")

        replicas = []
        for rec in Session.query(MywReplica).order_by(MywReplica.registered):
            replicas.append(rec.definition())

        return {"replicas": replicas}

    @view_config(route_name="myw_replica_controller.show", request_method="GET", renderer="json")
    def show(self):
        """
        GET /id: Show a specific record
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, application="config")

        rec = Session.query(MywReplica).filter(MywReplica.id == id).first()

        if rec:
            return rec.definition()
        else:
            raise exc.HTTPNotFound()
