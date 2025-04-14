###############################################################################
# Engine for authenticating via LDAP
###############################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import ldap
import ldap.filter
from myworldapp.core.server.base.core.myw_error import MywError
from .myw_auth_engine import MywAuthEngine

# Declare engine class (for dynamic loading - see myw_authenticator)
__auth_engine__ = "MywLdapAuthEngine"


class MywLdapAuthEngine(MywAuthEngine):
    """
    Engine for authenticating via LDAP (Active Directory or similar)

    Authentcates the user in LDAP using a simple bind operation
    and gets the user roles from the groups defined in LDAP.

    Supports use of an optional 'service account' for
    pre-filtering requests (see authenticate)
    """

    # Class constants
    auth_fields = [  # User logins in to myWorld, we validate them
        {"id": "user", "type": "text", "label": "username"},
        {"id": "pass", "type": "password", "label": "password"},
    ]

    def __init__(self, config):
        """
        Init slots of self

        CONFIG is a dict of configuration settings (from .ini file)"""

        super(MywLdapAuthEngine, self).__init__(config)

        options = config["myw.auth.ldap.options"].copy()

        # Extract .ini options
        self.server_type = options.pop("server_type", "ldaps")
        self.server_name = options.pop("server_name")
        self.server_port = options.pop("server_port")
        self.tls_cacertfile = options.pop("tls_cacertfile")
        self.base_dn = options.pop("base_dn")
        self.svc_dn = options.pop("svc_dn")
        self.svc_pw = options.pop("svc_pw")
        self.allow_referrals = options.pop("allow_referrals", True)
        self.recursive = options.pop("recursive", True)
        self.ldap_trace_level = options.pop("ldap_trace_level", 0)

        if options:
            self.progress("warning", "Unknown option:", ",".join(list(options.keys())))

        # Build service connection URL
        self.server_url = "{}://{}:{}".format(self.server_type, self.server_name, self.server_port)
        self._service_con = None  # Init lazily

        # Configure LDAP
        # ENH: Make this local
        ldap.set_option(ldap.OPT_X_TLS_REQUIRE_CERT, ldap.OPT_X_TLS_DEMAND)
        ldap.set_option(ldap.OPT_X_TLS_CACERTFILE, self.tls_cacertfile)
        ldap.set_option(ldap.OPT_REFERRALS, 1 if self.allow_referrals else 0)

        self.progress(2, "Initialised using connect spec", self.server_url)

    def authenticate(self, request):
        """
        Get user name and role names for REQUEST (if any)

        Extracts user_name and password from REQUEST, validates them
        with LDAP server. REQUEST must be a login request.

        Returns dict with keys:
         'user_name'       Name of user
         'roles'           Names of LDAP groups to which user belongs"""

        # If not a login request, cannot authenticate
        (user_name, password) = self.loginInfoFrom(request)
        if not user_name:
            return None

        # LDAP expects bytes
        # ENH: Improve Bytes/String handling
        password = password.encode("utf-8")

        # Construct 'distinguished name' to send to LDAP
        self.progress(3, "Attempting to authenticate user", user_name)

        try:
            # Find user account
            user_details = self.find_user(user_name)

            if not user_details:
                return None

            # Get account info
            account_info = user_details[0][1].get("sAMAccountName")
            if not account_info:
                self.progress(
                    4, "Error: sAMAccountName not found in search result:", user_details[0]
                )
                return None

            # Check password is valid
            user_dn = user_details[0][0]

            if not self.bind_user(user_dn, password):
                return None

            # Gets the username from the user details provided by LDAP
            # This ensures we use the LDAP username in the system regardless
            # of the case-insensitive username entered in the login form
            user_name = account_info[0]

            # If LDAP gave us bytes, convert to string
            # ENH: Improve Bytes/String handling
            try:
                user_name = user_name.decode("utf-8")
            except:
                pass

            # Return user properties
            return {"user_name": user_name, "roles": self.group_names_in(user_details)}

        except ldap.LDAPError as cond:
            self.progress("error", "LDAP Error", cond)
            return None

    def reAuthenticate(self, auth_data, request):
        """
        Check that result from authenticate() is still valid + update permissions

        If successful, returns dict with keys:
         'user_name' Name of user
         'roles'     Names of LDAP groups to which user belongs"""

        try:
            # If no service connection, just assume still valid
            # ENH: Could store user DN and password and re-bind here
            if not self.service_con:
                return auth_data

            # Say what we are doing
            user_name = auth_data["user_name"]
            self.progress(3, "Attempting to re-authenticate user", user_name)

            # Re-get permissions using service account
            user_details = self.find_user(user_name)

            # Check for use no longer exists
            if not user_details:
                return None

            # Return updated permissions
            return {"user_name": user_name, "roles": self.group_names_in(user_details)}

        except ldap.LDAPError as cond:
            print("LDAP: ERROR:", cond)
            return auth_data

    def group_names_in(self, user_details):
        """
        Extract group names from LDAP search result USER_DETAILS (recursive)
        """

        if (len(user_details[0]) < 2) or not "memberOf" in user_details[0][1]:
            return []

        member_dns = user_details[0][1]["memberOf"]
        group_names = []
        cn_names = []

        # For each LDAP group .. get its common name
        # ENH: Safer to use regex
        for member_dn in member_dns:
            member_details = member_dn.decode().split(",")[0].split("=")
            groups = member_details[1]

            group_names.append(groups)

            if member_details[0] == "CN":
                cn_names.append(groups)

        # Check for no more to do
        if not self.recursive:
            return group_names

        # Recurse up the group hierarchy, adding those groups
        for cn_name in cn_names:
            user_details = self.find_user(cn_name)

            if not user_details:
                continue

            group_names += self.group_names_in(user_details)
        return group_names

    @property
    def service_con(self):
        """
        Get the service connection (handling timeout)
        """

        # Check for the service connection no longer alive
        if self._service_con and not self.validate_connection(self._service_con):
            self._service_con = None
            self.progress(3, "Service connection error (timed out?). Reconnecting...")

        # If not already connected .. connect
        if not self._service_con:

            self.progress(3, "Binding service connection using", self.svc_dn)
            self._service_con = ldap.initialize(self.server_url, trace_level=self.ldap_trace_level)
            self._service_con.simple_bind_s(self.svc_dn, self.svc_pw)
            self.progress(2, "Bound service connection")

            self.validate_connection(self._service_con, error_if_bad=True)

        return self._service_con

    def validate_connection(self, con, error_if_bad=False):
        """
        True if the current service connection is valid
        """

        try:
            con.search_s(self.base_dn, ldap.SCOPE_BASE)

        except Exception as cond:

            if error_if_bad:
                raise MywError("Cannot establish service connection:", cond)

            self.progress(4, "Connection validation failed: ", cond)
            return False

        return True

    def find_user(self, user_name):
        """
        Using the service account, get user's details

        Returns LDAP search result (or None if user not found)"""

        self.progress(5, "Searching for user", user_name)

        # We may get user_name bytes from LDAP
        # ENH: Improve Bytes/String handling
        try:
            user_name = str(user_name, "utf-8")
        except:
            pass

        userFilter = "sAMAccountName={}".format(ldap.filter.escape_filter_chars(user_name))
        try:
            user_details = self.service_con.search_s(self.base_dn, ldap.SCOPE_SUBTREE, userFilter)
        except ldap.NO_SUCH_OBJECT:
            user_details = None

        if user_details:
            self.progress(9, "Found user:", user_name, user_details)
        else:
            self.progress(4, "User not found:", user_name)

        return user_details

    def bind_user(self, user_dn, password):
        """
        Authenticates using credentials

        Returns the user's LDAP details (or None if auth failed)
        """

        self.progress(4, "Binding user using:", user_dn)

        # Avoid LDAP error fron empty password
        if password == "":
            self.progress(4, "Cannot bind user: No password supplied")
            return None

        # Authenticate user and get permissions
        con = ldap.initialize(
            self.server_url, trace_level=self.ldap_trace_level
        )  # ENH: Can we cache and reuse this?
        try:
            con.simple_bind_s(user_dn, password)
            return con.search_s(user_dn, ldap.SCOPE_BASE)

        except ldap.INVALID_CREDENTIALS:
            self.progress(5, "Bind failed: Invalid credentials")

        finally:
            con.unbind()

        return None
