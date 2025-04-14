// Copyright: IQGeo Limited 2010-2023
import { geometry } from 'myWorld-base';
import { NetworkEngine } from './networkEngine';
import { TopoTraceNode } from './topoTraceNode';
export * from './topoTraceNode';

export class TopoNetworkEngine extends NetworkEngine {
    constructor(...args) {
        super(...args);

        //this is engine uses linestring lengths which requires initialisation of geometry
        this.initialized = this.initialized.then(() => geometry.init());
    }

    //Create the start node for URN
    async rootNode(urn, direction) {
        const feature = await this.featureRecFor(urn);
        const upstreamFeature = await this._topoNodeFor(feature, 'upstream');
        return new TopoTraceNode(feature, 0.0, upstreamFeature);
    }

    // Nodes directly reachable from NODE
    // DIRECTION is 'upstream', 'downstream' or 'both'
    // Returns Promise( array<TopoTraceNode> )
    async connectedNodes(node, direction, rootNode) {
        const ownerUrn = this.urnFor(node.topo_node, 'owner');

        if (ownerUrn && ownerUrn != node.feature.getUrn()) {
            const ownerRec = await this.featureRecFor(ownerUrn, true);
            if (!ownerRec) return [];
            const connNode = new TopoTraceNode(ownerRec, node.dist, node.topo_node, node);
            return [connNode];
        } else {
            return this._connectedNodesViaLinks(node, direction, rootNode);
        }
    }

    // Nodes directly reachable via the links of NODE.topo_node
    // DIRECTION is 'upstream', 'downstream' or 'both'
    // Returns Promise( array<TopoTraceNode> )
    async _connectedNodesViaLinks(node, direction, rootNode) {
        const topoLinks = await this._referencedFeatures(node.topo_node, 'links');
        const promises = topoLinks.map(value =>
            (async topoLink => {
                // Avoid going back the way we came
                if (topoLink.getUrn() == node.topo_link?.getUrn()) return;

                const featureRec = await this.featureRecFor(topoLink.properties.owner, true);
                if (!featureRec) return;
                // Find topo node at other end
                const topoNode = await this._otherNodeOf(topoLink, node.topo_node);
                // Compute distance of topo node at other end from root node
                const isRootFeature = featureRec.getUrn() == rootNode.feature.getUrn();
                const topoNodeDist = isRootFeature
                    ? 0
                    : node.dist + this.lengthOfLink(topoLink, featureRec);

                return new TopoTraceNode(featureRec, topoNodeDist, topoNode, node, topoLink);
            })(value)
        );
        const nodes = await Promise.all(promises);
        return nodes.filter(Boolean);
    }

    // The (valid) features referenced by FIELDNAME of FEATURE
    // Returns Promise( array<feature> )
    _referencedFeatures(feature, fieldName) {
        return feature.followRelationship(fieldName);
    }

    //Length of TOPO_LINK for tracing purposes (in m)
    //FEATURE_REC is the owner of TOPO_LINK
    lengthOfLink(topoLink, featureRec) {
        // ENH: Do less work here .. e.g. check for single link feature

        // Compute proportion of total feature covered by link
        const ftrGeomLength = featureRec.geodeticLength();
        const linkGeomLength = topoLink.geodeticLength();
        const prop = linkGeomLength / ftrGeomLength;

        // Get measured length of feature (if configured)
        const ftrMeasuredLength = this.lengthOf(featureRec);

        return prop * ftrMeasuredLength;
    }

    _otherNodeOf(topoLink, topoNode) {
        let urn = this.urnFor(topoLink, 'node1');

        if (urn == topoNode.getUrn()) urn = this.urnFor(topoLink, 'node2');

        return this.featureRecFor(urn);
    }

    async _topoNodeFor(feature, direction) {
        // Get field containing node
        const props = this.networkDef.feature_types[feature.table.name];
        const directionFieldName = props?.[direction];
        if (!directionFieldName) return null;

        // Get node record
        const nodes = await feature.followRelationship(directionFieldName);
        if (nodes.length == 0) return null;

        return nodes[0];
    }
}

NetworkEngine.engines['myw_topo_network_engine'] = TopoNetworkEngine;
