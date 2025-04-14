################################################################################
# Controller for extract meta-data requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.database.myw_database import MywDatabase
from myworldapp.core.server.replication.myw_master_replication_engine import (
    MywMasterReplicationEngine,
)
from myworldapp.core.server.models.myw_extract_config import MywExtractConfig
from myworldapp.core.server.models.myw_role import MywRole

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywExtractController(MywController):
    """
    Controller for extract-related requests
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        MywController.__init__(self, request)

        self.db = MywDatabase(Session)
        self.rep_engine = MywMasterReplicationEngine(self.db)

    @view_config(route_name="myw_extract_controller.index", request_method="GET", renderer="json")
    def index(self):
        """
        Returns details of all extracts
        """

        self.current_user.assertAuthorized(self.request, right="manageReplicas")

        extracts = []

        for extract_type in self.rep_engine.extractTypes():
            extract_def = self.rep_engine.extractDef(extract_type)
            extracts.append(extract_def)

        return {"extracts": extracts}

    @view_config(
        route_name="myw_extract_controller.list_by_role", request_method="GET", renderer="json"
    )
    def list_by_role(self):
        """
        Returns details of all extracts
        """
        self.current_user.assertAuthorized(self.request, right="manageReplicas")

        configs = Session.query(MywExtractConfig).all()

        roles = []
        role_names = [r.name for r in Session.query(MywRole)]
        role_names.append("all")
        for role in role_names:
            extracts = [c["extract_name"] for c in configs if c["role_name"] == role]
            roles.append({"name": role, "extracts": sorted(extracts)})

        return {"roles": roles}

    @view_config(
        route_name="myw_extract_controller.with_name", request_method="GET", renderer="json"
    )
    def get(self):
        """
        Returns details of given extracts
        """
        name = self.request.matchdict["name"]
        self.current_user.assertAuthorized(self.request, right="manageReplicas")

        return self.rep_engine.extractDef(name)

    @view_config(
        route_name="myw_extract_controller.with_role", request_method="GET", renderer="json"
    )
    def get_by_role(self):
        """
        Returns details of given extracts
        """
        role = self.request.matchdict["role"]
        self.current_user.assertAuthorized(self.request, right="manageReplicas")

        role_rec = Session.query(MywRole).filter(MywRole.name == role).first()
        if not role_rec:
            raise exc.HTTPNotFound()

        role_names = [role, "all"]

        configs = Session.query(MywExtractConfig).filter(MywExtractConfig.role_name.in_(role_names))

        roles = []
        for role in role_names:
            extracts = [c["extract_name"] for c in configs if c["role_name"] == role]
            roles.append({"name": role, "extracts": sorted(extracts)})

        return {"roles": roles}

    @view_config(
        route_name="myw_extract_controller.with_name", request_method="PUT", renderer="json"
    )
    def config(self):
        """
        Update extract_config entries for anextract
        """
        name = self.request.matchdict["name"]
        self.current_user.assertAuthorized(self.request, right="manageReplicas")

        # Unpick request
        extract_def = json.loads(self.request.body)

        if name != "all":
            self.db.setExtractDownload(
                name,
                None,
                extract_def["writable_by_default"],
                extract_def["expiry_time"],
                extract_def["folder_name"],
            )

        # Set roles
        roles = extract_def["roles"] if "roles" in extract_def else []
        Session.query(MywExtractConfig).filter(MywExtractConfig.extract_name == name).filter(
            MywExtractConfig.role_name != None
        ).delete()

        for role_name in roles:
            extract_download = MywExtractConfig(extract_name=name, role_name=role_name)
            Session.add(extract_download)

        Session.commit()

        return self.rep_engine.extractDef(name)

    @view_config(
        route_name="myw_extract_controller.with_role", request_method="PUT", renderer="json"
    )
    def config_role(self):
        """
        Update extract_config entries for a role
        """
        role = self.request.matchdict["role"]
        self.current_user.assertAuthorized(self.request, right="manageReplicas")

        role_rec = Session.query(MywRole).filter(MywRole.name == role).first()
        if not role_rec:
            raise exc.HTTPNotFound()

        # Unpick request
        role_def = json.loads(self.request.body)
        extracts = list(set(role_def["extracts"]))  # ensures no duplicates

        # delete extract_config records for this role
        Session.query(MywExtractConfig).filter(MywExtractConfig.role_name == role).delete()

        for extract_name in extracts:
            Session.add(MywExtractConfig(extract_name=extract_name, role_name=role))

        Session.commit()

        return {"extracts": extracts}
