################################################################################
# Controller for myw.user
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.myw_user import MywUser
from myworldapp.core.server.models.myw_user_role import MywUserRole

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywUserController(MywController):
    """
    Controller for accessing myw.user
    """

    # ==============================================================================
    #                                CONFIG OPERATIONS
    # ==============================================================================

    @view_config(route_name="myw_user_controller.no_id", request_method="GET", renderer="json")
    def index(self):
        """
        Get all user records
        """

        self.current_user.assertAuthorized(self.request, right="manageUsers")

        users = []

        for rec in Session.query(MywUser):
            users.append(rec.definition(for_config_page=True))

        return {"users": users}

    @view_config(route_name="myw_user_controller.with_id", request_method="GET", renderer="json")
    def get(self):
        """
        Get record for user ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageUsers")

        rec = Session.query(MywUser).get(id)

        if not rec:
            raise exc.HTTPForbidden()

        return rec.definition(for_config_page=True)

    @view_config(route_name="myw_user_controller.no_id", request_method="POST", renderer="json")
    def create(self):
        """
        Create a new record
        """

        self.current_user.assertAuthorized(self.request, right="manageUsers")

        # Unpick request
        props = json.loads(self.request.body)

        username = props["username"]
        email = props["email"]
        password = props["password"]
        locked_out = props["locked_out"]
        roles = props["roles"]

        # Check for duplicate username
        confilcting_name = Session.query(MywUser).filter(MywUser.username == username).first()
        if confilcting_name:
            raise exc.HTTPConflict()

        # Create record (and allocate id)
        rec = MywUser(username=username, password=password, email=email, locked_out=locked_out)
        Session.add(rec)
        Session.flush()
        newId = rec.id

        # Set roles
        # ENH: Use rec.set_roles()
        for role_id_str in roles:
            role_id = int(role_id_str)
            user_role = MywUserRole(user_id=newId, role_id=role_id)
            Session.add(user_role)

        Session.commit()

        return {"id": newId}

    @view_config(route_name="myw_user_controller.with_id", request_method="PUT", renderer="json")
    def update(self):
        """
        Update properties of user ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageUsers")

        # Unpick request
        props = json.loads(self.request.body)
        username = props["username"]
        email = props["email"]
        password = props.get("password")
        locked_out = props["locked_out"]
        roles = props["roles"]

        # Get record to update
        rec = Session.query(MywUser).get(id)

        # Update it
        rec["username"] = username
        rec["email"] = email
        rec["locked_out"] = locked_out

        if password and password != "xxxxxx":
            rec["password"] = props["password"]

        # Set roles
        # ENH: Use rec.set_roles()
        Session.query(MywUserRole).filter(MywUserRole.user_id == id).delete()
        for role in roles:
            role_id = int(role)
            user_role = MywUserRole(user_id=int(id), role_id=role_id)
            Session.add(user_role)

        Session.commit()

        return rec.definition(for_config_page=True)

    @view_config(route_name="myw_user_controller.with_id", request_method="DELETE", renderer="json")
    def delete(self):
        """
        Delete user ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageUsers")

        # Get record to delete
        rec = Session.query(MywUser).get(id)

        # Delete substructure
        for sub_rec in rec.substructure():
            Session.delete(sub_rec)
        Session.flush()

        # Delete record
        Session.delete(rec)

        Session.commit()

        return {"id": id}
