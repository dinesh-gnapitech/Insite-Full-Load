###############################################################################
# Engine for authenticating against table myw.user
###############################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import logging
import hashlib
from sqlalchemy.sql import and_

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_user import MywUser
from .myw_auth_engine import MywAuthEngine

log = logging.getLogger(__name__)

# Declare engine class (for dynamic loading - see myw_authenticator)
__auth_engine__ = "MywInternalAuthEngine"


class MywInternalAuthEngine(MywAuthEngine):
    """
    Engine for authenticating against user credentials stored in the myWorld database
    """

    # Parameters expected in login requests
    auth_fields = [
        {"id": "user", "type": "text", "label": "username"},
        {"id": "pass", "type": "password", "label": "password"},
    ]

    def authenticate(self, request):
        """
        Get user name and role names for REQUEST (if valid)

        Extracts user_name and password from REQUEST, validates them
        with LDAP server. REQUEST must be a login request.

        If successful, returns dict with keys:
         'user_name'       Name of user
         'roles'           Names of myWorld roles to which user belongs"""

        # Get login info
        (user_name, password) = self.loginInfoFrom(request)

        # Check for not a login request
        if not user_name:
            self.progress(4, "No user name in request")
            return None

        # Find user record
        self.progress(3, "Attempting to authenticate user", user_name)
        user = self.findUser(user_name)
        if user is None:
            self.progress(4, "No such user:", user_name)
            return None

        # Check password
        try:
            md5_password = hashlib.md5(password.encode("utf-8")).hexdigest()
            if not user.password == md5_password:
                self.progress(4, "Password wrong")
                return None
        except Exception as cond:
            self.progress(4, "Error during password validation", cond)
            return None

        # Return rights
        return {"user_name": user.username, "roles": user.role_names()}

    def reAuthenticate(self, auth_data, request):
        """
        Check that result from authenticate() is still valid + update permissions

        If successful, returns dict with keys:
         'user_name' Name of user
         'roles'     Names of myWorld roles to which user belongs"""

        user_name = auth_data["user_name"]
        self.progress(3, "Attempting to re-authenticate user", user_name)

        # Check user is still valid
        # ENH: Cache password in auth data and check it here
        user = self.findUser(user_name)
        if user is None:
            return None

        return {"user_name": user.username, "roles": user.role_names()}

    def findUser(self, name):
        """
        Returns user record for NAME (if it exists and is not locked out)
        """

        query = and_(MywUser.username == name, MywUser.locked_out == False)

        return Session.query(MywUser).filter(query).first()
