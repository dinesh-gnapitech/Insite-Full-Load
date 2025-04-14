###############################################################################
# Engine for authenticating via SAML
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import os

from onelogin.saml2.auth import OneLogin_Saml2_Auth
from onelogin.saml2.utils import OneLogin_Saml2_Error

from .myw_auth_engine import MywAuthEngine

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler

# Declare engine class (for dynamic loading - see myw_authenticator)
__auth_engine__ = "MywSamlAuthEngine"


class MywSamlAuthEngine(MywAuthEngine):
    """
    Engine for authenticating via SAML

    Authenticates the user in LDAP using a simple bind operation
    and gets the user roles from the groups defined in LDAP.
    """

    # Class constants
    auth_fields = []
    auth_controls = [
        {
            "id": "saml-sign-in-btn",
            "type": "submit",
            "label": "saml_sign_in",
            "action": "auth/sso/myw_saml_auth_engine",
        }
    ]

    def __init__(self, config):
        """
        Init slots of self

        CONFIG is a dict of configuration settings (from .ini file)"""

        super(MywSamlAuthEngine, self).__init__(config)

        default_roles_claim = "Role"
        default_user_name_claim = None

        options = config["myw.auth.saml.options"].copy()

        progress_prefix = "INFO: SAML AUTH: "
        progress_level = 3
        self.progress = MywSimpleProgressHandler(progress_level, progress_prefix)

        # Extract .ini options if set.
        if options is not None:
            if "config_dir" in options:
                self.config_dir = options.pop("config_dir")
            self.user_name_claim = options.pop("user_name_claim", default_user_name_claim)
            self.roles_claim = options.pop("roles_claim", default_roles_claim)
        else:
            self.user_name_claim = default_user_name_claim
            self.roles_claim = default_roles_claim

        if not hasattr(self, "config_dir"):
            self.progress("error", "Missing config_dir option in configuration")
            return

    def authenticate(self, request):
        """
        Get user name and role names for REQUEST (if any)

        Extracts user_name and password from REQUEST, validates them
        REQUEST must be a SAML Assertion request

        Returns dict with keys:
         'user_name'       Name of user
         'roles'           Names of SAML roles"""

        self.progress(3, "authenticate via SAML")

        result = self.check_saml_token(request)
        if result is not None:
            result = {"user_name": result["user_name"], "roles": result["roles"]}

        return result

    def reAuthenticate(self, auth_data, request):
        """
        Continue to use the existing auth_data. The SAML life cycle depends on the browser as a mediator, so reauthentication
        requires a redirect to the IdP.

        Recommend a short session lifespan is used in conjunction with SAML, rather than
        reAuthentication"""

        return auth_data

    def singleSignOn(self, request):
        """
        Return the configured single sign on address
        """
        req = self._prepare_pyramid_request(request)
        auth = self._init_saml_auth(req)

        return auth.login()

    def check_saml_token(self, request):
        """
        Check SAMLResponse from identity provider. Sometimes though we might be passed
        an actual IQGeo internal authentication request but which has failed
        engines before the SAML one. So error gracefully
        """

        try:
            return self._check_saml_token(request)

        except (OneLogin_Saml2_Error):
            return None

    def _check_saml_token(self, request):
        """
        Process SAMLResponse, extracting user name and groups.
        """

        req = self._prepare_pyramid_request(request)
        auth = self._init_saml_auth(req)
        errors = []
        error_reason = ""
        not_auth_warn = False
        success_slo = False
        attributes = False
        paint_logout = False

        session = request.session

        self.progress(3, "Processing SAML response")
        self.progress(3, req)

        auth.process_response()
        errors = auth.get_errors()

        not_auth_warn = not auth.is_authenticated()
        if len(errors) == 0:
            UserData = auth.get_attributes()

            # If we have a claim for user_name, find it in the Userdata
            # Otherwise the NameId will be used.
            if self.user_name_claim:
                claim = UserData[self.user_name_claim]
                if len(claim) == 0:
                    self.progress(
                        "error", "User name claim {} is empty".format(self.user_name_claim)
                    )
                    return None
                user_name = claim[0]
            else:
                user_name = auth.get_nameid()

            roles = UserData[self.roles_claim]

            self.progress(3, "user_name is {}".format(user_name))
            self.progress(3, "Roles are {}".format(roles))

            return {"user_name": user_name, "roles": roles}
        else:
            for error in errors:
                self.progress("error", error)

            self.progress("error", "Response contained {} errors".format(len(errors)))
            return None

    def _init_saml_auth(self, req):
        auth = OneLogin_Saml2_Auth(req, custom_base_path=self.config_dir)
        return auth

    def _prepare_pyramid_request(self, request):
        # Uncomment this portion to set the request.scheme and request.server_port
        # based on the supplied `X-Forwarded` headers.
        # Useful for running behind reverse proxies or balancers.
        #
        # if 'X-Forwarded-Proto' in request.headers:
        #    request.scheme = request.headers['X-Forwarded-Proto']
        # if 'X-Forwarded-Port' in request.headers:
        #    request.server_port = int(request.headers['X-Forwarded-Port'])

        return {
            "https": "on" if request.scheme == "https" else "off",
            "http_host": request.host,
            "server_port": request.server_port,
            "script_name": request.path,
            "get_data": request.GET.copy(),
            # Uncomment if using ADFS as IdP, https://github.com/onelogin/python-saml/pull/144
            # 'lowercase_urlencoding': True,
            "post_data": request.POST.copy(),
        }
