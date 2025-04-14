###############################################################################
# Engine for authenticating via a Web Access Manager
###############################################################################
# Copyright: IQGeo Limited 2010-2023

from .myw_auth_engine import MywAuthEngine

# Declare engine class (for dynamic loading - see myw_authenticator)
__auth_engine__ = "MywPassthroughAuthEngine"


class MywPassthroughAuthEngine(MywAuthEngine):
    """
    Engine for authenticating via a web access manager (WAM)

    The WAM injectes user name and roles into the HTTP request
    header. This engine just extracts the info, if present."""

    # Class constants
    auth_fields = []  # Users log in to WAM, not myWorld

    def __init__(self, config):
        """
        Init slots of self

        CONFIG is a dict of configuration settings (from .ini file)"""

        super(MywPassthroughAuthEngine, self).__init__(config)

        self.options = config["myw.auth.passthrough.options"]

        self.progress(2, "Initialised with options", self.options)

    def authenticate(self, request):
        """
        Gets user name and role names for REQUEST (if authenticated)

        Just extracts auth info from request header, if present.
        Names for header keys to check are set in server config file.

        Return dict with keys:
         'user_name'       Name of user
         'roles'           Names of WAM groups to which user belongs
        """

        user_header = self.options["user_header_name"]
        group_header = self.options["group_header_name"]

        self.progress(3, "Attempting to authenticate")
        if not user_header in request.headers or not group_header in request.headers:
            self.progress(4, "Request header does not contain passthrough info")
            self.progress(5, "Header keys:", list(request.headers.keys()))
            return None

        # Build list of role names (group common names)
        # ENH: Use regex
        auth_string = request.headers[group_header]
        role_string_array = auth_string.split("^")
        roles = []
        for role_string in role_string_array:
            role_detail_array = role_string.split(",")

            for role_detail in role_detail_array:
                role_detail_attr = role_detail.split("=")

                if "cn" in role_detail_attr or "CN" in role_detail_attr:
                    roles.append(role_detail_attr[1])

        return {"user_name": request.headers[user_header], "roles": roles}

    def reAuthenticate(self, auth_data, request):
        """
        Check that result from authenticate() is still valid + update permissions

        If successful, returns dict with keys:
         'user_name' Name of user
         'roles'     Names of myWorld roles to which user belongs"""

        # Just re-get info from request headers (if still present)
        return self.authenticate(request)
