# ==============================================================================
#  Server startup
# ==============================================================================
import os, sys, warnings

from paste.deploy.converters import asbool

from sqlalchemy import exc, engine_from_config

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.globals import Session, init_session
from myworldapp.core.server.base.system.myw_product import MywProduct

import myworldapp.core.server.controllers.base.myw_globals as myw_globals
from .myw_pyramid_app import MywPyramidApp


def make_app(global_conf, full_stack=True, static_files=True, **app_conf):
    """
    Init the application. Main entry point for server initialisation.

    Gets called from WSGI. Declared as main entry point in egg.

    GLOBAL_CONF
       The inherited configuration for this application. Normally from
       the [DEFAULT] section of the Paste ini file.

    FULL_STACK
       Whether this application provides a full WSGI stack (by default,
       meaning it handles its own exceptions and errors). Disable
       full_stack when this application is "managed" by another WSGI
       middleware.

    STATIC_FILES
       Whether this application serves its own static files; disable
       when another web server is responsible for serving them.

    APP_CONF
       The application's local configuration. Normally specified in
       the [app:<name>] section of the Paste ini file (where <name>
       defaults to main). A dict of strings

    Returns a MywPyramidApp"""

    # WARNING: This method gets called twice if the WSGIImportScript directive is used in httpd.conf

    # Suppress benign SQLalchemy warnings
    warnings_to_suppress = [
        "Did not recognize type 'geometry'",
        "Skipped unsupported reflection of expression-based index",
        "The classname '.*' is already in the registry of this declarative base",
    ]

    warnings.filterwarnings(
        "ignore", category=exc.SAWarning, message="|".join(warnings_to_suppress)
    )

    # Configure Pyramid paths, routing map etc
    init_environment(global_conf, app_conf, static_files)

    myw_globals.initGlobals(app_conf)

    # Create the Pyramid WSGI app
    app = MywPyramidApp(config=app_conf)

    # CUSTOM MIDDLEWARE HERE (filtered by error handling middlewares)
    return app


def init_environment(global_conf, app_conf, static_files):
    """
    Init the Pyramid environment
    """

    # Configure pyramid paths
    root = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
    app_conf["pyramid.debug_all"] = asbool(global_conf["debug"])
    app_conf["pyramid.paths"] = dict(
        root=root,
        controllers=os.path.join(root, "core", "server", "controllers"),
        static_files=os.path.join(root, "public"),
        templates=[os.path.join(root, "core", "templates")],
    )

    app_conf["use_static_files"] = asbool(static_files)

    # Convert myWorld pyramid config to structures (here, to find errors early)
    for var_name in app_conf:
        if var_name.startswith("myw."):
            try:
                app_conf[var_name] = eval(app_conf[var_name])
            except Exception as cond:
                msg = ".ini file: {}: {}".format(var_name, cond)
                raise Exception(msg)

    # Set myWorld config backstops
    if not "myw.auth.engines" in app_conf:
        app_conf["myw.auth.engines"] = ["myw_internal_auth_engine"]

    if not "myw.auth.options" in app_conf:
        app_conf["myw.auth.options"] = {"timeout_hours": 0, "log_level": 0}

    if not "myw.auth.login_cookie" in app_conf:
        app_conf["myw.auth.login_cookie"] = {
            "enabled": False,
            "timeout_hours": 48,
            "auto_login": True,
        }

    if "myw.upload_cache" not in app_conf:
        app_conf["myw.upload_cache"] = os.path.join(app_conf["cache_dir"], "upload_cache")

    # Add myWorld globals (for finding controllers etc)
    app_conf["myw.product"] = MywProduct()

    # Create the Mako Settings, with the default auto-escaping
    app_conf["mako.directories"] = app_conf["pyramid.paths"]["templates"]
    # app_conf['mako.error_handler'] = handle_mako_error
    app_conf["mako.module_directory"] = os.path.join(app_conf["cache_dir"], "templates")
    app_conf["mako.input_encoding"] = "utf-8"
    app_conf["mako.default_filters"] = ["escape"]
    app_conf["mako.imports"] = ["from markupsafe import escape"]

    # Fill in any missing session information depending on what is in the settings file
    if "beaker.session.type" not in app_conf:
        app_conf["beaker.session.type"] = "file"

    if app_conf["beaker.session.type"] == "ext:database":
        if "beaker.session.url" not in app_conf:
            app_conf["beaker.session.url"] = app_conf["sqlalchemy.url"]

        if "beaker.session.schema_name" not in app_conf:
            app_conf["beaker.session.schema_name"] = "myw"

    # Setup where to store rendered mako templates and sessions if we're using files
    if "beaker.session.data_dir" not in app_conf:
        app_conf["beaker.session.data_dir"] = os.path.join(app_conf["cache_dir"], "sessions")

    # Flag if a distributed beaker cache has been configured
    has_distributed_cache = (
        app_conf["beaker.session.type"] == "ext:redis"
        or app_conf["beaker.session.type"] == "ext:memcached"
    )

    # Rename beaker settings for Pyramid
    app_conf_keys = [k for k in app_conf]
    for key in app_conf_keys:
        if key.startswith("beaker."):
            new_key = key[7:]
            app_conf[new_key] = app_conf.pop(key)

    # Verify beaker.session.type is distributed if oidc is enabled.
    uses_oidc_auth_engine = "myw_oidc_auth_engine" in app_conf["myw.auth.engines"]
    if uses_oidc_auth_engine and not has_distributed_cache:
        sys.exit(
            "ERROR: Invalid Auth configuration: OIDC auth engine requires a distributed cache either Redis or Memcached"
        )

    # Setup the SQLAlchemy database engine
    engine = engine_from_config(app_conf, "sqlalchemy.")
    init_session(Session, engine)

    # Setup HTTP PROXY environment if specified in .ini file
    if "https_proxy" in app_conf:
        os.environ["HTTPS_PROXY"] = app_conf["https_proxy"]
    if "http_proxy" in app_conf:
        os.environ["HTTP_PROXY"] = app_conf["http_proxy"]
