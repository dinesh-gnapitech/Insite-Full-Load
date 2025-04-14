// Copyright: IQGeo Limited 2010-2023
import { NetworkEngine } from './networkEngine';
import { TraceNode } from './traceNode';

export class GraphNetworkEngine extends NetworkEngine {
    //Create the start node for URN
    async rootNode(urn, direction) {
        const feature = await this.featureRecFor(urn);
        return new TraceNode(feature, 0.0);
    }

    //Returns nodes directly reachable from NODE
    // DIRECTION is 'upstream', 'downstream' or 'both'
    async connectedNodes(node, direction) {
        const featureRecs = await this.connectedFeaturesFor(node.feature, direction);
        const nodes = featureRecs.map(featureRec => {
            if (!featureRec) return;
            const featureLen = this.lengthOf(featureRec); // ENH: Do lazily
            return new TraceNode(featureRec, node.dist + featureLen, node);
        });
        return nodes.filter(Boolean);
    }

    async connectedFeaturesFor(feature, direction) {
        let recs;
        if (direction == 'both' || !this.networkDef.directed) {
            let upstreamFieldName = this.featurePropFieldName(feature.table.name, 'upstream');
            let downstreamFieldName = this.featurePropFieldName(feature.table.name, 'downstream');

            if (upstreamFieldName == downstreamFieldName) {
                recs = await this._connectedFeaturesFor(feature, 'upstream');
            } else {
                const upstream = await this._connectedFeaturesFor(feature, 'upstream');
                const downstream = await this._connectedFeaturesFor(feature, 'downstream');
                recs = upstream.concat(downstream);
            }
        } else {
            recs = await this._connectedFeaturesFor(feature, direction);
        }
        return recs;
    }

    async _connectedFeaturesFor(feature, direction) {
        let fieldName = this.featurePropFieldName(feature.table.name, direction);
        if (!fieldName) return [];

        //get records
        const recs = await feature.followRelationship(fieldName);

        //apply features
        return recs.filter(this.includesFeature.bind(this));
    }
}

NetworkEngine.engines['myw_graph_network_engine'] = GraphNetworkEngine;
