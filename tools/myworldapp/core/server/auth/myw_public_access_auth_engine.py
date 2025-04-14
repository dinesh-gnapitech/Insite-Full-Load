###############################################################################
# Engine for pre-configured (fixed) authentication
###############################################################################
# Copyright: IQGeo Limited 2010-2023

from .myw_auth_engine import MywAuthEngine

# Declare engine class (for dynamic loading - see myw_authenticator)
__auth_engine__ = "MywPublicAccessAuthEngine"


class MywPublicAccessAuthEngine(MywAuthEngine):
    """
    Engine for pre-configured (fixed) authentication

    All requests are authenticated using the same username and
    role names (set in config file)
    """

    # Class constants
    auth_fields = []  # Everyone gets same credentials, so no point in logging in

    def __init__(self, config):
        """
        Init slots of self

        CONFIG is a dict of configuration settings (from .ini file)"""

        super(MywPublicAccessAuthEngine, self).__init__(config)

        self.options = config["myw.auth.public_access.options"]

    def authenticate(self, request):
        """
        Get user name and role names for REQUEST (if valid)

        Just returns the user name and roles configured in the config file

        Return dict AUTH_DATA with key
         'user_name'       Name of user
         'roles'           Names of myWorld roles to which user belongs
        """

        return {"user_name": self.options["user"], "roles": self.options["roles"]}

    def reAuthenticate(self, auth_data, request):
        """
        Check that result from authenticate() is still valid + update permissions

        If successful, returns dict with keys:
         'user_name' Name of user
         'roles'     Names of myWorld roles to which user belongs"""

        # Just return currently configured user and roles
        return self.authenticate(request)
