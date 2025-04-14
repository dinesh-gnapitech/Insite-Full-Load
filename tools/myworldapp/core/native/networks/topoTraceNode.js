// Copyright: IQGeo Limited 2010-2023
import { TraceNode } from './traceNode';

export class TopoTraceNode extends TraceNode {
    constructor(feature, dist, topoNode, parent, topoLink) {
        super(feature, dist, parent);
        this.topo_node = topoNode;
        this.topo_link = topoLink;

        this.link_start_dist = parent ? parent.dist : 0;

        if (topoLink) this.node_id += '-' + topoLink.getUrn();
        else if (topoNode) this.node_id += '-' + topoNode.getUrn();
    }

    stopAt(dist) {
        TraceNode.prototype.stopAt.call(this, dist);

        //Enable trace from other end of link
        this.node_id += '-from-' + this.topo_node.getUrn();
    }

    //Consolidate consecutive links in self's sub-tree
    //Returns self
    tidy() {
        let nodes = [this];
        while (nodes.length) {
            const node = nodes.pop();
            while (
                node.children.length == 1 &&
                node.children[0].feature.getUrn() == node.feature.getUrn()
            ) {
                const childNode = node.children[0];

                node.link_start_dist = node.dist;
                node.dist = childNode.dist;
                node.partial = childNode.partial;
                node.full_dist = childNode.full_dist;
                node.topo_node = childNode.topo_node;
                node.topo_link = childNode.topo_link;
                node.children = childNode.children;
            }
            nodes = nodes.concat(node.children);
        }
        return this;
    }

    start_coord() {
        if (!this.parent || !this.topo_link) return;

        const geom = this.parent.topo_node.geometry;
        return geom.coordinates;
    }

    stop_coord() {
        if (!this.parent || !this.topo_link) return;
        if (!this.partial) return this.topo_node.geometry.coordinates;

        const geom = this.topo_link.geometry;
        const forward = this.topo_link.properties.node2 == this.topo_node.getUrn();

        let stopPos = (this.dist - this.link_start_dist) / (this.full_dist - this.link_start_dist);
        if (!forward) stopPos = 1 - stopPos;

        const stopPoint = geom.pointAtDistance(stopPos * geom.length());
        return stopPoint.coordinates;
    }

    end_coord() {
        let end = this.stop_coord();

        if (!end) {
            end = this.topo_node.geometry.coordinates;
        }

        return end;
    }
}
