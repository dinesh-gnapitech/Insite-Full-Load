################################################################################
# Record exemplar for myw.role
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from sqlalchemy import Integer

# Local imports
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.base import ModelBase, MywModelMixin
from myworldapp.core.server.models.myw_extract_config import MywExtractConfig
from myworldapp.core.server.models.myw_user_role import MywUserRole
from myworldapp.core.server.models.myw_permission import MywPermission
from myworldapp.core.server.models.myw_right import MywRight
from myworldapp.core.server.models.myw_application import MywApplication


class MywRole(ModelBase, MywModelMixin):
    """
    Record exemplar for myw.role
    """

    __tablename__ = MywModelMixin.dbTableName("myw", "role")
    __table_args__ = MywModelMixin.dbTableArgs("myw")

    # Set explicit field types (for SQLite)
    id = MywModelMixin.keyColumn("myw", "role", "id", Integer, generator="sequence")

    @staticmethod
    def application_rights_join(Session):
        """
        Return query for (MywRole, MywRight, MywApplication) join
        """
        role_to_permission = (MywPermission, MywRole.id == MywPermission.role_id)
        permission_to_right = (MywRight, MywPermission.right_id == MywRight.id)
        application_to_permission = (
            MywApplication,
            MywPermission.application_id == MywApplication.id,
        )

        return (
            Session.query(MywRole, MywRight, MywApplication, MywPermission)
            .join(role_to_permission)
            .join(application_to_permission)
            .join(permission_to_right)
        )

    def application_rights_query(self):
        """
        Return query for (MywPermission, MywRight, MywApplication) join filtered on self
        """
        permission_to_right = (MywRight, MywPermission.right_id == MywRight.id)
        application_to_permission = (
            MywApplication,
            MywPermission.application_id == MywApplication.id,
        )

        return (
            Session.query(MywPermission, MywRight, MywApplication)
            .join(application_to_permission)
            .join(permission_to_right)
            .filter(MywPermission.role_id == self.id)
        )

    def definition(self):
        """
        Return self in a serializable format
        """
        return {"id": self.id, "name": self.name, "description": self.description}

    def substructure(self):
        """
        The records that depend on self
        """
        return (
            Session.query(MywPermission).filter(MywPermission.role_id == self.id).all()
            + Session.query(MywUserRole).filter(MywUserRole.role_id == self.id).all()
            + Session.query(MywExtractConfig).filter(MywExtractConfig.role_name == self.name).all()
        )

    def applicationNames(self):
        """
        Names of the applications to which self grants access
        """

        query = self.application_rights_query().filter(MywRight.name == "accessApplication")

        names = []
        for _, _, app in query:
            names.append(app.name)

        return names

    def rightsFor(self, application_name, exclude_app_access=False):
        """
        Names of the rights self grants for APPLICATION_NAME
        """
        # ENH: Better as relationship

        query = self.application_rights_query().filter(MywApplication.name == application_name)

        if exclude_app_access:
            query = query.filter(MywRight.name != "accessApplication")

        rights = []
        for perm, right, _ in query:
            restrictions = perm.restrictions

            if restrictions is not None:
                r = {
                    "name": right.name,
                    "restrictions": restrictions,
                }
            else:
                # fall back to old behaviour if no fine-grained restrictions.
                r = right.name

            rights.append(r)

        return rights

    def setRights(self, applications_data):
        """
        Set rights according to the data supplied in APPLICATIONS_DATA

        APPLICATIONS_DATA is a dict of lists of right names, keyed by application name
        """

        # Get list of currently accessible applications
        current_applications = self.applicationNames()

        # Set permissions for applications we can access
        for application_name, application_rights in applications_data.items():
            self._setPermissionsFor(application_name, application_rights)

            if application_name in current_applications:
                current_applications.remove(application_name)

        # Remove permissions for applications we no longer have access to
        for application_name in current_applications:
            self._removePermissionsFor(application_name)

    def _setPermissionsFor(self, application_name, rights):
        """
        Set permissions for APPLICATION_NAME to be RIGHTS (a list of right names, or restriction
        JSON.)

        application_name - string of the application name to which the rights will apply.
        rights - list of rights, either as a string of the name if unrestricted, or as a dict with
        keys:
          name - name of the right, and
          restrictions - the details of when this right applies.
        """

        # Since we have an entry, we automatically have accessApplication right
        rights.append("accessApplication")

        # Get ID of application
        app_rec = (
            Session.query(MywApplication).filter(MywApplication.name == application_name).first()
        )
        app_id = app_rec.id

        # Cache the right IDs by name, so we can decode them from the input.
        all_right_names = {right.name: right.id for right in Session.query(MywRight).all()}

        # Build a list of current permissions
        prev_permission_recs = {}
        for permission in self.__permissionRecsFor(app_id):
            prev_permission_recs[permission.right_id] = permission

        # Create new permissions (where necessary)
        for right in rights:

            try:
                right_id = all_right_names[right["name"]]
                restrictions = right["restrictions"]
            except TypeError:
                # right is just a string, which is the name.
                right_id = all_right_names[right]
                restrictions = None
            except KeyError:
                print("Unknown right:", right)  # ENH: Throw an error .. or report via progress
                continue

            rec = prev_permission_recs.pop(right_id, None)

            if not rec:
                # No permission rec exists yet, so create it:
                rec = MywPermission(
                    role_id=self.id,
                    application_id=app_id,
                    right_id=right_id,
                    restrictions=restrictions,
                )
                Session.merge(rec)
            else:
                # ensure we overwrite with the new restrictions on the record:
                rec.restrictions = restrictions

            rec.assertValid()

        # Handle rights removed from the role
        for permission_rec in prev_permission_recs.values():
            Session.delete(permission_rec)

    def _removePermissionsFor(self, application_name):
        """
        Remove permissions for APPLICATION_NAME
        """

        app_rec = (
            Session.query(MywApplication).filter(MywApplication.name == application_name).first()
        )
        app_id = app_rec.id

        query = Session.query(MywPermission).filter(
            MywPermission.role_id == self.id, MywPermission.application_id == app_id
        )

        for rec in query:
            Session.delete(rec)

    def __permissionRecFor(self, app_id, right_id):
        """
        Returns the permission for the SELF that matches the supplied application and right
        """
        query = Session.query(MywPermission).filter(
            MywPermission.role_id == self.id,
            MywPermission.application_id == app_id,
            MywPermission.right_id == right_id,
        )
        return query.first()

    def __permissionRecsFor(self, app_id):
        """
        Returns the permissions for the SELF that matches the supplied application
        """
        query = Session.query(MywPermission).filter(
            MywPermission.role_id == self.id, MywPermission.application_id == app_id
        )
        return query.all()
