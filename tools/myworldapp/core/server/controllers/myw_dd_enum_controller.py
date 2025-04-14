#################################################################################
# Controller for enumerator config requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_dd_enum import MywDDEnum

from myworldapp.core.server.controllers.base.myw_controller import MywController

import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywDDEnumController(MywController):
    """
    Controller for enumerator definition operations
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        MywController.__init__(self, request)
        self.dd = myw_globals.dd

    @view_config(route_name="myw_dd_enum_controller.no_name", request_method="GET", renderer="json")
    def index(self):
        """
        return enumerators information
        """

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # Also used in features editing

        enums = []
        for rec in Session.query(MywDDEnum):
            enums.append(rec.definition())

        return {"enumerators": enums}

    @view_config(
        route_name="myw_dd_enum_controller.with_name", request_method="GET", renderer="json"
    )
    def get(self):
        """
        return enumerator information
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="managePickLists")

        queryQuery = Session.query(MywDDEnum).filter(MywDDEnum.name == name)

        rec = queryQuery.first()

        return rec.definition()

    @view_config(
        route_name="myw_dd_enum_controller.no_name", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Create a new enumerator
        """

        self.current_user.assertAuthorized(self.request, right="managePickLists")

        props = json.loads(self.request.body)

        # Check if enumerator with the same name exists
        if self.dd.enumeratorRec(props["name"]):
            raise exc.HTTPConflict()

        rec = self.dd.createEnumerator(props["name"], props.get("description", ""), props["values"])

        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_dd_enum_controller.with_name", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update an existing enumerator
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="managePickLists")

        props = json.loads(self.request.body)

        rec = self.dd.updateEnumerator(name, props["description"], props["values"])

        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_dd_enum_controller.with_name", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete an existing enumerator
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="managePickLists")

        self.dd.dropEnumerator(name)
        Session.commit()

        return {"enumerator": name}
