################################################################################
# myWorld Link/Node Network Engine
################################################################################
# Copyright: IQGeo Limited 2010-2023


from .myw_network_engine import MywNetworkEngine
from .myw_topo_trace_node import MywTopoTraceNode


class MywTopoNetworkEngine(MywNetworkEngine):
    """
    A network engine operating on a hidden link-node connectivity model

    In this model connectivity between features is represented
    using a hidden layer of links and nodes. This permits
    interrupted links. Top level features store references to
    their 'upsteram' and 'downstream' nodes. The link and node
    features store a reference the user level feature that
    'owns' them.
    """

    def rootNode(self, urn, direction):
        """
        Create the start node for URN
        """

        feature = self.featureRecFor(urn)

        topo_node = self._topoNodeFor(feature, "upstream")

        return MywTopoTraceNode(feature, 0.0, topo_node)

    def connectedNodes(self, node, direction, root_node):
        """
        Returns trace nodes directly reachable from NODE

        DIRECTION is 'upstream', 'downstream' or 'both'"""

        # ENH: Consider direction?

        # If node has owner .. and not already at it .. trace through it
        owner_urn = node.topo_node.owner
        if owner_urn and owner_urn != node.feature._urn():
            owner = self.featureRecFor(owner_urn, True)

            # Check for stop node
            if not owner:
                return []

            # Insert it into the trace
            conn_node = MywTopoTraceNode(owner, node.dist, node.topo_node, parent=node)
            return [conn_node]

        # For each connected link ...
        nodes = []
        for topo_link in self._referencedFeatures(node.topo_node, "links"):

            # Avoid going back the way we came
            if topo_link == node.topo_link:
                continue

            # Get owning feature
            feature = self.featureRecFor(topo_link.owner, True)
            if not feature:
                continue

            # Find topo node at other end
            topo_node = self._otherNodeOf(topo_link, node.topo_node)

            # Compute its distance from root node
            if feature == root_node.feature:
                topo_node_dist = 0
            else:
                topo_node_dist = node.dist + self.lengthOfLink(topo_link, feature)

            # Create trace node
            conn_node = MywTopoTraceNode(
                feature, topo_node_dist, topo_node, parent=node, topo_link=topo_link
            )
            nodes.append(conn_node)

        return nodes

    def _referencedFeatures(self, feature, field_name):
        """
        Returns feature records referenced in field FIELD_NAME of FEATURE

        FIELD_NAME is a reference or reference_set field

        Bad references are skipped silently"""

        return feature._field(field_name).recs(skip_bad_refs=True)

    def lengthOfLink(self, topo_link, feature_rec):
        """
        Length of TOPO_LINK for tracing purposes (in m)

        FEATURE_REC is the owner of TOPO_LINK"""

        # ENH: Do less work here .. e.g. check for single link feature

        # Get length of owning feature (avoiding divide by zero)
        ftr_geom_length = feature_rec._primary_geom_field.geoLength()
        if ftr_geom_length == 0.0:
            return 0.0

        # Compute proportion of total feature covered by link
        link_geom_length = topo_link._primary_geom_field.geoLength()
        prop = link_geom_length / ftr_geom_length

        # Get measured length of feature (if configured)
        ftr_measured_length = self.lengthOf(feature_rec)

        return prop * ftr_measured_length

    def _otherNodeOf(self, topo_link, topo_node):
        """
        Returns topo node at other end of TOPO_LINK from TOPO_NODE
        """

        fld = "node1"
        if topo_node._urn() == topo_link._field(fld).urn():
            fld = "node2"

        return topo_link._field(fld).rec()

    def _topoNodeFor(self, feature, direction):
        """
        Returns the upstream or downstream topo node for FEATURE

        DIRECTION is 'upstream' or 'downstream'"""

        ftr_props = self.network_def["feature_types"].get(feature.feature_type)

        if not ftr_props or not direction in ftr_props:
            return None

        field_name = ftr_props[direction]

        return feature._field(field_name).rec()
