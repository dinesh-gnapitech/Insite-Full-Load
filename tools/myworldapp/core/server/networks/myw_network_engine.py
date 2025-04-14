################################################################################
# myWorld network engine
################################################################################
# Copyright: IQGeo Limited 2010-2023

from abc import ABC, abstractmethod
from heapq import heappush, heappop

import os
from myworldapp.core.server.base.system.myw_product import MywProduct

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.db.myw_filter_parser import MywFilterParser

from myworldapp.core.server.dd.myw_reference import MywReference


class MywNetworkEngine(ABC):
    """
    Abstract superclass for network tracing engines

    Constructed from a network definition, which defines the feature
    types that constitute the network and how their connectivity
    is obtained. Provides functions for trace out and shortest
    path.

    Subclasses must implement:
      rootNode(self,urn,direction)
      connectedNodes(self,node,direction,root_node)

    Optionally also:
      subPathsFor(self,feature_rec)
      traceOut(self,from_urn,direction,max_dist)
      shortestPath(self,from_urn,to_urn,max_dist)
      lengthOf(feature_rec)
      euclidean"""

    product = MywProduct()  # Used for finding engine classes
    engine_classes = {}  # Cache of engine classes
    euclidean = True  # Controls whether A* optimisation using great circle distances can be enabled

    # ==============================================================================
    #                                    CLASS METHODS
    # ==============================================================================

    @classmethod
    def newFor(cls, db_view, network_def, progress=MywProgressHandler(), **args):
        """
        Returns a engine appropriate for NETWORK_DEF

        ARGS are as for __init__()"""

        # Find engine class
        engine_name = network_def["engine"]

        engine_class = cls._find_network_engine(engine_name, progress)
        if not engine_class:
            raise MywError("Cannot find network engine:", engine_name)

        # Instantiate it
        return engine_class(db_view, network_def, progress=progress, **args)

    @classmethod
    def _find_network_engine(cls, name, progress=MywProgressHandler()):
        """
        Returns engine class for name (if there is one)

        Imports class dynamically, scanning core and modules. Looks for a file:
            <module>/server/networks/<NAME>.py

        containing a class name based on the NAME, with underscored replaced
        by capitalisation (as per controllers)."""

        # ENH: Share code with controller loading?

        progress(9, "Finding engine class for", name)

        # Check for already loaded
        if name in cls.engine_classes:
            return cls.engine_classes.get(name)

        # Construct expected name of class
        module_words = name.replace("-", "_").split("_")
        class_name = "".join(w.title() for w in module_words)

        # For each module (including core) ..
        for module in cls.product.modules():

            # Check if file exists
            file_path = module.file("server", "networks", name + ".py")
            progress(9, "Trying", file_path)
            if not os.path.exists(file_path):
                continue

            # Load it .. and extract class
            progress(8, "Loading engine class from", file_path)
            python_path = module.python_path("server", "networks", name)
            python_module = __import__(python_path, globals(), locals(), fromlist=("myworldapp"))
            engine_class = cls.engine_classes[name] = getattr(python_module, class_name)

            return engine_class

        # Case: Not found
        return None

    # ==============================================================================
    #                                    CREATION
    # ==============================================================================

    def __init__(self, db_view, network_def, extra_filters={}, progress=MywProgressHandler()):
        """
        Returns a engine appropriate for NETWORK_DEF

        DB_VIEW is a MywFeatureView or MywReadonlyFeatureView.
        NETWORK_DEF is a dict of network properties (as returned by
        MywNetwork.definition()).

        Optional EXTRA_FILTERS (a set of myWorld select expressions, keyed
        by feature type) can be used to further limit which objects
        are considered to be in the network. If supplied, they are
        ANDed with any filters in NETWORK_DEF"""

        # ENH: Support pass in length scale

        # Init slots
        self.caching_view = db_view.getCachingView()
        self.network_def = network_def
        self.extra_filters = extra_filters
        self.progress = progress

        self._length_scale = None  # Init lazily

        self._buildPredicates()

    def _buildPredicates(self):
        """
        Compile predicate for each feature type
        """

        self.predicates = {}

        for feature_type, props in list(self.network_def["feature_types"].items()):

            # Get filter from configuration (if present)
            combined_filter = props.get("filter")

            # Add filter passed into constructor (if present)
            # ENH: Could add after compilation using MywDbPredicate.and()
            extra_filter = self.extra_filters.get(feature_type)
            if extra_filter:
                if combined_filter:
                    combined_filter = "({}) & ({})".format(combined_filter, extra_filter)
                else:
                    combined_filter = extra_filter

            # Compile it
            if combined_filter:
                self.predicates[feature_type] = MywFilterParser(
                    combined_filter, self.progress
                ).parse()  # ENH: Modify progress level

    @property
    def length_scale(self):
        """
        Unit scale for converting lengths to metres
        """
        # ENH: Cache in config cache, pass into constructor?

        if not self._length_scale:
            self._length_scale = self.caching_view.db.unitScale("length")

        return self._length_scale

    # ==============================================================================
    #                                ABSTRACT METHODS
    # ==============================================================================

    @abstractmethod
    def rootNode(self, urn, direction):
        """
        Create the start node for URN
        """

        raise NotImplementedError()

    @abstractmethod
    def connectedNodes(self, node, direction, root_node):
        """
        Returns nodes directly reachable from NODE

        DIRECTION is 'upstream', 'downstream' or 'both'.
        ROOT_NODE is the root of the current trace."""

        raise NotImplementedError()

    # ==============================================================================
    #                                  TRACING OPS
    # ==============================================================================

    def subPathsFor(self, feature_rec, lang):
        """
        URNs that can be used as trace start points within FEATURE_REC (if any)

        Returns a list of descriptive strings, keyed by URN (or None)

        Used by trace dialog."""
        # ENH: Better to pass in a urn?

        return None

    def traceOut(self, from_urn, direction="both", max_dist=None, max_nodes=None):
        """
        Find objects reachable from FROM_URN

        Direction is 'upstream', 'dowstream' or 'both'. Optional
        MAX_DIST is maximum distance to trace for (in metres)
        measured from start of FROM_URN.

        Returns a MywTraceNode tree"""

        self.progress(
            2, "Tracing from", from_urn, ":", "direction=", direction, ":", "max_dist=", max_dist
        )

        (root_node, stop_node) = self._trace(
            from_urn, direction, max_dist=max_dist, max_nodes=max_nodes
        )

        return root_node.tidy()

    def shortestPath(self, from_urn, to_urn, max_dist=None, max_nodes=None):
        """
        Find shortest path from FROM_URN to TO_URN (if there is one)

        Optional MAX_DIST is maximum distance to trace for (in metres)

        Returns a MywTraceNode tree"""

        # ENH: Support multiple targets, predicate targets
        # ENH: Support cost function, A* cost estimator

        self.progress(2, "Finding path", from_urn, "->", to_urn)

        # Do trace out
        (from_node, to_node) = self._trace(
            from_urn, "both", stop_urns=[to_urn], max_dist=max_dist, max_nodes=max_nodes
        )

        # Get path from -> to
        if not to_node:
            return None

        return to_node.pruneToRootPath().tidy()

    def _trace(self, from_urn, direction, stop_urns=[], max_dist=None, max_nodes=None):
        """
        Find objects reachable from FROM_URN (in distance order)

        Optional MAX_DIST is distance at which to stop tracing (in
        metres). Optional STOP_URNS is a list of feature urns we are
        trying to find. Tracing terminates when one of these is encourtered.

        Returns MywTraceNodes:
         ROOT_NODE   The node from which tracing started
         STOP_NODE   The node which caused tracing to stop (if any)"""

        # ENH: Support start from specified location along FROM_URN
        # ENH: Make ordering by distance optional (for speed)

        active_nodes = []  # MywTraceNodes in the 'wave front'
        visited_nodes = set()  # Paths we have encountered so far

        if self.euclidean:
            # Get stop geoms to use when calculating node to end point distances for A*
            stop_geoms = self._stop_geoms(stop_urns)

        # Add start node
        root_node = self.rootNode(from_urn, direction)
        heappush(active_nodes, root_node)
        visited_nodes.add(root_node.node_id)

        # Propagate wavefront (in distance order)
        while active_nodes:

            # Move to next closest node
            node = heappop(active_nodes)
            node_urn = node.feature._urn()
            self.progress(4, "Processing:", node)

            # Check for found stop node
            if node_urn in stop_urns:
                return root_node, node

            # Check for node beyond distance limit
            if node.partial:
                continue

            # Add end nodes of connected items to wavefront
            for conn_node in self.connectedNodes(node, direction, root_node):
                self.progress(5, "  Connection:", conn_node)

                # Check for already found
                if conn_node.node_id in visited_nodes:
                    self.progress(8, "  Already visited")
                    continue

                # Check for end beyond distance limit
                # Note: This may change the node_id
                if max_dist and conn_node.dist > max_dist:
                    self.progress(7, "  Beyond max dist")
                    conn_node.stopAt(max_dist)

                # Prevent cycles
                visited_nodes.add(conn_node.node_id)

                # Prevent memory overflow etc
                if max_nodes and len(visited_nodes) > max_nodes:
                    self.progress("warning", "Trace size limit exceeded:", max_nodes)
                    raise MywError("Trace size limit exceeded")

                # Add to wavefront
                self.progress(6, "  Activating:", conn_node)

                # Include distance to stop nodes as part of A* algrorithm
                if self.euclidean and stop_geoms:
                    conn_node.min_possible_dist = conn_node.dist + conn_node.minDistanceTo(
                        stop_geoms
                    )

                heappush(active_nodes, conn_node)

                node.children.append(conn_node)

        return root_node, None

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def featureRecFor(self, urn, network_only=False):
        """
        Feature record for URN (if it exists)

        If NETWORK_ONLY is true, return None if record is not included in self's network"""

        # Get record (handling missing table)
        try:
            rec = self.caching_view.get(urn)

        except MywError as cond:  # ENH: Raise something more specific in DD
            self.progress("warning", urn, ":", cond)
            return None

        # Warn if not found
        if not rec:
            self.progress(5, "  No such feature:", urn)
            return None

        # Check in this network
        if network_only and not self.includes(rec):
            self.progress(8, "  Not element:", urn)
            return None

        return rec

    def includes(self, rec):
        """
        True if feature REC is in self
        """

        # Check for not in network
        if not rec.feature_type in self.network_def["feature_types"]:
            return False

        # Check for excluded by filter
        pred = self.predicates.get(rec.feature_type)
        if pred is None:
            return True

        return pred.matches(rec)

    def lengthOf(self, feature_rec):
        """
        Length of feature_rec for tracing purposes (in m)
        """

        # Try attribute
        length = self.featureProp(feature_rec, "length", unit="m")
        if length != None:
            self.progress(10, feature_rec, "Got length from record:", length)
            return length

        # Compute from geometry
        # ENH: Warn if geom is in internal world (where units will be wrong)
        primary_geom_name = feature_rec._descriptor.primary_geom_name
        length = feature_rec._field(primary_geom_name).geoLength()

        self.progress(10, feature_rec, "Computed length:", length)
        return length

    def featureProp(self, feature_rec, prop, unit=None):
        """
        The value of FEATURE_REC's configured property PROP (if set)

        PROP is the name of a configurable field property in a
        network definition ('upstream', 'downstream' or 'length')

        Returns None if the property is not configured for FEATURE_REC"""

        # Get field holding value
        field_name = self.featurePropFieldName(feature_rec.feature_type, prop)
        if not field_name:
            return None

        # Get value
        val = getattr(feature_rec, field_name)
        if unit and val:
            field_unit = feature_rec._descriptor.fields[field_name].unit
            val = val * self.length_scale.conversionFactor(field_unit, unit)

        return val

    def featurePropFieldName(self, feature_type, prop):
        """
        The field of FEATURE_TYPE to use for configured property PROP (if set)

        PROP is the name of a configurable field property in a
        network definition ('upstream', 'downstream' or 'length')

        Returns None if the property is not configured for FEATURE_REC"""

        # Get configuration for feature type
        # ENH: Warn if not in network?
        feature_props = self.network_def["feature_types"].get(feature_type)
        if not feature_props:
            return None

        # Get configured field name for property
        field_name = feature_props.get(prop)

        return field_name

    def parseUrn(self, urn):
        """
        Parse a qualified URN

        Returns:
          BASE_URN     Unqualified URN
          QUALIFIERS   Dict of key/value pairs"""

        # ENH: Use MywReference in callers and get rid of this

        ref = MywReference.parseUrn(urn)

        return ref.base, ref.qualifiers

    def oppositeOf(self, direction):
        """
        The opposite of DIRECTION ('upstream' or 'downstream')
        """

        if direction == "upstream":
            return "downstream"
        if direction == "downstream":
            return "upstream"

        raise MywError("Bad direction:", direction)

    def _stop_geoms(self, stop_urns):
        """
        Returns geometries for STOP_URNS
        """

        stop_geoms = []
        for stop_urn in stop_urns:
            stop_ftr = self.featureRecFor(stop_urn)
            if stop_ftr and stop_ftr.primaryGeometry():
                stop_geoms.append(stop_ftr.primaryGeometry())

        return stop_geoms
