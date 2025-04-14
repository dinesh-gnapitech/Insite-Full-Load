# Copyright: IQGeo Limited 2010-2023

import logging
import os
import re
from pyramid.config import Configurator as PyramidConfig
from pyramid_beaker import session_factory_from_settings

from myworldapp.core.server.startup.myw_routing_handler import MywRoutingHandler
from myworldapp.core.server.base.core.myw_decorator import MywJsonEncoderFactory
from myworldapp.core.server.base.db.globals import Session

log = logging.getLogger("myworldapp")


class MywPyramidApp:
    """
    The Pyramid application object

    Subclassed to support loading custom controllers from myWorld modules
    """

    def __init__(self, config):
        self.config = config
        self._controllers_to_load = []

        session_factory = session_factory_from_settings(self.config)
        with PyramidConfig(settings=self.config, session_factory=session_factory) as config:
            config.include("myworldapp.core.server.startup.myw_pyramid_app_config")

            # Bind all HTML files to use the Mako renderer
            config.include("pyramid_mako")
            config.add_mako_renderer(".html")

            # Setup beaker for session storage
            config.include("pyramid_beaker")

            # Intercept the default JSON renderer and use our own
            config.add_renderer("json", MywJsonEncoderFactory())

            # Find any routing.py files and load them in
            self.load_routers(config)

            # Add fallback route to attempt to
            config.add_route("file.serve", "/modules/{module}/*file_id")

            # Add tween for catching and formatting config app SQL errors for the user:
            config.add_tween(
                "myworldapp.core.server.controllers.base.myw_utils.data_error_tween_factory"
            )

            # Setup the serving of static files
            if self.config["use_static_files"]:
                config.add_static_view(name="", path=self.config["pyramid.paths"]["static_files"])
            self.app = config.make_wsgi_app()

    def __call__(self, a, b):
        try:
            return self.app(a, b)
        except:
            # Don't allow unhandled exceptions to leave DB transactions open.
            Session.rollback()  # pylint: disable=no-member
            raise

    def load_routers(self, config):
        """
        Loads all of the controllers into the config using the list of controllers"""
        routers = self._get_router_list()
        routing_helper = MywRoutingHandler(config)
        for router in routers:
            try:
                routing_helper.load_router(router)
            except Exception as e:
                # Raise the error if its the core, else print a warning
                if router.startswith("myworldapp.core.server"):
                    raise
                else:
                    log.error(str(e))
        routing_helper.load_controllers()

    def _get_router_list(self):
        """
        Returns paths of all known controller files (inc custom ones in modules)
        """

        # Get core controllers first
        routing_list = self._routing_packages_under(
            self.config["pyramid.paths"]["controllers"], "myworldapp.core.server.controllers"
        )

        # Then get all custom controllers
        modules_dir = self._get_modules_dir()
        for module in os.listdir(modules_dir):
            ctl_dir = os.path.join(modules_dir, module, "server", "controllers")
            if os.path.exists(ctl_dir) and os.path.isdir(ctl_dir):
                log.debug("Scanning " + ctl_dir)
                module_routers = self._routing_packages_under(
                    ctl_dir, "myworldapp.modules." + module + ".server.controllers"
                )
                routing_list += module_routers

        log.debug("Routing Packages: " + str(routing_list))
        return routing_list

    def _routing_packages_under(self, dirname, prefix):
        packages = self._python_packages_under(dirname, prefix)
        routing = []
        for package in packages:
            if re.search("\.routing$", package):
                routing.append(package)

        return routing

    def _python_packages_under(self, dirname, prefix):
        """
        Finds all files that are in the directory and returns them as a python package format
        """
        log.debug("Looping through " + dirname)
        python_files = self._python_files_under(dirname)
        python_packages = []
        for python_file in python_files:
            python_file = re.sub(r"\\|/", ".", python_file)
            python_packages.append(prefix + "." + python_file)

        log.debug("Found packages: " + str(python_packages))
        return python_packages

    def _python_files_under(self, dirname, prefix=""):
        """
        Returns names of the python files under DIRNAME (recursive)
        """
        # Cut-and-pasted from routes.utils.contoller_scan()
        files = []
        for fname in os.listdir(dirname):
            filename = os.path.join(dirname, fname)

            if os.path.isfile(filename) and re.match("^[^_]{1,1}.*\.py$", fname):
                files.append(prefix + fname[:-3])

            elif os.path.isdir(filename):
                files.extend(self._python_files_under(filename, prefix=prefix + fname + "/"))
        return files

    def _get_modules_dir(self):
        """
        Path to the modules root dir
        """

        # TODO: Replace by myw_product or cached paths

        self_dir = os.path.dirname(os.path.abspath(__file__))
        modules_dir = os.path.join(os.path.dirname(self_dir), "..", "..", "modules")
        return modules_dir
