################################################################################
# Controller for main url
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import pyramid.httpexceptions as exc
from pyramid.renderers import render
from sqlalchemy.sql import and_
from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.system.myw_code_manager import MywCodeManager
from myworldapp.core.server.auth.myw_current_user import MywCurrentUser
from myworldapp.core.server.models.myw_application import MywApplication

import myworldapp.core.server.controllers.base.myw_globals as myw_globals


class IndexController:
    """
    Controller for main myWorld page loads
    """

    built_modules_require_config = False

    def __init__(self, request):
        """
        Initialize the index controller.
        """
        self.request = request
        self.current_user = MywCurrentUser(request.session, request.registry.settings)
        self.product = MywProduct()
        self.code_mgr = MywCodeManager(self.product)
        self.dd = myw_globals.dd

    @view_config(route_name="index_controller.base")
    def base(self):
        raise exc.HTTPMovedPermanently(
            self.request.route_url(
                "index_controller.index", _query=self.request.GET, **self.request.matchdict
            )
        )

    @view_config(route_name="index_controller.index", request_method="GET")
    def index(self):
        """
        Called whenever a page is reloaded (GET)
        """

        # Get or re-get permissions (which may have changed since login)
        self.current_user.authenticate(self.request)
        # Check authentication. CSRF token won't be present when coming from redirect from login request
        self.current_user.assertAuthorized(self.request, redirect_on_fail=True, ignore_csrf=True)

        # get names of accessible applications
        app_names = list(self.current_user.applicationNames())

        # Remove applications which are inaccessible to both online and native apps
        # ENH: Replace by parameter to current_user.applicationNames()
        hidden_app_records = Session.query(MywApplication).filter(
            and_(MywApplication.for_online_app == False, MywApplication.for_native_app == False)
        )
        hidden_app_names = [rec["name"] for rec in hidden_app_records]
        available_app_names = list(set(app_names) - set(hidden_app_names))

        # Display initial page
        if len(available_app_names) == 1:
            raise exc.HTTPFound(available_app_names[0] + ".html?" + self.request.query_string)
        else:
            return self.directToHomePage()

    def directToHomePage(self):
        """
        Go to the home page (application launch page)
        """

        template_values = {}

        if self.current_user.name():
            template_values["user"] = self.current_user.name()
            template_values["myworld_version"] = self.product.module("core").version

        template_values["languages"] = ",".join(self.dd.languages)

        self.request.response.text = render("/home.html", template_values)
        return self.request.response

    @view_config(route_name="index_controller.directToApplication")
    def directToApplication(self):
        """
        Jump directly to an application page
        """
        application = self.request.matchdict["application"]

        template_values = {}

        # Add the version information for myWorld (used for JavaScript 'bust' cache invalidation)
        # Note: Could cache values from manager .. but then 'bust' would only update after Apache restart
        # ENH: confirm this is still useful - browsers seem to recognise new versions of bundles
        template_values["myworld_version"] = self.product.module("core").version
        template_values["build_version"] = (
            self.product.module("core").version + "_" + self.product.module("custom").version
        )
        template_values["languages"] = ",".join(self.dd.languages)

        # Hack for tests page
        if application == "tests":
            module_name = (
                self.request.params["module"] if "module" in self.request.params else "dev_db"
            )
            template_values["module"] = module_name
            self.request.response.text = render("/tests.html", template_values)
            return self.request.response

        # Get or re-get permissions (which may have changed since login)
        self.current_user.authenticate(self.request)
        self.current_user.assertAuthorized(
            self.request, application=application, redirect_on_fail=True, ignore_csrf=True
        )

        # Hack for config page
        if application == "config":
            self.request.response.text = render("/config.html", template_values)
            return self.request.response

        # Case Main client - browserApp.html

        # Get layout to use
        layout = ""
        if "layout" in self.request.params:
            if self.request.params["layout"] in ["mobile", "handheld", "phone"]:
                layout = "phone"
            elif self.request.params["layout"] in ["desktop", "standard"]:
                layout = "desktop"
            else:
                layout = self.request.params["layout"]
        elif application == "print":
            layout = "print"

        template_values["user"] = self.current_user.name()
        if self.current_user.email():
            template_values["email"] = self.current_user.email()

        # Set application properties
        app_record = (
            Session.query(MywApplication).filter(MywApplication.name == application).first()
        )

        template_values["application"] = application
        template_values["application_external_name"] = app_record["external_name"]
        template_values["layout"] = layout
        template_values["bundle_js_path"] = self.code_mgr.js_bundle_path_for(
            app_record.javascript_file
        )
        template_values["bundle_css_path"] = self.code_mgr.css_bundle_path_for(
            app_record.javascript_file
        )

        self.request.response.text = render("/browserApp.html", template_values)
        return self.request.response
