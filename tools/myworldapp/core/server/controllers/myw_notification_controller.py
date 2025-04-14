################################################################################
# Controller for myw.notification
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.myw_notification import MywNotification
from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywNotificationController(MywController):
    """
    Controller for accessing myw.notification
    """

    # ==============================================================================
    #                                CONFIG ACTIONS
    # ==============================================================================

    @view_config(
        route_name="myw_notification_controller.no_id", request_method="GET", renderer="json"
    )
    def all(self):
        """
        Get all notifications
        """

        self.current_user.assertAuthorized(self.request, right="manageNotifications")

        query = Session.query(MywNotification)
        defs = []
        for rec in query:
            defs.append(rec.definition())

        return {"notifications": defs}

    @view_config(
        route_name="myw_notification_controller.with_id", request_method="GET", renderer="json"
    )
    def get(self):
        """
        Get record with key ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageNotifications")

        rec = Session.query(MywNotification).get(id)

        if not rec:
            raise exc.HTTPNotFound()

        return rec.definition()

    @view_config(
        route_name="myw_notification_controller.no_id", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Add a new record
        """

        self.current_user.assertAuthorized(self.request, right="manageNotifications")

        # Unpick request
        props = json.loads(self.request.body)

        # Create record (and allocate id)
        rec = MywNotification(
            type=props["type"],
            subject=props["subject"],
            details=props.get("details"),
            for_online_app=props.get("for_online_app", True),
            for_native_app=props.get("for_native_app", True),
        )

        Session.add(rec)
        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_notification_controller.with_id", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update properties of notification ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageNotifications")

        # Unpick request
        props = json.loads(self.request.body)

        # Find record
        rec = Session.query(MywNotification).get(id)
        if not rec:
            raise exc.HTTPNotFound()

        # Update record
        rec.setFields(props, skip=["truncated_details"])  # ENH: Fix JS and remove the skip

        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_notification_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete notification ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageNotifications")

        # Find record
        rec = Session.query(MywNotification).get(id)
        if not rec:
            raise exc.HTTPNotFound()

        # Delete it
        Session.delete(rec)
        Session.commit()

        return {"id": id}

    # ==============================================================================
    #                                CLIENT ACTIONS
    # ==============================================================================

    @view_config(
        route_name="myw_notification_controller.index", request_method="GET", renderer="json"
    )
    def index(self):
        """
        Notifications for current user (in id order)
        """

        self.current_user.assertAuthorized(self.request)

        # Unpick params
        since_id = self.request.params.get("since", 0)
        for_online_app = self.request.params.get("for", "online_app") == "online_app"

        # Build query
        query = Session.query(MywNotification).filter(MywNotification.id > since_id)

        if for_online_app:
            query = query.filter(MywNotification.for_online_app == True)
        else:
            query = query.filter(MywNotification.for_native_app == True)

        # Contruct result
        defs = []
        for rec in query:
            defs.append(rec.definition())

        return {"notifications": defs}
