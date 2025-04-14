// Copyright: IQGeo Limited 2010-2023
import { indexBy } from 'underscore';
import geometry from 'myWorld/base/geometry';
import { FeatureSet } from 'myWorld/features/featureSet';
import { TraceNodeMixin } from 'myWorld/features/traceNodeMixin';

export class TraceResult extends FeatureSet {
    static {
        this.prototype.type = 'trace';
        this.prototype.isTraceResult = true;
        this.prototype.modifiable = false;
    }

    /**
     * @class  A set of {@link Feature}
     * @constructs
     * @augments FeatureSet
     */
    constructor(nodes, features, metadata, metadata_unit_scales) {
        super();
        this.metadata = metadata;
        this.metadata_unit_scales = metadata_unit_scales;

        nodes = this._processRawNodes(nodes, features, metadata);
        this.start = nodes[1];
        this.nodes = nodes;

        this.addAll(allChildren(this.start));
    }

    /** shallow copy of self */
    clone() {
        const c = new TraceResult();
        c.start = this.start;
        c.nodes = this.nodes;
        c.items = this.items;
        c._itemsByUrn = this._itemsByUrn;
        return c;
    }

    /*
     * Process nodes as obtained from server and convert to nodes with behaviour
     * Results include feature behaviour, parent/child relationships, distance
     * @param  {Object<node>} nodes    As returned by server. Keyed on urn
     * @param  {Feature} features
     * @return {Object<Feature>} Keyed on urn (as per nodes parameter)
     * @private
     */
    _processRawNodes(nodes = {}, features) {
        const featuresByUrn = indexBy(features, f => f.getUrn(true));
        // result node is an object which inherits from the feature and has trace node behaviour
        const nodeFeatures = Object.fromEntries(
            Object.entries(nodes).map(([index, node]) => {
                const feature = featuresByUrn[node.feature];
                const nodeFeature = Object.create(feature);
                Object.assign(nodeFeature, TraceNodeMixin, node, {
                    idQualifier: index,
                    feature: feature,
                    children: [],
                    traceResult: this
                });

                const nodeGeom = this._getNodeGeom(nodeFeature);
                if (nodeGeom) nodeFeature.geometry = nodeGeom;

                return [index, nodeFeature];
            })
        );
        //now we have all featurenodes, replace parent ids with actual references and fill in children
        Object.values(nodeFeatures).forEach(node => {
            node.parent = nodeFeatures[node.parent];
            if (node.parent) node.parent.children.push(node);
        });
        return nodeFeatures;
    }

    //returns a geometry for a given node
    //returns undefined if the node doesn't include any details about the geometry
    _getNodeGeom(node) {
        if (node.geom) {
            return geometry(node.geom);
        } else if (node.start_coord || node.stop_coord) {
            const geom = geometry(node.feature.geometry);
            if (typeof geom.slice == 'function')
                return geom.slice(node.start_coord, node.stop_coord);
        } //else node with 'inherit' feature's geometry
    }
}

function allChildren(node) {
    if (!node) return [];
    return node.children.reduce(
        (acc, childPath) => {
            if (childPath.children) return acc.concat(allChildren(childPath));
            else return acc;
        },
        [node]
    );
}

export default TraceResult;
