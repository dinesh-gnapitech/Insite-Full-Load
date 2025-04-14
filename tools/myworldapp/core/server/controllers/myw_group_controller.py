################################################################################
# Controller for myw.group
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_group import MywGroup
from myworldapp.core.server.models.myw_group_item import MywGroupItem

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywGroupController(MywController):
    """
    Controller for accessing myw.group
    """

    @view_config(route_name="myw_group_controller.get_ids", request_method="GET", renderer="json")
    def get_ids(self):
        """
        IDs of the groups of which current user is the owner or a member
        """

        self.current_user.assertAuthorized(self.request)

        manager_only = self.get_param(self.request, "manager", bool, default=False)

        group_ids = set()

        # Get groups owned by self
        recs = Session.query(MywGroup).filter(MywGroup.owner == self.current_user.name())
        for rec in recs:
            group_ids.add(rec.id)

        # Add those of which self is a member
        recs = Session.query(MywGroupItem).filter(MywGroupItem.username == self.current_user.name())
        if manager_only:
            recs = recs.filter(MywGroupItem.manager == True)
        for rec in recs:
            group_ids.add(rec.group_id)

        return {"group_ids": sorted(group_ids)}

    @view_config(route_name="myw_group_controller.with_id", request_method="GET", renderer="json")
    def get(self):
        """
        Definition of group ID
        """
        # ENH: Prevent read of groups that self is not a member of?
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)

        rec = Session.query(MywGroup).get(id)

        if not rec:
            raise exc.HTTPNotFound()

        return rec.definition()

    @view_config(route_name="myw_group_controller.create", request_method="POST", renderer="json")
    def create(self):
        """
        Create a new group from definition in payload
        """

        self.current_user.assertAuthorized(self.request)  # ENH: Only if have 'editGroup' right

        group_def = json.loads(self.request.body)

        # Create record
        rec = MywGroup(
            owner=self.current_user.name(),
            name=group_def["name"],
            description=group_def.get("description"),
        )

        rec.setId()
        Session.add(rec)
        Session.flush()

        # Add substructure
        rec.setMembers(group_def.get("members", {}))

        Session.commit()

        return rec.definition()

    @view_config(route_name="myw_group_controller.with_id", request_method="PUT", renderer="json")
    def update(self):
        """
        Update group ID from definition in payload
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)  # ENH: Only if have 'editGroup' right

        group_def = json.loads(self.request.body)

        # Get record
        rec = Session.query(MywGroup).get(id)
        if not rec:
            raise exc.HTTPNotFound()

        # Check we are authorised to modify it
        if not rec.isManager(self.current_user.name()):
            raise exc.HTTPForbidden()

        # Set its properties

        rec.setMembers(group_def.pop("members", {}))

        for prop, value in list(group_def.items()):
            rec[prop] = value

        Session.commit()

        return rec.definition()

    @view_config(route_name="myw_group_controller.with_id", request_method="DELETE")
    def delete(self):
        """
        Delete group ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request)  # ENH: Only if have 'editGroup' right

        # Get record
        rec = Session.query(MywGroup).get(id)
        if not rec:
            raise exc.HTTPNotFound()

        # Check we are authorised to modify it
        # ENH: Better to restrict to owner?
        if not rec.isManager(self.current_user.name()):
            raise exc.HTTPForbidden()

        # Delete substructure (to avoid problems on Oracle)
        for sub_rec in rec.substructure():
            Session.delete(sub_rec)
        Session.flush()

        # Delete it
        Session.delete(rec)
        Session.commit()

        return self.request.response
