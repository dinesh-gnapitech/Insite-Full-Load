################################################################################
# myWorld Graph NetworkEngine
################################################################################
# Copyright: IQGeo Limited 2010-2023


from .myw_network_engine import MywNetworkEngine

from .myw_trace_node import MywTraceNode


class MywGraphNetworkEngine(MywNetworkEngine):
    """
    A network engine operating on a 'simple graph' connectivity model

    In this model each feature is link and holds a direct
    reference to its upstream and downstream connections. The
    names of the fields holding the references are configured
    via the network definition."""

    def rootNode(self, urn, direction):
        """
        Create the start node for URN
        """

        feature = self.featureRecFor(urn)

        return MywTraceNode(feature, 0.0)

    def connectedNodes(self, node, direction, root_node):
        """
        Returns nodes directly reachable from NODE

        DIRECTION is 'upstream', 'downstream' or 'both'.
        ROOT_NODE is the root of the current trace (unused here)."""

        nodes = []

        # For each reference .. create node
        for ftr_rec in self.connectedFeaturesFor(node.feature, direction):
            ftr_len = self.lengthOf(ftr_rec)
            conn_node = MywTraceNode(ftr_rec, node.dist + ftr_len, node)
            nodes.append(conn_node)

        return nodes

    def connectedFeaturesFor(self, feature, direction):
        """
        Returns features directly reachable from FEATURE

        DIRECTION is 'upstream', 'downstream' or 'both'"""

        if direction == "both" or not self.network_def["directed"]:
            upstream_field_name = self.featurePropFieldName(feature.feature_type, "upstream")
            downstream_field_name = self.featurePropFieldName(feature.feature_type, "downstream")

            if upstream_field_name == downstream_field_name:
                return self._connectedFeaturesFor(feature, "upstream")
            else:
                return self._connectedFeaturesFor(feature, "upstream") + self._connectedFeaturesFor(
                    feature, "downstream"
                )

        return self._connectedFeaturesFor(feature, direction)

    def _connectedFeaturesFor(self, feature, direction):
        """
        Returns features directly reachable from FEATURE

        DIRECTION is 'upstream' or 'downstream'"""

        # Get field containing connection info
        field_name = self.featurePropFieldName(feature.feature_type, direction)
        if not field_name:
            return []

        # Get records
        recs = feature._field(field_name).recs(skip_bad_refs=True)

        # Apply filters
        return list(filter(self.includes, recs))
