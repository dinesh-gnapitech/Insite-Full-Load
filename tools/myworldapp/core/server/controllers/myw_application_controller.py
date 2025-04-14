################################################################################
# Controller for accessing application objects
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import copy, json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.db.myw_expression_parser import MywExpressionParser

from myworldapp.core.server.models.myw_application import MywApplication
from myworldapp.core.server.models.myw_application_layer import MywApplicationLayer
from myworldapp.core.server.models.myw_layer_group import MywLayerGroup
from myworldapp.core.server.models.myw_private_layer import MywPrivateLayer
from myworldapp.core.server.models.myw_query import MywQuery
from myworldapp.core.server.models.myw_search_rule import MywSearchRule
from myworldapp.core.server.models.myw_application_state import MywApplicationState

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywApplicationController(MywController):
    """
    Controller for accessing myw.application and substructure
    """

    @view_config(
        route_name="myw_application_controller.index", request_method="GET", renderer="json"
    )
    def index(self):
        """
        Returns all applications
        """

        self.current_user.assertAuthorized(self.request)

        appQuery = Session.query(MywApplication)
        apps = []
        for app in appQuery:
            apps.append(app.definition(full=False))

        return {"applications": apps}

    # ==============================================================================
    #                                CONFIG OPERATIONS
    # ==============================================================================
    # Must not use cache

    @view_config(
        route_name="myw_application_controller.no_id", request_method="GET", renderer="json"
    )
    def config_index(self):
        """
        Returns all applications
        """

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # This is also required when editing roles

        appQuery = Session.query(MywApplication)
        apps = []
        for app in appQuery:
            apps.append(app.definition(full=False))

        return {"applications": apps}

    @view_config(
        route_name="myw_application_controller.with_id", request_method="GET", renderer="json"
    )
    def get(self):
        """
        return an application's details
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageApplications")

        rec = Session.query(MywApplication).filter(MywApplication.id == id).first()

        return rec.definition(full=True)

    @view_config(
        route_name="myw_application_controller.no_id", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Create a new application record
        """

        self.current_user.assertAuthorized(self.request, right="manageApplications")

        # Unpick the request
        props = json.loads(self.request.body)

        # Create record (and allocate it an ID)
        app_record = MywApplication(
            name=props["name"],
            external_name=props["external_name"],
            description=props["description"],
            javascript_file=props["javascript_file"],
            for_online_app=props["for_online_app"],
            for_native_app=props["for_native_app"],
            image_url=props["icon_url"],
        )
        Session.add(app_record)
        Session.flush()
        new_id = app_record.id

        # Add substructure
        for layer in props["layer_items"]:
            if isinstance(layer, dict):
                app_layer = MywApplicationLayer(
                    application_id=new_id,
                    layer_id=int(layer["id"]),
                    read_only=bool(layer["read_only"]),
                    snap=bool(layer["snap"]),
                )
            else:
                app_layer = MywApplicationLayer(application_id=new_id, layer_id=int(layer))
            Session.add(app_layer)

        Session.commit()

        return app_record.definition(full=True)

    @view_config(
        route_name="myw_application_controller.with_id", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Updates properties of ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageApplications")

        # Unpick the request
        id = int(id)
        props = json.loads(self.request.body)

        # Get record to update
        app_record = Session.query(MywApplication).get(id)

        # Update it
        app_record["name"] = props["name"]
        app_record["external_name"] = props["external_name"]
        app_record["description"] = props["description"]
        app_record["image_url"] = props["icon_url"]

        if props["name"] != "config":
            app_record["javascript_file"] = props["javascript_file"]
            app_record["for_online_app"] = props["for_online_app"]
            app_record["for_native_app"] = props["for_native_app"]

            # Update substructure
            Session.query(MywApplicationLayer).filter(
                MywApplicationLayer.application_id == id
            ).delete()
            for layer in props["layer_items"]:
                # Handle read_only information
                if isinstance(layer, dict):
                    app_layer = MywApplicationLayer(
                        application_id=int(id),
                        layer_id=int(layer["id"]),
                        read_only=bool(layer["read_only"]),
                        snap=bool(layer["snap"]),
                    )
                else:
                    app_layer = MywApplicationLayer(application_id=int(id), layer_id=int(layer))

                Session.add(app_layer)

        Session.commit()

        return app_record.definition(full=True)

    @view_config(
        route_name="myw_application_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete record ID (and associated substructure)
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageApplications")

        # Get record to delete
        app_rec = Session.query(MywApplication).get(id)

        # Delete substructure
        for rec in app_rec.substructure():
            Session.delete(rec)
        Session.flush()

        # Delete the application record
        Session.delete(app_rec)

        Session.commit()

        return {"application_id": id}

    # ==============================================================================
    #                                CLIENT OPERATIONS
    # ==============================================================================

    @view_config(
        route_name="myw_application_controller.get_startup_info",
        request_method="GET",
        renderer="json",
    )
    def get_startup_info(self):
        """
        Returns the datasources, layers and layer groups accessible to APPLICATION_NAME
        """
        # ENH: Return datasources etc as dict
        application_name = self.request.matchdict["application_name"]

        # Check user of config application can view layers for an application
        if not (
            self.current_user.authorized(self.request, application=application_name)
            or self.current_user.authorized(self.request, application="config")
        ):
            raise exc.HTTPForbidden()

        # Get application record
        application = (
            Session.query(MywApplication).filter(MywApplication.name == application_name).first()
        )
        if not application:
            raise exc.HTTPNotFound()

        # Get info from rights cache
        layers = list(self.current_user.layerDefs(application_name).values())
        datasources = list(self.current_user.datasourceDefs(application_name).values())
        layer_groups = [group.serialise(True) for group in Session.query(MywLayerGroup)]

        # Extend datasource definitions to include additional information about accssible feature types
        datasources = self._modify_datasource_definitions(application_name, datasources)

        # Builds (sorted, to make tests stable)
        return {
            "externalName": application.external_name,
            "layers": layers,
            "datasources": sorted(datasources, key=lambda el: el["name"]),
            "layerGroups": sorted(layer_groups, key=lambda el: el["name"]),
            "privateLayers": self.private_layer_defs(),
            "roles": self.current_user.roleNames(),
            # ENH change this to {"rightName": True, "rightName": ["restrictions"]} form to reduce
            # number of bytes on the wire.
            "rights": self.current_user.rights(application_name),
        }

    def private_layer_defs(self):
        """
        Definitions of the user layers accessible to current user
        """

        recs = (
            Session.query(MywPrivateLayer)
            .filter(
                (MywPrivateLayer.owner == self.current_user.name())
                | (MywPrivateLayer.sharing.in_(self.current_user.groupIds()))
            )
            .order_by(MywPrivateLayer.id)
        )

        layer_defs = []
        for rec in recs:
            layer_defs.append(rec.definition(include_id=True))

        return layer_defs

    def _modify_datasource_definitions(self, application_name, datasource_defs):
        """
        Modifies datasource definitions DATASOURCE_DEFS

        Make ths following changes:
          exlcudes inaccessible feature types
          includes additional information about feature type: external name, queries, etc"""

        # ENH: Avoid having to do database queries here (use config cache)

        def queryAsJson(query_rec):
            return {
                "matched_value": query_rec["myw_search_val1"],
                "display_value": query_rec["myw_search_desc1"],
                "attrib_query": query_rec["attrib_query"],
                "lang": query_rec["lang"],
            }

        ds_defs = {}

        # Build list of feature types known by each datasource (from external DD extras)
        for ds_def in datasource_defs:
            ds_name = ds_def["name"]
            ds_defs[ds_name] = ds_def
            ds_def["featureTypes"] = {}

        # Build list of queries hashed by datasource/featuretype
        queries = {}
        for q in Session.query(MywQuery):
            key = q.datasource_name + "/" + q.myw_object_type  # ENH: EXTDD: Encapsulate on model
            if not key in queries:
                queries[key] = []
            queries[key].append(q)

        # Build list of search rules hashed by datasource/featuretype
        searches = {}
        for sr in Session.query(MywSearchRule):
            key = sr.datasource_name + "/" + sr.feature_name  # ENH: EXTDD: Encapsulate on model
            if not key in searches:
                searches[key] = []
            searches[key].append(sr)

        # Re-populate the datasource specs with accessible features only
        feature_defs = self.current_user.featureTypeDefs(application_name=application_name)
        editable_by_dsname = {}

        for feature_def in list(feature_defs.values()):  # ENH: EXTDD: Return nested lists?
            ds_name = feature_def["datasource_name"]
            if not ds_name in ds_defs:
                continue

            # get editable feature types in the application
            if not ds_name in editable_by_dsname:
                editable_by_dsname[ds_name] = self.current_user.featureTypes(
                    ds_name, application_name, editable_only=True
                )
            editable_in_application = editable_by_dsname[ds_name]

            feature_type = feature_def["feature_name"]

            # Add 'extra' information from datasource record (if present)
            # ENH: Replace 'extra' info by something stored on feature record
            ds_def = ds_defs[ds_name]
            feature_types = ds_def.get("spec", {}).get("featureTypes", {})
            feature_info = feature_types.get(feature_type, {})
            ds_def["featureTypes"][feature_type] = feature_info

            # Add information from feature records
            feature_info["external_name"] = feature_def["external_name"]
            feature_info["primary_geom_name"] = feature_def["primary_geom_name"]
            if feature_def["editable"] and feature_type in editable_in_application:
                feature_info["editable"] = True
            if feature_def["versioned"]:
                feature_info["versioned"] = True

            key = ds_name + "/" + feature_type

            # Add searches
            if ds_name != "myworld" and key in searches:
                (search_id_terms, search_fields) = self.parse_external_search_rules(searches[key])
                feature_info["search_id_terms"] = search_id_terms
                feature_info["search_fields"] = search_fields

            # Add queries
            if key in queries and ds_name != "myworld":
                feature_info["queries"] = [queryAsJson(q) for q in queries[key]]

        # Remove 'featureTypes' entry from datasource spec (to avoid problems in client)
        datasource_defs = copy.deepcopy(datasource_defs)
        for ds_def in datasource_defs:
            spec = ds_def.get("spec")
            if spec and "featureTypes" in spec:
                del spec["featureTypes"]

        return datasource_defs

    def parse_external_search_rules(self, search_rule_recs):
        """
        Extracts id terms and searchable fields from an external feature search rule

        SEARCH_RULE_RECS[0] is assumed to be formatted as created by the config page:
           <id_terms> [field] [field] ...

        Returns:
          ID_TERMS: List of words used to trigger search on external datasource
          FIELDS:   List of field names to search on
        """
        # ENH: Warning if more than one search rule
        # ENH: Move to search rule model

        expr = search_rule_recs[0].search_val_expr
        id_terms = []
        fields = []

        for el_type, value in MywExpressionParser(expr).parse():

            if el_type == "literal":
                for term in value.split():  # Splits on whitespace
                    id_terms.append(term)

            elif el_type == "field":
                fields.append(value)

            else:
                raise Exception("Unknown el type: " + el_type)  # Internal error

        return id_terms, fields

    @view_config(
        route_name="myw_application_controller.state", request_method="GET", renderer="json"
    )
    def get_state(self):
        """
        Returns stored state for APPLICATION_NAME

        Returns layout and plugin options from table
        myw.application_state. If no record for the current user, tries user
        'default' instead.

        Returns a dict, keyed by (?)plugin name"""
        application_name = self.request.matchdict["application_name"]

        self.current_user.assertAuthorized(self.request)

        query = Session.query(MywApplicationState).filter(
            MywApplicationState.application_name == application_name
        )

        # Try current user
        username = self.current_user.name()
        rec = query.filter(MywApplicationState.username == username).first()

        # Try default user
        if rec is None:
            rec = query.filter(MywApplicationState.username == "default").first()

        if rec is None:
            return {}

        try:
            return json.loads(rec.state)
        except json.JSONDecodeError as cond:
            # ENH: Show a warning
            print(
                "***WARNING*** Failed to decode application state:",
                application_name,
                rec.username,
                ":",
                cond,
            )
            return {}

    @view_config(
        route_name="myw_application_controller.state", request_method="PUT", renderer="json"
    )
    def set_state(self):
        """
        Save state for APPLICATION_NAME

        This sets the default application layout and plugin options
        for future sessions (but is overridden by browser local state)"""
        application_name = self.request.matchdict["application_name"]

        usernameInRequest = self.request.matchdict["username"]

        if usernameInRequest == "default":
            self.current_user.assertAuthorized(
                self.request, right="saveDefaultState", application=application_name
            )
            username = "default"
        else:
            self.current_user.assertAuthorized(
                self.request, right="persistState", application=application_name
            )
            username = self.current_user.name()

        # Get the data from the request
        application_state = self.request.body.decode("utf-8")

        # Create or update record
        rec = Session.query(MywApplicationState).get((username, application_name))

        if rec:
            rec.state = application_state
        else:
            rec = MywApplicationState(
                username=username, application_name=application_name, state=application_state
            )
            Session.add(rec)

        Session.commit()

        return {}
