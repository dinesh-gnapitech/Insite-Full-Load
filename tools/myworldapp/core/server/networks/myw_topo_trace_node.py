################################################################################
# myWorld Link/Node Network Engine
################################################################################
# Copyright: IQGeo Limited 2010-2023

from .myw_trace_node import MywTraceNode


class MywTopoTraceNode(MywTraceNode):
    """
    A node in a hidden link-node connectivity model trace result

    Adds extra properties:
      topo_node   Topological node at which self ends
      topo_link   Topological link that self represents

    Note: After consolidation, a node may represent a sequence
    of connected topological links along the same feature of
    which topo_link is the last (see .tidy())"""

    def __init__(self, feature, dist, topo_node, parent=None, topo_link=None):
        """
        Init slots of self
        """

        super(MywTopoTraceNode, self).__init__(feature, dist, parent=parent)

        self.topo_node = topo_node
        self.topo_link = topo_link
        self.link_start_dist = parent.dist if parent else 0

        if topo_link:
            self.node_id += "-" + topo_link._urn()
        elif topo_node:
            self.node_id += "-" + topo_node._urn()

    def stopAt(self, dist):
        """
        Trim self back to distance DIST from root

        Marks self as a partial link"""

        super(MywTopoTraceNode, self).stopAt(dist)

        # Enable trace from other end of link
        self.node_id += "-from-" + self.topo_node._urn()

    def tidy(self):
        """
        Consolidate consecutive links in self's sub-tree

        Returns self"""

        nodes = [self]

        while nodes:
            node = nodes.pop()

            while len(node.children) == 1 and (node.children[0].feature == node.feature):
                child_node = node.children[0]

                node.link_start_dist = node.dist
                node.dist = child_node.dist  # ENH: Invert the copy?
                node.partial = child_node.partial
                node.full_dist = child_node.full_dist
                node.topo_node = child_node.topo_node
                node.topo_link = child_node.topo_link
                node.children = child_node.children

            nodes += node.children

        return self

    @property
    def start_coord(self):
        """
        Point on self's feature at which self starts
        """

        if not self.parent or not self.topo_link:
            return None

        res = self.parent.topo_node.primaryGeometry().coords[0]
        return res

    @property
    def stop_coord(self):
        """
        Point on self's feature at which self ends
        """

        if not self.parent or not self.topo_link:
            return None

        if not self.partial:  # ENH: Do better if root node
            return self.topo_node.primaryGeometry().coords[0]

        # Get link geometry (and its direction)
        # Note: This is last link in sequence if node has been consoliated (see tidy)
        geom = self.topo_link.primaryGeometry()
        forward = self.topo_link._field("node2").urn() == self.topo_node._urn()  # ENH: Encapsulate?

        # Work out position of point along link
        pos = (self.dist - self.link_start_dist) / (self.full_dist - self.link_start_dist)
        if not forward:
            pos = 1 - pos

        # Compute coordinate at that position
        return geom.geoCoordAtPos(pos)

    @property
    def end_coord(self):
        """
        Position on self's feature at which self ends
        Different from stop_coord, because it is always defined for A*
        distance remaining estimate.
        """
        end = self.stop_coord

        if end is None:
            end = self.topo_node.primaryGeometry().coords[0]

        return end
