################################################################################
# Controller for authentication requests
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from urllib.parse import quote, unquote
from pyramid.renderers import render
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.system.myw_code_manager import MywCodeManager

import myworldapp.core.server.controllers.base.myw_globals as myw_globals

from myworldapp.core.server.controllers.base.myw_controller import MywController


class MywAuthController(MywController):
    """
    Controller for authentication requests
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        MywController.__init__(self, request)

        self.product = MywProduct()
        self.code_mgr = MywCodeManager(self.product)
        self.dd = myw_globals.dd

    @view_config(
        route_name="myw_auth_controller.auth_options", request_method="GET", renderer="json"
    )
    def auth_options(self):
        """
        Returns the options for constructing a login page
        """
        return self._login_info()

    @view_config(route_name="myw_auth_controller.index", request_method="GET")
    def index(self):
        """
        Display the login page
        """

        # Clear any cached auth info
        prev_username = self.current_user.name()
        self.current_user.logOut()

        # Check for no auth engine supports login
        if not self.current_user.canLogIn():
            raise exc.HTTPNotFound()

        template_values = {}

        # Set values controlling auto login behaviour
        login_info = self._login_info(prev_username)
        auth_fields = login_info.get("auth_fields", [])
        auth_controls = login_info.get("auth_controls", [])
        conn_auth_controls = [el for el in auth_controls if not el.get("anywhere7", False)]
        if len(auth_fields) == 0 and len(conn_auth_controls) == 1:
            # only one engine with a control (SSO) - redirect straight to the auth provider
            auth_engine_name = auth_controls[0]["auth_engine_name"]
            return self.single_sign_on(auth_engine_name)

        template_values["login_info"] = quote(json.dumps(login_info))
        template_values["languages"] = ",".join(self.dd.languages)

        template_values["myworld_version"] = self.product.module("core").version

        self.request.response.text = render("/login.html", template_values)
        return self.request.response

    def _login_info(self, prev_username=None):
        """
        Returns the options for constructing a login page

        Returns a dict"""

        # ENH: Are message_id etc really required?

        settings = self.request.registry.settings
        login_cookie_opts = settings.get("myw.auth.login_cookie")

        return {
            "auth_fields": self.current_user.authenticator.authFields(),
            "auth_controls": self.current_user.authenticator.authControls(),
            "use_login_cookie": login_cookie_opts.get("enabled", False),
            "login_cookie_timeout_hours": login_cookie_opts.get("timeout_hours", 0),
            "message_id": self.request.params.get("message_id"),
            "message": self.request.params.get("message"),
            "user": self.request.params.get("user") or prev_username,
            "redirect_to": self.request.params.get("redirect_to") or "index",
            "params": quote(self.request.params.get("params", "")),
        }

    @view_config(route_name="myw_auth_controller.authenticate", request_method=("GET", "POST"))
    def authenticate(self):
        """
        Takes a GET/POST request and attempts to authenticate based upon the content.

        Request may be from login page ('interactive') or another system.
        Parameters can either be a part of the query or within the
        headers (auth engines know which to look for).

        If redirect_to parameter is include in request, redirects to that application.
        Otherwise just returns CSRF token"""

        # Unpick redirect info
        redirect_to = self.request.params.get("redirect_to", "")
        url_params = self.request.params.get("params", "")

        # Determine if this is a brower connection or machine-to-machine
        # ENH: We want to allow for redirect_to to be removed for OIDC, in the future check for state param as well.
        interactive = redirect_to != ""

        # Prevent host header attack (see Fogbugz 9015)
        host = self.request.server_name + ":" + str(self.request.server_port)

        # Authenticate using info from request
        if not self.current_user.logIn(self.request):

            if not interactive:
                raise exc.HTTPUnauthorized()

            query = {
                "params": url_params,
                "message_id": "invalid_credentials",
                "user": self.request.params.get("user") or "",
                "redirect_to": redirect_to,
            }
            raise exc.HTTPFound(
                self.request.route_url("myw_auth_controller.index", _query=query, _host=host)
            )

        # If not interactive, just return CSRF token
        if not interactive:
            self.request.response.text = self.request.session["csrf_token"]
            return self.request.response

        # Prevent HTTP response splitting attacks
        application = unquote(redirect_to)

        auth_redirect_info = self.current_user.session.get("auth_redirect_info")

        if auth_redirect_info is not None:
            # The redirect_to stored in auth_meta_data overrides the one in the request
            if "redirect_to" in auth_redirect_info:
                application = unquote(auth_redirect_info["redirect_to"])

            # The param stored in auth_meta_data overrides the one in the request
            if "params" in auth_redirect_info:
                url_params = unquote(auth_redirect_info["params"])

        permitted_redirects = self.current_user.applicationNames() + ["index"]
        if not application in permitted_redirects:

            query = {
                "params": url_params,
                "message_id": "app_not_authorized",
                "user": self.request.params.get("user") or "",
                "redirect_to": redirect_to,
            }
            raise exc.HTTPFound(
                self.request.route_url("myw_auth_controller.index", _query=query, _host=host)
            )

        # Redirect to requested application
        self.request.host = host
        if application == "index":
            raise exc.HTTPFound(self.request.route_url("index_controller.index"))
        else:
            # Convert the passed in params string to a format where it can be processed by Pyramid, then forward that to the next request
            extra_params = unquote(url_params)
            raise exc.HTTPFound(
                self.request.route_url(
                    "index_controller.directToApplication",
                    application=application,
                    _query=extra_params,
                )
            )

    @view_config(route_name="myw_auth_controller.single_sign_on", request_method=("GET", "POST"))
    def single_sign_on(self, auth_engine_name=None):
        """
        Takes a POST request specifying an auth engine and redirects its single-sign-on page
        """
        auth_engine_name = auth_engine_name or self.request.matchdict["engine"]

        # ENH: invalidate request.session at this point (start of auth process) (through new method in currentUser?)

        location = None
        try:
            location = self.current_user.authenticator.singleSignOn(auth_engine_name, self.request)
        except Exception as e:
            print("Failed to get single-sign-on address from auth engine: ", auth_engine_name, e)

        if location:
            return exc.HTTPFound(location)
        else:
            return exc.HTTPNotFound()

    @view_config(
        route_name="myw_auth_controller.authenticate_anywhere", request_method=("GET", "POST")
    )
    def authenticate_anywhere(self):
        """
        Handle redirect from IdP after user has authenticated
        Redirects to custom url protocol that will open the Anywhere app
        """
        auth_engine_name = self.request.matchdict["engine"]
        try:
            location = self.current_user.authenticator.authenticate_anywhere(
                auth_engine_name, self.request
            )
        except Exception as e:
            print("Failed to redirect to Anywhere from auth engine: ", auth_engine_name, e)
            return exc.HTTPNotFound()

        if location:
            languages = ",".join(self.dd.languages)
            template_values = {"anywhere_url": location, "languages": languages}
            self.request.response.text = render("/anywhere_sso.html", template_values)
            return self.request.response
        else:
            return exc.HTTPNotFound()

    @view_config(route_name="myw_auth_controller.attach", request_method="POST")
    def attach(self):
        """
        Takes a POST request containing a session ID and returns response attached to that session.

        Used by the Native App to 'attach' the JavaScript connection
        to the same session as the native code is using
        """

        # Unpick parameters
        target_cookies = json.loads(self.request.params.get("cookies"))
        target_session_id = target_cookies.get(self.request.session.key)

        # TODO: Check session is good and CSRF matches (by faking a request) e.g.
        # self.request.cookies[session.key] = target_session_id
        # self.current_user.assertAuthorized(self.request)

        # Attach the response to the new session (that can be used for future requests)
        self.request.response.set_cookie(self.request.session.key, target_session_id)
        return self.request.response

    @view_config(route_name="myw_auth_controller.logout", request_method="GET")
    def logout(self):
        """
        Clears session and returns login page.
        """

        # request is from an href so won't include CSRF token -> can't do CSRF check
        self.current_user.assertAuthorized(self.request, ignore_csrf=True)

        # Clear any cached auth info. auth engine can return a redirect url
        redirect_url = self.current_user.logOut()
        if not redirect_url:
            redirect_url = self.request.route_url("myw_auth_controller.index")

        # Give user chance to log in as someone else
        raise exc.HTTPFound(redirect_url)
