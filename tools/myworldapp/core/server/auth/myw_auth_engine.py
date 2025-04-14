###############################################################################
# Superclass for auth engines
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import base64
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler


class MywAuthEngine:
    """
    Abstract superclass for authentication engines

    An authentication engine provides a mechanism for extracting
    user credentials from a request (username and roles) and
    checking that they are valid.

    Subclasses must implement:
      auth_fields                   List of fields to present in a login page. Empty means login isn't supported (or uses controls)
      auth_controls                 List. For SSO auth engines, instead of fields we give a button or something.
      authenticate(request)         Extract user name and role names from a request
      reAuthenticate(data,request)  Check that result from authenticate() is still valid + update permissions

    Subclasses can optionally implement:
      singleSignOn(request)              Initiate an authorization request to id provider. Should return a redirection url for the user to perform authentication
      authenticate_anywhere(request)     Handle redirect from id provider after user has authenticated. Should return url with custom protocol to open Anywhere app
      logout(data)                       Perform logout from the identity provider. Can optionally return a redirection url

    Engines are dynamically imported by file name (see
    myw_authenticator). Each must be in a separate file which
    must declare the engine name using the __auth_engine__
    module property."""

    # Abstract Properties
    auth_fields = []
    auth_controls = []

    def __init__(self, config):
        """
        Init slots of self

        CONFIG is a dict of configuration settings (from .ini file)"""

        engine_name = self.__class__.__module__.split(".")[-1]
        progress_prefix = "INFO: AUTH: {}: ".format(engine_name)
        progress_level = config["myw.auth.options"]["log_level"]

        self.progress = MywSimpleProgressHandler(progress_level, progress_prefix)

    def loginInfoFrom(self, request):
        """
        Extract auth field values from login request REQUEST (if present)

        Returns a tuble with an entry for each value in self.auth_fields e.g.
          (username,password)"""
        # ENH: Return  a dict instead

        # Determine if information is encrypted
        decrypt = False
        if "needs-decrypting" in request.headers:
            decrypt = request.headers["needs-decrypting"].upper() == "TRUE"
        elif "needs-decrypting" in request.POST:
            decrypt = request.POST["needs-decrypting"].upper() == "TRUE"

        # Extract values
        result = ()
        for auth_field in self.auth_fields:
            id = auth_field["id"]
            value = request.headers.get(id) or request.POST.get(id)

            if value != None and decrypt:
                value = base64.decodebytes(value)

            result = result + (value,)

        return result

    @property
    def supports_login(self):
        """
        Returns True if self supports authentication initiated in a login page
        """
        auth_fields = len(self.auth_fields) > 0
        auth_controls = len(self.auth_controls) > 0
        return auth_fields or auth_controls
