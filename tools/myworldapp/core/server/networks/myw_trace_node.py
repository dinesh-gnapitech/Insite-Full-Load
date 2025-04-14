################################################################################
# myWorld trace node
################################################################################
# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict
from shapely.geometry import Point
from myworldapp.core.server.base.geom.myw_geo_utils import geodeticDistanceBetween


class MywTraceNode:
    """
    A node in a network trace result

    Represents both the trace node and its incoming link. The
    exception is the root node, which has no incoming link.

    Has properties:
      .feature   Feature record
      .dist      Total distance to root node of trace (in m)
      .parent    Previous node in the trace tree (None for root node)
      .children  Next nodes in the trace tree

    Also provides tree behaviour (see .subTree(), .pathToRoot(), ...)"""

    def __init__(self, feature, dist, parent=None):
        """
        Init slots of self
        """

        self.feature = feature
        self.dist = dist
        self.parent = parent
        self.children = []

        self.node_id = feature._urn()  # Key for cycle prevention
        self.partial = False  # True if link has been trimmed
        self.full_dist = dist  # Original dist before trimming

    def stopAt(self, dist):
        """
        Trim self back to distance DIST from root

        Marks self as a partial link"""

        self.dist = dist
        self.partial = True

    # ==============================================================================
    #                              NODE BEHAVIOUR
    # ==============================================================================

    # User-level properties of self (a list of attribute names)
    metadata = ["dist"]

    # Properties which will use localised unit conversion (e.g. to ft) must specify scale (e.g.
    # length) and source units (e.g. m) before conversion. Remember to copy and extend this dict,
    # don't mutate it!
    metadata_unit_scales = {"dist": {"scale": "length", "unit": "m"}}

    def __ident__(self):
        """
        Identifying string for progress messages
        """

        return "{}( {},{} )".format(
            self.__class__.__name__, self.__identStr__(), len(self.children)
        )

    def __identStr__(self):
        """
        Identifying key for progress messages
        """
        # Provided to permit subclassing

        id_str = "{:.3f}m,{}".format(self.dist, self.node_id)

        for prop in self.metadata:  # TODO: Use .definition()
            val = getattr(self, prop, None)

            if prop == "dist" or val == None:
                continue

            if isinstance(val, float):
                val = "{:.3f}".format(val)

            id_str += ",{}={}".format(prop, val)

        for prop in ["start_coord", "stop_coord"]:
            if prop in self.metadata:
                continue

            val = getattr(self, prop)

            if val:
                id_str += ",{}={}".format(prop, val)

        return id_str

    def __lt__(self, other):
        """
        Comparison operator (used in heap operations)
        """

        # if the network is euclidean, it will set this property for sorting:
        if hasattr(self, "min_possible_dist"):
            return self.min_possible_dist < other.min_possible_dist

        return self.dist < other.dist

    def definition(self, parent_id):
        """
        Properties for serialisation in trace result

        Provided to permit extension in subclasses"""

        # TODO: Replaced by a .properties slot?

        standard_props = ["dist", "start_coord", "stop_coord"]

        feature_urn = self.feature._urn()

        # Add fixed props
        props = OrderedDict()
        props["parent"] = parent_id
        props["feature"] = feature_urn

        for prop in standard_props:
            val = getattr(self, prop)
            if val != None:
                props[prop] = val

        # Add other user-level props
        for prop in self.metadata:
            if prop in standard_props:
                continue

            val = getattr(self, prop)
            if val != None:
                props[prop] = val

        return props

    @property
    def start_coord(self):
        """
        Position on self's feature at which self starts (if partial link)
        """

        if not self.partial or not self.parent:  # TODO: Do better if root node
            return None

        geom = self.featureGeom()

        if self.forward(geom):
            return geom.coords[0]
        else:
            return geom.coords[-1]

    @property
    def stop_coord(self):
        """
        Position on self's feature at which self ends (if partial link)
        """

        if not self.partial or not self.parent:  # ENH: Do better if root node
            return None

        # Find position of stop point along feature (as proportion of total length)
        # Remember: dist may have been computed from a stored length value
        geom = self.featureGeom()
        pos = (self.dist - self.parent.dist) / (self.full_dist - self.parent.dist)

        if not self.forward(geom):
            pos = 1.0 - pos

        # Compute coordinate at that position
        return geom.geoCoordAtPos(pos)

    @property
    def end_coord(self):
        """
        Position on self's feature at which self ends
        Different from stop_coord, because it is always defined for A*
        distance remaining estimate.
        """
        if self.partial:
            return self.stop_coord

        geom = self.featureGeom()
        if self.forward(geom):
            return geom.coords[-1]
        else:
            return geom.coords[0]

    def forward(self, geom):
        """
        True if self's feature geometry GEOM is in same direction as self
        """

        # Check we have a line
        # Will normally true, but could have partial link on point e.g. copper slack
        if geom.geom_type != "LineString":
            return True

        # Get upstream geometry
        # TODO: ENH if parent is in internals better to use geo_geom
        parent_geom = self.parent.featureGeom()

        # Check point self's end point on a vertex of parent (normally is)
        # TODO: Do points too
        if parent_geom.geom_type == "LineString":
            if geom.coords[0] in (parent_geom.coords):
                return True
            if geom.coords[-1] in (parent_geom.coords):
                return False

        # Find nearest end point on parent geom
        # Note: Workaround because geom.project(parent_geom) not safe on linestring (sometimes SEGVs)
        # TODO: Encapsulate this in geom library
        if parent_geom.geom_type == "LineString":

            # Find nearest point
            # TODO: Shapely line.distance(point) can SEGV (!)
            pnt1 = Point(parent_geom.coords[0])
            pnt2 = Point(parent_geom.coords[-1])

            if geom.distance(pnt1) < geom.distance(pnt2):
                pnt = pnt1
            else:
                pnt = pnt2

        else:
            pnt = parent_geom

        # Find projection of point on self's geom
        # Warning: Normalized flag seems inverted if first arg is a linestring (shapely bug?)
        pos = geom.project(pnt, normalized=True)

        return pos < 0.5

    def featureGeom(self):
        """
        The primary geometry of self's feature (as a shapely geom)
        """

        return self.feature._primary_geom_field.geom()

    def minDistanceTo(self, geoms):
        """
        Distance from self to nearest vertex on GEOMS, in m (0.0 if not known)

        GEOMS is a set of shapely geometries
        """

        self_coord = self.end_coord

        min_dist = float("inf")
        for geom in geoms:
            for coord in geom.coords:
                dist = geodeticDistanceBetween(self_coord, coord)

                if min_dist == None or min_dist > dist:
                    min_dist = dist

        return min_dist

    # ==============================================================================
    #                                TREE BEHAVIOUR
    # ==============================================================================

    def pruneToRootPath(self):
        """
        Prune self's tree to a single path from root node to self

        Other nodes are discarded

        Returns the root node"""

        self.children = []
        node = self

        while node.parent:
            node.parent.children = [node]
            node = node.parent

        return node

    def tidy(self):
        """
        Perform post-processing on self's subtree (hook for subclasses)

        Returns new root node"""

        return self

    def printSubTree(self):
        """
        Show self's subtree on stdout (for debugging purposes)
        """
        # Note: Uses pseudo-recursion to prevent possible stack overflow

        stack = [(self, 0)]

        while stack:
            (node, level) = stack.pop()
            print(level * "   ", node.__ident__())

            for child_node in reversed(node.children):
                stack.append((child_node, level + 1))

    def subTreeFeatures(self, feature_types=None):
        """
        Features of self's subtree, as an ordered list
        """
        # Uses pseudo-recursion to prevent possible stack overflow

        features = OrderedDict()
        stack = [self]

        while stack:
            node = stack.pop()

            # Add to result
            if not feature_types or (node.feature.feature_type in feature_types):
                urn = node.feature._urn()
                features[urn] = node.feature

            # Recurse (preserving order)
            stack += reversed(node.children)

        return list(features.values())

    def asTraceResult(self, feature_aspects={}, feature_types=None):
        """
        Self's subtree, as a jsonifable structure

        Returns a dist with keys:
          'metadata': Names of the user-level properties of each node
          'nodes':    Dict of selected nodes (in depth-first order)
          'features': Dict of feature properties (keyed by URN)"""

        # Note: Uses pseudo-recursion to avoid stack overflow

        node_defs = OrderedDict()
        feature_defs = OrderedDict()

        # While the features themselves will have been retrieved using a cached view,
        # there are other metadata in the GeoJSON grabbed from references, many of
        # which are shared by multiple nodes. Therefore, give it a cache to use.
        geo_json_cache = {}

        stack = [(self, 0)]  # Trace node and parent_id

        while stack:
            (node, parent_id) = stack.pop()

            # Case: In requested types .. so add a node
            if (not feature_types) or (node.feature.feature_type in feature_types):
                node_id = len(node_defs) + 1

                node_defs[node_id] = node.definition(parent_id)

                feature_urn = node.feature._urn()
                if not feature_urn in feature_defs:
                    feature_defs[feature_urn] = node.feature.asGeojsonFeature(
                        cache=geo_json_cache, **feature_aspects
                    )

            # Case: Skip the node
            else:
                node_id = parent_id

            # Recurse on children
            for child_node in reversed(node.children):
                stack.append((child_node, node_id))

        return {
            "metadata": self.metadata,
            "metadata_unit_scales": self.metadata_unit_scales,
            "nodes": node_defs,
            "features": feature_defs,
        }
