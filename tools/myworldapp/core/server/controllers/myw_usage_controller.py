################################################################################
# Controller for usage history requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from datetime import datetime
import json

from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_usage import MywUsage
from myworldapp.core.server.models.myw_usage_item import MywUsageItem

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywUsageController(MywController):
    """
    Controller for myw.usage
    """

    @view_config(route_name="myw_usage_controller.settings", request_method="GET", renderer="json")
    def settings(self):
        """
        Get settings from myworldapp.ini
        """
        self.current_user.assertAuthorized(self.request)

        settings = self.request.registry.settings
        ini_settings = settings.get("myw.stats.options", {})

        if not ini_settings:
            return {"active": False}

        return {
            "active": True,
            "level": ini_settings.get("level", 1),
            "update_interval_mins": ini_settings.get("update_interval_mins", 5),
            "resolution_hours": ini_settings.get("resolution_hours", 24),
        }

    @view_config(route_name="myw_usage_controller.create", request_method="POST", renderer="json")
    def create(self):
        """
        Create a new usage record
        """
        self.current_user.assertAuthorized(self.request)

        time_now = datetime.now()  # ENH: Timezone as .ini option?
        props = json.loads(self.request.body)

        rec = MywUsage(
            username=self.current_user.name(),
            client=props.get("client"),
            start_time=time_now,
            end_time=time_now,
        )
        Session.add(rec)
        Session.commit()

        return rec.definition()  # ENH: Just return the ID

    @view_config(route_name="myw_usage_controller.update", request_method="PUT", renderer="json")
    def update(self):
        """
        Update action items for usage record ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)

        time_now = datetime.now()

        # Unpick args
        actions = json.loads(self.request.body)  # List of action lists, keyed by application name

        # Get session record
        session_rec = Session.query(MywUsage).get(id)
        if not session_rec:
            raise exc.HTTPNotFound()

        # Get existing actions
        action_recs = {}
        for rec in session_rec.item_recs.all():
            action_recs[(rec.application_name, rec.action)] = rec

        # Update them
        # ENH: Move to model
        for application_name, action_list in list(actions.items()):

            for action, count in list(action_list.items()):
                key = (application_name, action)
                item = action_recs.get(key)

                if not item:
                    item = MywUsageItem(
                        usage_id=id, application_name=application_name, action=action
                    )
                    Session.add(item)

                item.count = count

        # Update end of session
        session_rec.end_time = time_now

        Session.commit()

        return {}  # ENH: Return nothing?
