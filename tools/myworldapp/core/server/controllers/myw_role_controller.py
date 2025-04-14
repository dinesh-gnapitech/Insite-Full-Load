################################################################################
# Controller for role object
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.models.myw_permission import MywPermission
from myworldapp.core.server.models.myw_right import MywRight
from myworldapp.core.server.base.core.myw_error import MywError

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywRoleController(MywController):
    """
    Controller for accessing myw.role and substructure
    """

    @view_config(route_name="myw_role_controller.no_id", request_method="GET", renderer="json")
    def index(self):
        """
        return role definitions
        """

        self.current_user.assertAuthorized(self.request, application="config")

        roles = []
        for role in Session.query(MywRole):
            roles.append(role.definition())

        return {"roles": roles}

    @view_config(route_name="myw_role_controller.with_id", request_method="GET", renderer="json")
    def get(self):
        """
        return role information including permissions
        """
        # ENH: instead of permissions send "application_data" as per code in model. create/update methods could then use model.updatePermissions
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageRoles")

        query = (
            Session.query(MywRole, MywPermission, MywRight)
            .outerjoin(MywPermission, MywPermission.role_id == MywRole.id)
            .outerjoin(MywRight, MywPermission.right_id == MywRight.id)
            .filter(MywRole.id == id)
        )

        permissions = []

        for role, permission, right in query:
            role_name = role.name
            role_desc = role.description
            if permission:
                permissions.append(
                    {
                        "right_id": right.id,
                        "application_id": permission.application_id,
                        "restrictions": permission.restrictions,
                    }
                )

        if not role_name:
            raise exc.HTTPNotFound()

        return {"id": id, "name": role_name, "description": role_desc, "permissions": permissions}

    @view_config(route_name="myw_role_controller.no_id", request_method="POST", renderer="json")
    def create(self):
        """
        Create role from data request body
        """

        self.current_user.assertAuthorized(self.request, right="manageRoles")

        props = json.loads(self.request.body)
        role_name = props["name"]
        role_description = props["description"]
        permissions = props["permissions"]

        # Check for duplicate name
        if Session.query(MywRole).filter(MywRole.name == role_name).first():
            raise exc.HTTPConflict()

        # Create record
        rec = MywRole(name=role_name, description=role_description)
        Session.add(rec)
        Session.flush()

        # Substructure
        for perm in permissions:
            permission = MywPermission(
                role_id=rec.id,
                right_id=int(perm["right_id"]),
                application_id=int(perm["application_id"]),
                restrictions=perm["restrictions"] if "restrictions" in perm else None,
            )
            Session.add(permission)
            try:
                permission.assertValid()
            except MywError as cond:
                raise exc.HTTPUnprocessableEntity(cond.msg)

        Session.commit()

        return {"id": rec.id}

    @view_config(route_name="myw_role_controller.with_id", request_method="PUT", renderer="json")
    def update(self):
        """
        Update properties of role ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageRoles")

        # Unpick args
        id = int(id)
        props = json.loads(self.request.body)
        role_name = props["name"]
        role_description = props["description"]
        permissions = props["permissions"]

        # Set simple properties
        rec = Session.query(MywRole).get(id)
        rec["name"] = role_name
        rec["description"] = role_description

        # Set substructure
        Session.query(MywPermission).filter(MywPermission.role_id == id).delete()
        for perm in permissions:
            permission = MywPermission(
                role_id=id,
                right_id=int(perm["right_id"]),
                application_id=int(perm["application_id"]),
                restrictions=perm["restrictions"] if "restrictions" in perm else None,
            )
            Session.add(permission)
            try:
                permission.assertValid()
            except MywError as cond:
                raise exc.HTTPUnprocessableEntity(cond.msg)

        Session.commit()

        return {"id": id, "name": role_name, "description": role_description}

    @view_config(route_name="myw_role_controller.with_id", request_method="DELETE", renderer="json")
    def delete(self):
        """
        Delete role ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageRoles")

        # Find record
        role_rec = Session.query(MywRole).get(id)

        # Remove substructure
        for rec in role_rec.substructure():
            Session.delete(rec)
        Session.flush()

        # Remove record
        Session.delete(role_rec)

        Session.commit()

        return {"role_id": id}

    @view_config(
        route_name="myw_role_controller.lookup_role", request_method="GET", renderer="json"
    )
    def lookup_role(self):
        role_name = self.request.matchdict["role_name"]
        self.current_user.assertAuthorized(self.request)

        # Make sure user can access requested role definition
        user_roles = self.current_user.roleNames()
        if role_name not in user_roles:
            raise exc.HTTPUnauthorized()

        # Fetch user role
        query = Session.query(MywRole).filter(MywRole.name == role_name).first()

        role = {"id": query.id, "name": query.name, "description": query.description}

        # Fetch permissions for the user's role
        permissions = []
        right_ids = []

        query = Session.query(MywPermission).filter(MywPermission.role_id == role["id"])

        for rec in query:
            new_permission = {
                "role_id": rec.role_id,
                "right_id": rec.right_id,
                "application_id": rec.application_id,
                "restrictions": rec.restrictions,
            }
            permissions.append(new_permission)
            right_ids.append(new_permission["right_id"])

        # Fetch rights for each permission
        rights = []

        query = Session.query(MywRight).filter(MywPermission.role_id.in_(right_ids))

        for rec in query:
            new_right = {
                "id": rec.id,
                "name": rec.name,
                "description": rec.description,
                "config": rec.config,
            }
            rights.append(new_right)

        return {"role": role, "permissions": permissions, "rights": rights}
