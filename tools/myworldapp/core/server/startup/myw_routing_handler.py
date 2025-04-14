# Copyright: IQGeo Limited 2010-2023
import sys
import logging
import importlib
from pyramid.exceptions import ConfigurationError
from pyramid.httpexceptions import HTTPMovedPermanently

log = logging.getLogger("myworldapp")


# Class that acts as a bridge between the old routing.py files and the pyramid controller loading method


class MywRoutingHandler:
    def __init__(self, config):
        self.config = config
        self.prefix = ""
        self.controllers = []

    def add_renderer(self, *args):
        """passthrough add_renderer calls"""
        self.config.add_renderer(*args)

    def add_route(self, url, controller, route_name, setup_slash_redirector=False, **kwargs):
        self.add_controller(controller)
        full_route_name = controller + "." + route_name
        self._add_route(full_route_name, url, setup_slash_redirector, **kwargs)

    def add_controller(self, controller):
        full_controller_name = self.prefix + "." + controller
        if full_controller_name not in self.controllers:
            self.controllers.append(full_controller_name)

    def load_controllers(self):
        log.debug("Will try to load these controllers: " + str(self.controllers))
        for controller in self.controllers:
            try:
                log.debug("Attempting to load controller: " + controller)
                self.config.scan(controller)

            except ConfigurationError as cond:
                message = repr(cond)
                log.debug(message)
                if "'includeme'" not in message:
                    log.warn("%s: %s", controller, message)
                    raise

            except Exception as cond:
                raise ImportError(
                    "Error loading controller from {} : {} : {}".format(
                        controller, cond.__class__, cond
                    )
                )

        self.controllers = []

    def load_router(self, name):
        """
        Import router NAME from MODULE (if possible)

        If no module is specified looks in the core controllers
        directory.  Once found the controller code will be imported
        and controller class returned.
        """

        log.debug("Attempting to load module '%s'", name)
        module_chunks = name.split(".")
        module_chunks.pop()
        self.prefix = ".".join(module_chunks)

        # Load it and try to call add_routes
        try:
            importlib.import_module(name)
            add_routes_proc = getattr(sys.modules[name], "add_routes")
            add_routes_proc(self)
            log.debug("Router loaded OK")

        except Exception as cond:
            raise ImportError(
                "Error loading router from {} : {} : {}".format(name, cond.__class__, cond)
            )

    def _add_route(self, full_route_name, url, setup_slash_redirector, **kwargs):
        # Pyramid treats URLs ending with and without / separately. Setup an auto-redirect here for those that do
        # Fix obtained from https://stackoverflow.com/questions/15705399/routes-with-trailing-slashes-in-pyramid
        if url.endswith("/"):
            url = url[:-1]

        self.config.add_route(full_route_name, url, **kwargs)
        if setup_slash_redirector:
            redirector_name = full_route_name + "_auto_redirect"
            self.config.add_route(redirector_name, url + "/", **kwargs)
            self.config.add_view(
                lambda request: HTTPMovedPermanently(
                    request.route_url(full_route_name, _query=request.GET, **request.matchdict)
                ),
                route_name=redirector_name,
            )
