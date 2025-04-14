################################################################################
# Authenticator
################################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict
from pyramid import threadlocal
import traceback
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError


# Construct engines (from list defined in .ini file)
auth_engines = OrderedDict()


def initAuthEngines():
    registry = threadlocal.get_current_registry()
    # error logging setup:
    progress_level = registry.settings["myw.auth.options"]["log_level"]
    progress = MywSimpleProgressHandler(progress_level, "INFO: AUTH_INIT:")

    for auth_engine_module in registry.settings["myw.auth.engines"]:
        try:
            # First, try to import from the core server auth folder. If it fails, try to import from other modules
            auth_class = "myworldapp.core.server.auth.{}".format(auth_engine_module)
            engine_module = __import__(auth_class, globals(), locals(), fromlist=("myworldapp"))
        except ModuleNotFoundError:
            engine_module = __import__(
                auth_engine_module, globals(), locals(), fromlist=("myworldapp")
            )
        engine_class = getattr(engine_module, engine_module.__auth_engine__)
        try:
            auth_engines[auth_engine_module] = engine_class(registry.settings)
        except Exception as e:
            # Log that initialising this auth engine failed, and why:
            progress("error", f"Failed to initialise {auth_engine_module}, {str(e)}")


class MywAuthenticator:
    """
    Engine for authenticating a user's credentials

    Internally, delegates work to the configured list of
    auth_engines."""

    def __init__(self, role_names):
        """
        Init slots of self

        ROLE_NAMES is the list of myWorld roles. A user must have at
        least one of these granted for authentication to succeed"""

        self.role_names = role_names

        if len(auth_engines) == 0:
            initAuthEngines()

    def canLogIn(self):
        """
        True if any of the configured auth engines support login
        """

        for auth_engine in list(auth_engines.values()):
            if auth_engine.supports_login:
                return True

        return False

    def authFields(self):
        """
        Returns the login fields details for the configured auth engines
        """
        auth_fields = OrderedDict()

        for auth_engine in list(auth_engines.values()):
            if hasattr(auth_engine, "auth_fields"):
                for field in auth_engine.auth_fields:
                    auth_fields[field["id"]] = field

        return list(auth_fields.values())

    def authControls(self):
        """
        Returns the login fields details for the configured auth engines
        """
        auth_controls = OrderedDict()

        for auth_engine_name, auth_engine in auth_engines.items():
            if hasattr(auth_engine, "auth_controls"):
                for control in auth_engine.auth_controls:
                    auth_controls[control["id"]] = control
                    control["auth_engine_name"] = auth_engine_name

        return list(auth_controls.values())

    def authenticate(self, request, login=False):
        """
        Attempt to authenticate REQUEST using configured authorisation engines

        Option LOGIN indicates that REQUEST is a login or auth POST request

        If successful, returns dict with keys:
         'user_name'       Name of user
         'roles'           Names of myWorld roles to which user belongs"""

        # For each configured engine ..
        for (auth_engine_name, auth_engine) in list(auth_engines.items()):

            # Prevent passthrough etc from operating on login page requests
            if login and not auth_engine.supports_login:
                continue

            # Attempt to validate the credentials
            auth_data = self.perform(auth_engine, "authenticate", request)
            if not auth_data:
                continue

            # Find roles we recognise
            auth_data["roles"] = self.myworldRolesIn(auth_data["roles"])

            # Check for empty roles list
            if not auth_data["roles"]:
                auth_engine.progress(2, "User valid but has no myWorld roles granted")
                auth_engine.progress(9, "User roles were:", " ".join(auth_data["roles"]))
                continue

            # Success
            auth_engine.progress(1, "Authentication succeeded", auth_data)
            auth_data["auth_engine"] = auth_engine_name
            return auth_data

        return None

    def reAuthenticate(self, auth_data, request):
        """
        Check that result from authenticate() is still valid + update permissions

        If successful, returns dict with keys:
         'user_name' Name of user
         'roles'     Names of myWorld roles to which user belongs"""

        auth_engine_name = auth_data["auth_engine"]

        # Get engine that did the initial authentication (if still valid)
        auth_engine = auth_engines.get(auth_engine_name)
        if not auth_engine:
            return None

        # Re-authenticate (and get new roles)
        auth_data = self.perform(auth_engine, "reAuthenticate", auth_data, request)
        if not auth_data:
            return None

        # Find roles we recognise
        auth_data["roles"] = self.myworldRolesIn(auth_data["roles"])

        # Check for empty roles list
        if not auth_data["roles"]:
            auth_engine.progress(2, "User valid but has no roles granted")
            return None

        # Success
        auth_engine.progress(2, "Re-authentication succeeded", auth_data)
        auth_data["auth_engine"] = auth_engine_name
        return auth_data

    def singleSignOn(self, auth_engine_name, request):
        """
        Obtain the single sign on details from the given auth engine
        """
        auth_engine = auth_engines.get(auth_engine_name)

        if not auth_engine:
            return None

        return self.perform(auth_engine, "singleSignOn", request)

    def authenticate_anywhere(self, auth_engine_name, request):
        """
        Handle redirect from IdP after user has authenticated
        Redirects to custom url protocol that will open the Anywhere app
        """
        auth_engine = auth_engines.get(auth_engine_name)

        if not auth_engine:
            return None

        return self.perform(auth_engine, "authenticate_anywhere", request)

    def logout(self, auth_engine_name, metadata):
        """
        Checks if the given auth engine implements logout and calls it if so
        Returns a logout url returned by the engine
        """
        if not auth_engine_name:
            return None

        auth_engine = auth_engines.get(auth_engine_name)
        if not auth_engine:
            return None

        if hasattr(auth_engine, "logout"):
            try:
                return auth_engine.logout(metadata)
            except Exception as cond:
                auth_engine.progress("error", "logout failed:", cond, traceback=traceback)

    def perform(self, auth_engine, meth_name, *args):
        """
        Run method METH_NAME on AUTH_ENGINE, handling errors
        """

        meth = getattr(auth_engine, meth_name)

        try:
            return meth(*args)

        except MywError as cond:
            auth_engine.progress("error", meth_name, "failed:", cond)

        except Exception as cond:
            auth_engine.progress("error", meth_name, "failed:", cond, traceback=traceback)

        return None

    def myworldRolesIn(self, role_names):
        """
        Returns the myWorld roles in ROLE_NAMES
        """

        myw_role_names = set()

        for role_name in role_names:
            if role_name in self.role_names:
                myw_role_names.add(role_name)

        return sorted(myw_role_names)
