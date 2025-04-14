################################################################################
# Controller for application setting requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json

from pyramid.view import view_config
import pyramid.httpexceptions as exc
from pyramid.httpexceptions import HTTPConflict

from myworldapp.core.server.models.myw_setting import MywSetting
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.controllers.base.myw_controller import MywController

import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywSettingController(MywController):
    """
    Controller for accessing myw.setting
    """

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        self.dd = myw_globals.dd

    @view_config(route_name="myw_setting_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        return application details
        """

        self.current_user.assertAuthorized(self.request)

        query = Session.query(MywSetting)
        settings = []
        for setting in query:
            settings.append(setting.definition())

        return {"settings": settings}

    @view_config(route_name="myw_setting_controller.no_id", request_method="GET", renderer="json")
    def no_id(self):
        """
        return application details
        """

        self.current_user.assertAuthorized(self.request, right="manageSettings")

        query = Session.query(MywSetting)
        settings = []
        for setting in query:
            settings.append(setting.definition())

        return {"settings": settings}

    @view_config(route_name="myw_setting_controller.with_id", request_method="GET", renderer="json")
    def get(self):
        """
        Get record with key ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # Can't require manageSettings here else language can't be loaded

        rec = Session.query(MywSetting).get(id)

        if not rec:
            raise exc.HTTPNotFound()

        return rec.definition()

    @view_config(route_name="myw_setting_controller.no_id", request_method="POST", renderer="json")
    def create(self):
        """
        Create a new feature.
        """
        self.current_user.assertAuthorized(self.request, right="manageSettings")

        # Unpick request
        props = json.loads(self.request.body)

        # Check for duplicate name
        if Session.query(MywSetting).filter(MywSetting.name == props["name"]).first():
            raise HTTPConflict()

        # Create record
        rec = MywSetting(name=props["name"], type=props["type"], value=props["value"])
        Session.add(rec)
        Session.flush()

        Session.commit()
        self.dd.checkLanguageSettings(id)

        return rec.definition()

    @view_config(route_name="myw_setting_controller.with_id", request_method="PUT", renderer="json")
    def update(self):
        """
        PUT /id: Update an existing setting.
        """
        id = self.request.matchdict["id"]
        self.current_user.assertAuthorized(self.request, right="manageSettings")

        # Unpick request
        props = json.loads(self.request.body)

        # Get record to update
        rec = Session.query(MywSetting).get(id)

        # Update it
        rec["type"] = props["type"]
        rec["value"] = props["value"]

        Session.commit()
        self.dd.checkLanguageSettings(id)

        return rec.definition()

    @view_config(
        route_name="myw_setting_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete an existing feature
        """
        id = self.request.matchdict["id"]
        self.current_user.assertAuthorized(self.request, right="manageSettings")

        rec = Session.query(MywSetting).filter(MywSetting.name == id).first()

        if not rec:
            raise exc.HTTPNotFound()

        Session.delete(rec)
        Session.commit()
        self.dd.checkLanguageSettings(id)

        return {"name": id}
