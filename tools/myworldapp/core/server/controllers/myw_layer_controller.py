################################################################################
# Controller for layer requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json, urllib.request, urllib.parse, urllib.error
import base64
from contextlib import closing
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_layer import MywLayer
from myworldapp.core.server.models.myw_datasource import MywDatasource

from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.models.myw_private_layer import MywPrivateLayer
import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class MywLayerController(MywController):
    """
    Controller for myw.layer requests
    """

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        settings = request.registry.settings
        trace_level = settings.get("myw.layer.options", {}).get("log_level", 0)
        self.progress = MywSimpleProgressHandler(trace_level, "INFO: Layer: ")

    # ==============================================================================
    #                                 SYSTEM ACTIONS
    # ==============================================================================

    @view_config(
        route_name="myw_layer_controller.get_by_name", request_method="GET", renderer="json"
    )
    def get_by_name(self):
        """
        Returns defininition of layer with the given name
        """
        name = self.request.matchdict["name"]
        name = urllib.parse.unquote(name)
        self.current_user.assertAuthorized(self.request, layer_names=[name])

        query = Session.query(MywLayer).filter(MywLayer.name == name)
        for layer in query:
            return layer.definition(full=True, with_defaults=True)

        raise exc.HTTPNotFound()

    # ==============================================================================
    #                                 CONFIG ACTIONS
    # ==============================================================================

    @view_config(route_name="myw_layer_controller.no_id", request_method="GET", renderer="json")
    def index(self):
        """
        Returns defininitions of all layers (for Layers config page)

        Results include extra properties 'type' and 'extractable'
        .. but not feature_items (for speed)"""

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # This is also used in the applications section

        query = Session.query(MywLayer, MywDatasource).outerjoin(
            MywDatasource, MywLayer.datasource_name == MywDatasource.name
        )

        layer_defs = []
        for layer_rec, ds_rec in query:
            layer_def = layer_rec.definition(full=False, extras=True)
            layer_defs.append(layer_def)

        return {"layers": layer_defs}

    @view_config(route_name="myw_layer_controller.with_id", request_method="GET", renderer="json")
    def get(self):
        """
        return an application's details
        """
        id = self.request.matchdict["id"]

        # ENH: Change to work with layer defs (as per file load)

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        rec = Session.query(MywLayer).filter(MywLayer.id == id).first()

        return rec.definition(full=True)

    @view_config(route_name="myw_layer_controller.no_id", request_method="POST", renderer="json")
    def create(self):
        """
        Insert a new layer and assign it to all applications

        Definition is in request body (as JSON)"""

        # ENH: Duplicates code with file load: Change to work with layer defs

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        # Get layer properties
        props = json.loads(self.request.body)
        feature_types = props.pop("feature_types", [])

        props["spec"] = json.dumps(props["spec"])

        props["datasource_name"] = props.pop(
            "datasource"
        )  # ENH: Return datasource_name in serialise and get rid of this?

        # Check for duplicate name
        if Session.query(MywLayer).filter(MywLayer.name == props["name"]).first():
            raise exc.HTTPConflict()

        # Create record
        record = MywLayer(**props)

        # Ensure mandatory fields are populated
        record.set_backstops()

        Session.add(record)

        # Set associated features
        # ENH: Do this as part of creation
        layer_rec = Session.query(MywLayer).filter(MywLayer.name == props["name"]).first()
        layer_rec.set_feature_items(feature_types)

        Session.commit()
        self.request.response.status_code = 201
        return layer_rec.definition()

    @view_config(route_name="myw_layer_controller.with_id", request_method="PUT", renderer="json")
    def update(self):
        """
        Update layer ID

        New properties are in request body (as JSON)"""

        # ENH: Duplicates code with file load: Change to work with layer defs
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        # Get layer properties
        props = json.loads(self.request.body)
        feature_types = props.pop("feature_types", [])
        props["spec"] = json.dumps(props["spec"])

        # Get layer to update
        layer_rec = Session.query(MywLayer).get(id)

        # Check for duplicate name
        name = props.get("name")
        if name and (name != layer_rec.name):
            if Session.query(MywLayer).filter(MywLayer.name == name).first():
                raise exc.HTTPConflict()

        # Update it
        for prop, value in list(props.items()):

            if prop in ["extractable", "type"]:
                continue

            if prop == "datasource":
                prop = "datasource_name"

            layer_rec[prop] = value

        layer_rec.set_feature_items(feature_types)

        # Ensure mandatory fields are populated
        layer_rec.set_backstops()

        Session.commit()
        self.request.response.status_code = 201
        return layer_rec.definition()

    @view_config(
        route_name="myw_layer_controller.with_id", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete layer ID
        """
        id = self.request.matchdict["id"]

        self.current_user.assertAuthorized(self.request, right="manageLayers")

        # Get layer to delete
        layer_rec = Session.query(MywLayer).get(id)

        # Delete substructure (to avoid problems on Oracle)
        for rec in layer_rec.substructure():
            Session.delete(rec)
        Session.flush()

        # Delete record
        Session.delete(layer_rec)

        Session.commit()

        return {"layer_id": id}

    @view_config(route_name="myw_layer_controller.get_file", request_method="GET")
    def get_file(self):
        """
        Returns the contents of a file associated with a layer
        """
        layer_name = self.request.matchdict["layer_name"]

        self.current_user.assertAuthorized(self.request)

        # Gets the layer specified
        layer_owner = self.get_param(self.request, "owner")
        self.progress(3, "Getting layer file for:", layer_name, "owner=", layer_owner)
        if layer_owner:
            layer_id = layer_owner + ":" + layer_name
            layer_rec = Session.query(MywPrivateLayer).get(layer_id)
        else:
            # ENH: Get from config cache
            layer_rec = Session.query(MywLayer).filter(MywLayer.name == layer_name).first()

        if layer_rec is None:
            self.progress(1, "No such layer:", layer_name, layer_owner)
            raise exc.HTTPNotFound()

        # Build URL
        if layer_owner:
            source = layer_rec.get_json_property("spec", "source")
            if source == "feature":
                feature = layer_rec.get_json_property("spec", "feature")
                return self.get_feature_field_contents(feature)
            else:
                url = self.build_url(
                    layer_rec.get_json_property("datasource_spec", "baseUrl"),
                    layer_rec.get_json_property("spec", "relativeUrl"),
                )
        else:
            url = self.build_url(
                layer_rec.datasource_rec.get_property("spec", {}).get("baseUrl", ""),
                layer_rec.get_spec_property("relativeUrl"),
            )

        # Return the result
        self.progress(2, "Getting layer file from:", url)
        try:
            with closing(urllib.request.urlopen(url)) as connection:
                self.request.response.body = connection.read()
                return self.request.response

        except urllib.error.URLError as cond:
            self.progress(1, "Get layer file failed:", url, cond)
            raise exc.HTTPNotFound()  # ENH: Use MywAbort() to return cond

    def build_url(self, base_url, relative_url):
        """
        Build full URL for a layer file
        """

        # Build url
        url = base_url

        if url and not url.endswith("/") and relative_url:
            url += "/"

        url += relative_url

        # Quote spaces etc
        # ENH: Find an easier way! Use request?
        url_parts = urllib.parse.urlparse(url)

        url = urllib.parse.urlunparse(
            [
                url_parts.scheme,
                url_parts.netloc,
                urllib.parse.quote(url_parts.path),
                url_parts.params,
                url_parts.query,
                url_parts.fragment,
            ]
        )

        return url

    def get_feature_field_contents(self, feature_identifier):
        """
        Gets the file contents stored in a specified field,
        ensuring the user is authorized to access it
        """
        application = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        (feature_type, feature_id, field_id) = feature_identifier.split("/")

        self.current_user.assertAuthorized(
            self.request,
            require_reauthentication=False,
            feature_type=feature_type,
            application=application,
        )

        table = myw_globals.db.view(delta).table(feature_type)
        feature_rec = table.get(feature_id)
        contents = feature_rec[field_id]
        contents = json.loads(contents)
        contents = contents["content_base64"]
        contents = base64.b64decode(contents)
        self.request.response.body = contents
        return self.request.response
