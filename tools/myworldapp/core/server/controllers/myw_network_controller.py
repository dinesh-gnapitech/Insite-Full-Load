################################################################################
# Controller for myw.network
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import json
from collections import OrderedDict
from pyramid.view import view_config
import pyramid.httpexceptions as exc
from geojson import FeatureCollection

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.db.globals import Session

from myworldapp.core.server.models.myw_network import MywNetwork
from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.controllers.base.myw_utils import featuresFromRecs, mywAbort

from myworldapp.core.server.database.myw_database import MywDatabase
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine


class MywNetworkController(MywController):
    """
    Controller for accessing myw.network
    """

    def __init__(self, request):
        """
        Initialize self
        """

        MywController.__init__(self, request)

        self.db = MywDatabase(Session)

    # ==============================================================================
    #                                CONFIG ACTIONS
    # ==============================================================================

    @view_config(route_name="myw_network_controller.no_name", request_method="GET", renderer="json")
    def index(self):
        """
        Get all networks
        """

        self.current_user.assertAuthorized(self.request, right="manageNetworks")

        query = Session.query(MywNetwork).order_by(MywNetwork.name)
        defs = []
        for rec in query:
            defs.append(rec.definition())

        return {"networks": defs}

    @view_config(
        route_name="myw_network_controller.with_name", request_method="GET", renderer="json"
    )
    def get(self):
        """
        Get record with key NAME
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="manageNetworks")

        rec = Session.query(MywNetwork).get(name)

        if not rec:
            raise exc.HTTPNotFound()

        return rec.definition()

    @view_config(
        route_name="myw_network_controller.no_name", request_method="POST", renderer="json"
    )
    def create(self):
        """
        Add a new record
        """

        self.current_user.assertAuthorized(self.request, right="manageNetworks")

        # Unpick request
        props = json.loads(self.request.body)

        # Check for duplicate name
        if Session.query(MywNetwork).filter(MywNetwork.name == props["name"]).first():
            raise exc.HTTPConflict()

        # Create record
        # ENH: Duplicates code on config manager
        feature_items = props.pop("feature_types", {})

        rec = MywNetwork(**props)
        rec.set_backstops()
        Session.add(rec)
        Session.flush()
        rec.set_feature_items(feature_items)

        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_network_controller.with_name", request_method="PUT", renderer="json"
    )
    def update(self):
        """
        Update properties of network NAME
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="manageNetworks")

        # Unpick request
        props = json.loads(self.request.body)

        # Find record
        rec = Session.query(MywNetwork).get(name)
        if not rec:
            raise exc.HTTPNotFound()

        # Update record
        # ENH: Duplicates code on config manager
        feature_items = props.pop("feature_types", {})
        props.pop("name", None)

        for prop, val in list(props.items()):
            rec[prop] = val
        rec.set_feature_items(feature_items)

        Session.commit()

        return rec.definition()

    @view_config(
        route_name="myw_network_controller.with_name", request_method="DELETE", renderer="json"
    )
    def delete(self):
        """
        Delete network NAME
        """
        name = self.request.matchdict["name"]

        self.current_user.assertAuthorized(self.request, right="manageNetworks")

        # Find record
        rec = Session.query(MywNetwork).get(name)
        if not rec:
            raise exc.HTTPNotFound()

        # Delete it
        # ENH: Duplicates code on config manager
        for sub_rec in rec.substructure():
            Session.delete(sub_rec)
        Session.flush()

        Session.delete(rec)
        Session.commit()

        return {"name": name}

    # ==============================================================================
    #                                CLIENT ACTIONS
    # ==============================================================================

    @view_config(
        route_name="myw_network_controller.feature_networks", request_method="GET", renderer="json"
    )
    def feature_networks(self):
        """
        The networks of which feature ID is an element

        Returns a list of dicts of network properties, keyed by network name"""
        feature_type = self.request.matchdict["feature_type"]
        id = self.request.matchdict["id"]

        # Unpick params
        delta = self.get_param(self.request, "delta")
        lang = self.get_param(self.request, "lang")

        # Check authorised
        self.current_user.assertAuthorized(self.request, feature_type=feature_type)

        # Get feature record
        db_view = self.db.view(delta)
        feature_rec = db_view.table(feature_type).get(id)
        if not feature_rec:
            raise exc.HTTPNotFound()

        # For each network ..
        network_infos = OrderedDict()
        for network_name in self.current_user.networkDefs():

            # Get trace start points (if any)
            engine = self.network_engine_for(network_name, delta)
            sub_paths = engine.subPathsFor(feature_rec, lang)

            # If can trace in this network .. get network properties
            if sub_paths or engine.includes(feature_rec):

                network_info = OrderedDict()
                for prop in ["topology", "directed", "external_name"]:
                    network_info[prop] = engine.network_def[prop]

                network_info["sub_paths"] = sub_paths

                network_infos[network_name] = network_info

        return network_infos

    @view_config(
        route_name="myw_network_controller.trace_out", request_method="GET", renderer="json"
    )
    def trace_out(self):
        """
        Find objects feed by a specified object
        """
        network = self.request.matchdict["network"]

        # Unpick parameters
        start_feature_urn = self.get_param(self.request, "from", mandatory=True)
        direction = self.get_param(
            self.request,
            "direction",
            values=["upstream", "downstream", "both"],
            default="downstream",
        )
        extra_filters = self.get_param(self.request, "filters", type="json", default={})
        max_dist = self.get_param(self.request, "max_dist", type=float)
        max_nodes = self.get_param(self.request, "max_nodes", type=int)
        result_type = self.get_param(
            self.request, "result_type", values=["features", "tree"], default="features"
        )
        feature_types = self.get_param(self.request, "return", list=True)
        application = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(self.request)

        # Create engine
        engine = self.network_engine_for(network, delta, extra_filters)

        # Perform trace
        try:
            tree = engine.traceOut(start_feature_urn, direction, max_dist, max_nodes)
        except MywError as cond:
            mywAbort(cond)

        # Build result
        return self.result_from(tree, result_type, feature_types, application)

    @view_config(
        route_name="myw_network_controller.shortest_path", request_method="GET", renderer="json"
    )
    def shortest_path(self):
        """
        Find shortest path from one object to another
        """
        network = self.request.matchdict["network"]

        # Unpick parameters
        start_feature_urn = self.get_param(self.request, "from", mandatory=True)
        end_feature_urn = self.get_param(self.request, "to", mandatory=True)
        extra_filters = self.get_param(self.request, "filters", type="json", default={})
        max_dist = self.get_param(self.request, "max_dist", type=float)
        max_nodes = self.get_param(self.request, "max_nodes", type=int)
        result_type = self.get_param(
            self.request, "result_type", values=["features", "tree"], default="features"
        )
        feature_types = self.get_param(self.request, "return", list=True)
        application = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(self.request)

        # Create engine
        engine = self.network_engine_for(network, delta, extra_filters)

        # Perform trace
        try:
            tree = engine.shortestPath(start_feature_urn, end_feature_urn, max_dist, max_nodes)
        except MywError as cond:
            mywAbort(cond)

        # Build result
        return self.result_from(tree, result_type, feature_types, application)

    def network_engine_for(self, name, delta, extra_filters={}):
        """
        Returns MywNetworkEngine engine for network NAME (error if not found)
        """

        # ENH: Stash definition or engine in config cache

        settings = self.request.registry.settings
        trace_level = settings.get("myw.network.options", {}).get("log_level", 0)

        # Find network record
        network_def = self.current_user.networkDefs().get(name)
        if not network_def:
            raise exc.HTTPNotFound()

        # Build progress reporter
        progress = MywSimpleProgressHandler(trace_level, "INFO: NETWORK TRACING: ")
        progress(1, "Constructing engine for network:", name, extra_filters)

        # Construct engine
        db_view = self.db.view(delta)
        return MywNetworkEngine.newFor(
            db_view, network_def, extra_filters=extra_filters, progress=progress
        )

    def result_from(self, tree, result_type, feature_types=None, application=None):
        """
        Returns trace result PATH as a jsonifible result (applying filters etc)

        Optional FEATURE_TYPES restricts result to those types only"""

        lang = self.get_param(self.request, "lang", type=str, default=None)

        feature_aspects = {
            "include_display_values": True,  # TODO: Pass these in
            "include_lobs": False,
            "include_geo_geometry": True,
            "lang": lang,
        }

        # Prevent return of inaccessible feature types
        accessible_feature_types = self.current_user.featureTypes(
            "myworld", application_name=application
        )

        if feature_types:
            feature_types = set(feature_types).intersection(accessible_feature_types)
        else:
            feature_types = set(accessible_feature_types)

        # Case: List of features
        if result_type == "features":
            if not tree:
                return FeatureCollection([])
            recs = tree.subTreeFeatures(feature_types)  # TODO: Direct from tree
            features = featuresFromRecs(recs, **feature_aspects)
            return FeatureCollection(features)

        # Case: Tree
        if result_type == "tree":
            if not tree:
                return {}
            return tree.asTraceResult(feature_aspects, feature_types)

        # Case: Other
        raise MywInternalError("Bad result type:", result_type)
