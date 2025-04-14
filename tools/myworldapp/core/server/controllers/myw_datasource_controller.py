################################################################################
# Controller for layer config requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from pyramid.view import view_config
import pyramid.httpexceptions as exc
from simplejson import loads
import urllib.request, urllib.error, urllib.parse
import json

from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.myw_datasource import MywDatasource
from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
from myworldapp.core.server.models.myw_private_layer import MywPrivateLayer

from myworldapp.core.server.controllers.base.myw_utils import mywAbort
import myworldapp.core.server.controllers.base.myw_globals as myw_globals

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywDatasourceController(MywController):
    """
    Engine handling datasource-related requests
    """

    def __init__(self, request):
        """
        Initialize the MywDatasource controller.
        """

        MywController.__init__(self, request)
        self.dd = myw_globals.dd

    @view_config(
        route_name="myw_datasource_controller.no_name", request_method="GET", renderer="json"
    )
    def index(self):
        """
        Returns defininitions of all datasources
        """

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # This is also used for features

        query = Session.query(MywDatasource)
        datasources = {}
        for datasource in query:
            datasources[datasource.name] = datasource.definition(full=False)
            datasources[datasource.name]["feature_types"] = []

        for rec in Session.query(MywDDFeature):
            ds = datasources[rec.datasource_name]
            ds["feature_types"].append(rec.feature_name)

        return {"datasources": list(datasources.values())}

    @view_config(
        route_name="myw_datasource_controller.with_name", request_method="GET", renderer="json"
    )
    def get(self):
        """
        return a datasource's details
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(
            self.request, application="config"
        )  # This is also used for features

        rec = Session.query(MywDatasource).get(name)

        if not rec:
            raise exc.HTTPNotFound()

        return rec.definition(full=True)

    @view_config(
        route_name="myw_datasource_controller.no_name", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Insert a new datasource from properties in request body (as JSON)
        """

        self.current_user.assertAuthorized(self.request, right="manageDatasources")

        # Get properties
        props = loads(self.request.body)

        # Check for duplicate name
        if Session.query(MywDatasource).filter(MywDatasource.name == props["name"]).first():
            raise exc.HTTPConflict()

        # Create record
        rec = MywDatasource()
        for prop, value in list(props.items()):
            if prop == "feature_types":
                # discard property added in get method
                continue
            rec.set_property(prop, value)
        rec.set_backstops()

        Session.add(rec)
        Session.commit()

        # Return what we created
        rec = Session.query(MywDatasource).get(props["name"])
        self.request.response.status_code = 201
        return rec.definition()

    @view_config(
        route_name="myw_datasource_controller.with_name", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update datasource NAME from properties in request body (as JSON)
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="manageDatasources")

        # Get properties
        props = loads(self.request.body)

        # Get record to update
        rec = Session.query(MywDatasource).get(name)
        if not rec:
            raise exc.HTTPNotFound()

        # Set its properties
        for prop, value in list(props.items()):
            if prop == "feature_types":
                # discard property added in get method
                continue
            rec.set_property(prop, value)

        Session.commit()

        # Return what we created
        rec = Session.query(MywDatasource).get(name)
        self.request.response.status_code = 201
        return rec.definition()

    @view_config(
        route_name="myw_datasource_controller.with_name", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete datasource NAME
        """
        name = self.request.matchdict["name"]

        # ENH: Client should check/warn if ds is referenced by layers?

        self.current_user.assertAuthorized(self.request, right="manageDatasources")

        # Check record exists
        datasource_rec = Session.query(MywDatasource).get(name)

        # Delete it (and sub/super structure)
        self.dd.dropDatasource(name)

        Session.commit()

        return {"datasource_name": name}

    @view_config(route_name="myw_datasource_controller.tunnel_config_request", request_method="GET")
    def tunnel_config_request(self):
        """
        Sends a request to another server and returns the response

        Used by config pages to test configuration of datasources
        """

        self.current_user.assertAuthorized(
            self.request, right="manageDatasources", ignore_csrf=True
        )

        url = self.request.params.get("url", None)
        if not url:
            raise exc.HTTPBadRequest("Missing 'url' parameter")

        username = self.request.params.get("username", None)
        password = self.request.params.get("password", None)

        return self._tunnel_request(url, username, password)

    @view_config(route_name="myw_datasource_controller.tunnel_request", request_method="GET")
    def tunnel_request(self):
        """
        Execute a request on an OGC datasource or private layer (and return results)
        """
        # ENH: Better on layer controller?
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, ignore_csrf=True)

        owner = self.request.params.get("owner", None)

        # Get spec
        if owner:
            layer_rec = Session.query(MywPrivateLayer).get(name)
            if not layer_rec:
                raise exc.HTTPBadRequest("No such private layer: " + str(name))
            spec = layer_rec.json_from_db("datasource_spec")

        else:
            ds_rec = Session.query(MywDatasource).get(name)
            if not ds_rec:
                raise exc.HTTPBadRequest("No such datasource: " + str(name))
            spec = ds_rec.get_property("spec")

        # Extract url
        url_field_name = self.request.params.get("urlFieldName", None)
        if url_field_name and url_field_name in spec:
            base_url = spec[url_field_name]
        else:
            raise exc.HTTPBadRequest("Missing or invalid value for 'urlFieldName'")

        relativeUrl = self.request.params.get("relativeUrl", "")
        if relativeUrl and not base_url.endswith("/"):
            base_url += "/"

        url = base_url + urllib.parse.quote(relativeUrl)

        return self._tunnel_request(url, spec.get("username"), spec.get("password"))

    def _tunnel_request(self, url, username=None, password=None):
        """
        Execute a request on an external url (and return the results)
        """
        if url.endswith("?"):
            url = url[:-1]

        request_url = url + "?" + self.request.params.get("paramsStr")
        headers = {}
        if self.request.headers.get("User-Agent") is not None:
            headers["User-Agent"] = self.request.headers.get("User-Agent")
        ext_request = urllib.request.Request(request_url, headers=headers)

        try:
            # Send request
            if username:
                # Send authentication headers with the request
                authinfo = urllib.request.HTTPPasswordMgrWithDefaultRealm()
                authinfo.add_password(None, url, username, password)
                handler = urllib.request.HTTPBasicAuthHandler(authinfo)
                opener = urllib.request.build_opener(handler)
                # ENH: register the opener (once) for all subsequent requests: opened = urllib2.install_opener(myopener)
                ext_response = opener.open(ext_request)
            else:
                ext_response = urllib.request.urlopen(ext_request)
                self.request.response.content_type = ext_response.info().get("Content-Type")
            # Get response
            output = ext_response.read()

            # Check it is well formed
            # ENH: Check format=XML too (for OGC)
            format = self.request.params.get("format", None) or "json"
            if format == "json":

                try:
                    json.loads(output)

                except ValueError as cond:
                    mywAbort("Bad response: " + str(cond), url=request_url, response=output)

        except Exception as cond:
            mywAbort(cond, url=request_url)

        self.request.response.body = output
        return self.request.response
