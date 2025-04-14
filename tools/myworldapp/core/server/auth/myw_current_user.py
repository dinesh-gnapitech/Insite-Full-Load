################################################################################
# Current User Session
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import os
import hashlib
import time
import traceback
import urllib.request, urllib.parse, urllib.error
from urllib.parse import quote, unquote

from pyramid import httpexceptions as exc
from sqlalchemy import or_

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_lazy_set import MywLazySet
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.models.myw_role import MywRole
from myworldapp.core.server.auth.myw_config_cache import MywConfigCache
from myworldapp.core.server.auth.myw_authenticator import MywAuthenticator


# Cache of MywConfigCaches, keyed by config version + role names
# Preserved across requests .. but not Apache reboots.
config_caches = {}

# Mapping from session id to shared MywConfigCache.
# Avoids saving/loading large amounts of data in beaker session files (slow)
session_caches = {}


class MywCurrentUser:
    """
    Wrapper to the current beaker session

    Provides protocols for authenticating user, checking rights
    and finding accessible objects.

    Internally, caches some application-related and role-related
    info for speed. This means that results do not always match
    what it in the database. To refresh the cached data, use
    .authenticate()

    Internally delegates to MywAuthenticator and MywConfigCache."""

    def __init__(self, session, settings):
        """
        Init slots of self
        """

        # Get config options (from .ini file)
        auth_options = settings.get("myw.auth.options", {})
        login_cookie_options = settings.get("myw.auth.login_cookie", {})
        dev_options = settings.get("myw.dev.options", {})

        # Init slots
        self.session = session
        self._config_cache = session_caches.get(self.session.id)
        self.options = auth_options
        self.login_cookie_options = login_cookie_options
        self.disable_csrf_check = dev_options.get("disable_csrf_check", False)
        self.enable_csrf_get_check = auth_options.get("enable_csrf_get_check", False)
        self.enable_referer_check = auth_options.get("enable_referer_check", False)
        self.disable_reauth_check = auth_options.get("disable_reauth_check", False)
        self._authenticator = None  # Init lazily
        self.progress = MywSimpleProgressHandler(auth_options.get("log_level", 0), "INFO: AUTH: ")

        # Init in-memory cache
        if self._config_cache == None:
            # get the user's session config version, to keep consistency across requests served by different processes
            config_version = self.session.get("config_version", None)
            self._cacheRights(config_version)

    def _cacheRights(self, config_version=None):
        """
        Cache rights data for self's roles
        CONFIG_VERSION is the configuration version in use by the user's session. If provided a configuration for that version will be obtained from shared cache (when available)
        """
        # Note: Must be atomic (to avoid other threads seeing incomplete data)

        self.progress(10, "Getting config cache for user", self.name(), self.session.id)

        if config_version is None:
            config_version = Session.myw_db_driver.versionStamp("myw_server_config")
            self.session["config_version"] = config_version

        # Find pre-built cache for these roles (if there is one)
        key = tuple([config_version] + sorted(self.roleNames()))
        config_cache = config_caches.get(key)

        # If not found, build it
        if config_cache == None:
            self.progress(6, "Building config cache:", key)
            config_cache = config_caches[key] = MywConfigCache(
                Session, self.roleNames(), config_version, self.progress
            )
            self.progress(7, "Built config cache:", key)

        # Associate it with self's session id (for future requests)
        session_caches[self.session.id] = config_cache

        # Set it as self's cache
        self._config_cache = config_cache

    @property
    def config_cache(self):
        """
        Ensures config cache matches the config version for the user's session
        """
        config_version = self.session.get("config_version")
        if self._config_cache.config_version != config_version:
            self.progress(
                9,
                "Updating config cache for user",
                self.name(),
                self.session.id,
                self._config_cache.config_version,
                config_version,
            )
            self._cacheRights(config_version)

        return self._config_cache

    # ==============================================================================
    #                                 AUTHENTICATION
    # ==============================================================================

    def canLogIn(self):
        """
        True if any configured auth engine supports login
        """

        return self.authenticator.canLogIn()

    def logIn(self, auth_request):
        """
        Log in using credentials in auth POST request AUTH_REQUEST

        Returns true if successful"""

        # This results in a new session and cookie
        # ENH: only do this if not SSO (so same session can be kept between the two stages) - could store sso flag in session
        self.session.invalidate()

        return self._authenticate(auth_request, login=True)

    def authenticate(self, request):
        """
        Authenticate or re-authenticate self's session

        If self's session is already logged in, check authentication
        is still valid. Otherwise try to authenticate from info in
        REQUEST. If authentication succeeds, loads and caches
        application properties (accessible features etc).

        Returns true if successful"""

        auth_data = None

        # Case: Logged in: Get info from current login
        if self.isAuthenticated():
            auth_data = {
                "auth_engine": self.session[
                    "auth_engine"
                ],  # ENH: Cache whole structure on session?
                "user_name": self.session["user"],
                "roles": self.session["roles"],
                "auth_engine_metadata": self.session.get("auth_engine_metadata", None),
                "auth_redirect_info": self.session.get("auth_redirect_info", None),
            }

        # Case: Not logged in but have cookie: Fake a login request
        # ENH: Find a cleaner way
        elif self.login_cookie_options["enabled"] and self.login_cookie_options["auto_login"]:
            cookie = request.cookies.get("myworldapp_user_data")

            if cookie:
                parts = unquote(cookie).split("|")
                request.headers["user"] = parts[0]
                request.headers["pass"] = parts[1]

        # Authenticate or re-authenticate
        return self._authenticate(request, auth_data=auth_data)

    def logOut(self):
        """
        Discard any cached authorisation info and delete the session
        Also informs the authenticator of the logout
        """
        auth_engine_name = self.session.get("auth_engine", None)
        auth_engine_metadata = self.session.get("auth_engine_metadata", None)
        self.progress(6, "Logout user:", self.session.get("user", None), auth_engine_name)
        url = None  # SSO logout url

        try:
            url = self.authenticator.logout(auth_engine_name, auth_engine_metadata)
        except Exception as cond:
            self.progress("error", "logout failed:", cond, traceback=traceback)

        # Discard entry from in memory cache
        del session_caches[self.session.id]

        # Remove session info from the session file (so other processes see change)
        self.session.clear()
        self.session.save()

        # Forces beaker to allocate a new session id on next request
        # This prevents problems on linux, where other processes are still holding a
        # the session cache (see Fogbugz)
        # Note: There seems to be a bug in Beaker where the session file is not
        # deleted. This results in a proliferation of session files.
        self.session.delete()

        return url

    def _authenticate(self, request, login=False, auth_data=None):
        """
        Attempt to authenticate using credentials in REQUEST

        Optional LOGIN indicates that REQUEST is a login or Auth POST request
        If optional AUTH_DATA is given, re-authenticate that data

        If authentication succeeds, returns True + caches right etc on self.session"""

        # Clear existing cached data (retaining timout info if re-authenticating)
        last_access = self.session.get("last_access", time.time())
        last_csrf_token = self.session.get("csrf_token")
        last_referer = self.session.get("referer")
        self.session.clear()
        self._cacheRights()  # clear config cache

        # Check credentials and get properties
        if not auth_data:
            auth_data = self.authenticator.authenticate(request, login)
        else:
            auth_data = self.authenticator.reAuthenticate(auth_data, request)

        # If authenticated .. set new properties
        if auth_data:
            self._setAuthData(auth_data, last_access)
            self._setXCsrfCookie(request, last_csrf_token, last_referer)
            self._cacheRights()

        # Save data to disk (to preserve over Apache reboots)
        self.session.save()

        return auth_data != None

    def _setAuthData(self, auth_data, last_access):
        """
        Stash authentication details in the beaker session

        This allows us to check subsequent requests are authorised
        without having to re-authenticate
        """

        # Cache auth data
        self.session["auth_engine"] = auth_data["auth_engine"]
        self.session["user"] = auth_data["user_name"]
        self.session["roles"] = auth_data["roles"]
        # optional auth engine metadata stored on the session:
        self.session["auth_engine_metadata"] = auth_data.get("auth_engine_metadata", "")
        self.session["auth_redirect_info"] = auth_data.get("auth_redirect_info", None)
        self.session["last_access"] = last_access

    def _setXCsrfCookie(self, request, token=None, referer=None):
        """
        Set the cookie that prevents cross site request forgery

        This cookie gets passed back by client in put and post requests"""

        if not token:
            token = hashlib.sha1(os.urandom(128)).hexdigest()
            self.progress(7, "Allocating CSRF token:", token)

        self.progress(6, "Setting CSRF token:", token)
        self.session["csrf_token"] = token

        # Also save address for this request to compare with Referer header as part of CSRF checks
        if not referer:
            (base_url, relative_url) = request.headers.get("Referer", "/").rsplit("/", 1)
            # Note: if this request comes from a new tab, it is possible that base_url is empty.
            # We only ever overwrite a [None or ""] referer here, so it won't be any worse in that
            # case. We will then look for the Referer header in a future request, and overwrite it
            # (since it is ""). See case 23135.
            self.progress(6, "Setting Referer to:", base_url, "request.url:", request.url)
            referer = base_url

        self.session["referer"] = referer

        request.response.set_cookie("csrf_token", token, overwrite=True, samesite="lax")

    def _checkXCsrfToken(self, request):
        """
        True if cross site request forgery token in REQUEST is as expected

        Returns:
          OK
          EXPECTED
          GOT"""

        # Check value
        expected = self.session["csrf_token"]
        got = request.headers.get("X-CSRF-Token")
        ok = expected == got

        # Apply development hack
        if self.disable_csrf_check and not ok:
            self.progress(
                "warning",
                "Skipping bad CSRF (check disabled)",
                ":",
                "Expected",
                expected,
                ":",
                "Got",
                got,
            )
            ok = True

        return ok, expected, got

    def _checkReferer(self, request):
        """
        True if cross site request forgery token in REQUEST is as expected

        Returns:
          OK
          EXPECTED
          GOT"""

        # Check value
        expected = self.session["referer"]
        (got, relative_url) = request.headers.get("Referer", "/").rsplit("/", 1)
        ok = expected == got

        return ok, expected, got

    @property
    def authenticator(self):
        """
        Self's authentication manager
        """
        # Created lazily to avoid unnecessary database reads

        if not self._authenticator:
            self._authenticator = MywAuthenticator(self._allRoles())

        return self._authenticator

    def _allRoles(self):
        """
        Returns names of all myWorld roles
        """

        roles = []
        qry = Session.query(MywRole)
        for role in qry:
            roles.append(role.name)

        return roles

    # ==============================================================================
    #                                  AUTHORISATION
    # ==============================================================================

    def assertAuthorized(
        self,
        request,
        right=None,
        application=None,
        layer_codes=[],
        layer_names=[],
        tile_layer=None,
        feature_type=None,
        redirect_on_fail=False,
        ignore_csrf=False,
        ignore_referer=False,
        require_reauthentication=None,
    ):
        """
        Abort unless current session is authorised to perform REQUEST
        """

        # Check is reauthentication of the request is required - for situations where the user has lost access during the session
        # require_reauthentication takes priority, otherwise reauthenticate if right parameter is defined
        require_reauthentication = (
            right is not None
            if require_reauthentication is None
            else require_reauthentication is True
        )
        if require_reauthentication and not self.disable_reauth_check and self.isAuthenticated():
            auth_data = {
                "auth_engine": self.session["auth_engine"],
                "user_name": self.session["user"],
                "roles": self.session["roles"],
                "auth_engine_metadata": self.session["auth_engine_metadata"],
            }
            grants = self.authenticator.reAuthenticate(auth_data, request)

            if grants == None:
                authResponse = ("", 401, "Reauthentication failed")
                self._rejectRequest(request, authResponse, application, redirect_on_fail)

        authResponse = self._authorized(
            request,
            right=right,
            application=application,
            layer_codes=layer_codes,
            layer_names=layer_names,
            tile_layer=tile_layer,
            feature_type=feature_type,
            ignore_csrf=ignore_csrf,
            ignore_referer=ignore_referer,
        )

        if authResponse is not True:
            self._rejectRequest(request, authResponse, application, redirect_on_fail)

    def _rejectRequest(self, request, authResponse, application=None, redirect_on_fail=False):
        """
        Raise authorization exception
        """

        (junk, reason_code, reason) = authResponse

        self.progress(
            1,
            "REQUEST REJECTED:",
            "user=",
            self.session.get("user"),
            ":",
            "reason=",
            reason,
            ":",
            "request=",
            request.url,
        )

        if redirect_on_fail and self.canLogIn():
            host = request.server_name + ":" + str(request.server_port)  # fogbugz 9015
            query = {
                "params": quote(unquote(request.query_string)),
                "message": reason,
                "redirect_to": quote(application or "index"),
            }
            raise exc.HTTPFound(
                request.route_url("myw_auth_controller.index", _query=query, _host=host)
            )

        raise exc.exception_response(reason_code)

    def authorized(self, request, right=None, application=None, feature_type=None):
        """
        Returns true if current session is authorised to perform REQUEST
        """

        authorized = self._authorized(
            request, right=right, application=application, feature_type=feature_type
        )

        return authorized == True

    def _authorized(
        self,
        request,
        right=None,
        application=None,
        layer_names=[],
        layer_codes=[],
        tile_layer=None,
        feature_type=None,
        ignore_csrf=False,
        ignore_referer=False,
    ):
        """
        Checks if current session is authorised to perform REQUEST

        Returns True or a tuple:
          AUTHORISED
          REASON_CODE
          REASON
        """

        # Check for not logged in
        if not self.isAuthenticated() and not self.authenticate(request):
            return False, 401, ""

        # Check for timed out
        # ENH: Prevent timeout of auto-authenticated sessions (passthorugh etc)
        if self._sessionIsTimedOut():
            return False, 401, "Your session has timed out"

        # If changing database state .. check the cross-site forgery token is as expected
        csfr_relevant_request = self.enable_csrf_get_check or request.method != "GET"
        if csfr_relevant_request and not ignore_csrf:
            (ok, expected, got) = self._checkXCsrfToken(request)
            if not ok:
                return False, 403, "Invalid CSRF token: expected={}: got={}".format(expected, got)

        # where csrf token can't be used check for referer
        if (
            self.enable_referer_check
            and csfr_relevant_request
            and ignore_csrf
            and not ignore_referer
        ):
            (ok, expected, got) = self._checkReferer(request)
            if not ok:
                return (
                    False,
                    403,
                    "Invalid Referer address: expected={}: got={}".format(expected, got),
                )

        # Check application access
        if application and not self.canAccessApplication(application):
            return False, 403, "Not authorised to access application '{}'".format(application)

        # Check data access
        for layer_name in layer_names:
            if not layer_name in list(self.layerDefs().keys()):
                return False, 403, "Not authorised to access layer '{}'".format(layer_name)

        for layer_code in layer_codes:
            if not layer_code in list(self.overlays().keys()):
                return False, 403, "Not authorised to access layer '{}'".format(layer_code)

        if tile_layer and not self.canAccessTileLayer(tile_layer):
            return False, 403, "Not authorised to access tile layer '{}'".format(tile_layer)

        if feature_type and not self.canAccessFeatureType(
            "myworld", feature_type, application_name=application
        ):
            return False, 403, "Not authorised to access feature type '{}'".format(feature_type)

        # Check rights
        if right == "accessApplication":
            pass  # Already tested above

        elif right == "editFeatures":
            if not self.canEditFeatureType("myworld", feature_type):
                return False, 403, "Not authorised to edit feature type '{}'".format(feature_type)

        elif right != None:
            if not self.hasRight(right, application):
                return (
                    False,
                    403,
                    "Does not have right '{}' in application '{}'".format(right, application),
                )

        return True

    def _sessionIsTimedOut(self):
        """
        True if the current session has exceeded the timeout limit
        """

        timeout_hours = self.options["timeout_hours"]

        if timeout_hours == 0:
            return False

        # Get time of last request
        last_access = self.session.get("last_access")
        now = time.time()

        # Check for timeout
        if last_access:
            sec_since_last_access = now - last_access

            if sec_since_last_access > (timeout_hours * 3600):
                return True

        # Update time of last access
        self.session["last_access"] = now
        self.session.save()

        return False

    # ==============================================================================
    #                                   PROPERTIES
    # ==============================================================================

    def name(self):
        """
        Name of current user (if known)
        """

        return self.session.get("user")

    def email(self):
        """
        E-mail address of current user (if known)
        """

        return self.session.get("email")

    def isAuthenticated(self):
        """
        True if self's session is authenticated
        """

        return self.session.get("auth_engine") != None

    def roleNames(self):
        """
        Roles granted to self's session

        These were determined when the user was last authenticated"""

        return self.session.get("roles", [])

    def rights(self, application_name=None):
        """
        Rights (including permissions) granted to self's session

        These were determined when the user was last authenticated"""

        return self.config_cache.rights(application_name)

    def rightNames(self, application_name=None):
        """
        Right names granted to self's session

        These were determined when the user was last authenticated"""

        return self.config_cache.rightNames(application_name)

    def applicationNames(self):
        """
        Names of the applications self's user is authorised to use

        Note: Does not include the config application"""

        return self.config_cache.accessibleApplicationNames()

    def overlays(self):
        """
        Definitions of the overlays user is authorised to access

        Returns a dict of layer definitions, keyed by layer code"""

        return self.config_cache.accessibleOverlays()

    def layerDefs(self, application_name=None):
        """
        Definitions of the layers user is authorised to access

        Returns list of layer definitions keyed by layer name"""

        return self.config_cache.accessibleLayerDefs(application_name)

    def networkDefs(self, application_name=None):
        """
        Definitions of the networks user is authorised to access

        Returns list of network definitions keyed by network name"""

        return self.config_cache.accessibleNetworkDefs(application_name)

    def datasourceDefs(self, application_name=None):
        """
        Definitions of the datasources user is authorised to access

        Returns list of datasource definitions keyed by datasource name"""

        return self.config_cache.accessibleDatasourceDefs(application_name)

    def featureTypes(self, datasource, application_name=None, editable_only=False):
        """
        Names of the feature type in DATASOURCE user is authorised to view (or edit)

        If APPLICATION_NAME is given, return just items accessible to that application"""

        # ENH: Get rid of DATASOURCE arg, return a dist of lists?

        if editable_only:
            feature_defs = self.config_cache.editableFeatureTypeDefs(application_name)
        else:
            feature_defs = self.config_cache.accessibleFeatureTypeDefs(application_name)

        feature_types = set()
        for feature_key in feature_defs:
            (feature_datasource, feature_type) = feature_key

            if feature_datasource == datasource:
                feature_types.add(feature_type)

        return feature_types

    def featureTypeDefs(self, application_name=None):
        """
        Feature types that self's user is authorised to view (or edit)

        If APPLICATION_NAME is given, return just items accessible to that application

        Returns a list of partial feature definitions, keyed by (datasource,feature_type)"""

        return self.config_cache.accessibleFeatureTypeDefs(application_name)

    # ==============================================================================
    #                                RIGHTS TESTS
    # ==============================================================================

    def hasRight(self, right_name, application_name=None):
        """
        True if self's session has right RIGHT_NAME
        """

        return right_name in self.rightNames(application_name)

    def canAccessApplication(self, application):
        """
        True if self's session has permission to use APPLICATION
        """

        return application in self.config_cache.accessibleApplicationNames()

    def canAccessTileLayer(self, tile_layer, application_name=None):
        """
        True if self's session has rights to view LAYER
        """

        return tile_layer in self.config_cache.accessibleTileLayers(application_name)

    def canAccessFeatureType(self, datasource, feature_type, application_name=None):
        """
        True if self's session has rights to view FEATURE_TYPE
        """

        return feature_type in self.featureTypes(datasource, application_name, False)

    def canEditFeatureType(self, datasource, feature_type, application_name=None):
        """
        True if self's session has rights to modify FEATURE_TYPE
        """

        return feature_type in self.featureTypes(datasource, application_name, True)

    # ==============================================================================
    #                                    OTHER
    # ==============================================================================

    def sessionVars(self, **custom_vars):
        """
        Build set of session variables for use in predicate evaluation

        Adds values for server-side session variables"""

        application_name = custom_vars.get("application")

        # Returns a MywLazySet to avoid unnecessary database queries
        # ENH: Cache group_ids (per user) and return a dict
        vars = MywLazySet()

        # Add custom variables
        for key, value in list(custom_vars.items()):
            vars.add(key, value)

        # Add server-side values (last, to prevent spoofing)
        vars.add("user", self.name())
        vars.add("roles", self.roleNames())
        vars.add("rights", self.rightNames(application_name))
        vars.add("groups", self.groupIds, lazy=True)

        return vars

    def groupIds(self):
        """
        Ids of the groups of which self is a member
        """
        # ENH: Cache this per-user (clearing when user_data version stamp changes)

        from myworldapp.core.server.models.myw_group_item import MywGroupItem

        recs = Session.query(MywGroupItem).filter(MywGroupItem.username == self.name())
        group_ids = [rec.group_id for rec in recs]

        return group_ids

    def featureTypeFilter(self, application_name, datasource, feature_type, filter_name):
        """
        Returns filter FILTER_NAME for FEATURE_TYPE (handling missing filter)

        Returns a MywDbPredicate"""

        from myworldapp.core.server.base.db.myw_db_predicate import MywDbPredicate

        feature_def = self.featureTypeDef(application_name, datasource, feature_type)

        pred = feature_def["filter_preds"].get(filter_name)

        if pred is None:
            self.progress("warning", feature_type, ":", "Missing filter:", filter_name)
            pred = MywDbPredicate.false

        return pred

    def featureTypeDef(self, application_name, datasource, feature_type):
        """
        Partial feature type definition for FEATURE_TYPE in APPLICATION_NAME
        """
        # Just for convenience

        feature_defs = self.featureTypeDefs(application_name)

        return feature_defs.get((datasource, feature_type))

    def extractsConfig(self):
        """
        Get extract configuration for extracts user is authorised to access
        """
        # ENH: Cache this per-user (clearing when roles change)
        recs = []
        from myworldapp.core.server.models.myw_extract_config import MywExtractConfig

        roles = self.roleNames()
        recs = (
            Session.query(MywExtractConfig)
            .filter(or_(MywExtractConfig.role_name.in_(roles), MywExtractConfig.role_name == "all"))
            .all()
        )

        extract_names = [rec.extract_name for rec in recs]

        # check if there's access to all extracts
        access_to_all = any([name == "all" for name in extract_names])

        # create entry for each extract with base configuration
        base_config = {}
        base_recs_query = Session.query(MywExtractConfig).filter(MywExtractConfig.role_name == None)
        if not access_to_all:
            base_recs_query.filter(MywExtractConfig.extract_name.in_(extract_names))
        for rec in base_recs_query:
            base_config[rec.extract_name] = {
                "name": rec.extract_name,
                "folder_name": rec.folder_name,
                "expiry_time": rec.expiry_time,
                "writable_by_default": rec.writable_by_default,
            }

        # if user has access to all extracts, initialise result with all base configurations
        extracts_config = base_config if access_to_all else {}

        # if there is a specific config, use its details
        for rec in recs:
            name = rec.extract_name
            if not name in base_config:
                continue
            extract = base_config[name]
            extracts_config[name] = extract
            # ENH: consider multiple entries for different roles -> merge expiry time, etc...
            if rec.expiry_time:
                extract["expiry_time"] = rec.expiry_time
            if rec.writable_by_default:
                extract["writable_by_default"] = rec.writable_by_default
            if rec.folder_name:
                extracts_config["folder_name"] = rec.folder_name

        return list(extracts_config.values())
