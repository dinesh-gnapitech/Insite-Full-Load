// Copyright: IQGeo Limited 2010-2023
import { latLng } from 'myWorld-base';
import { result } from 'underscore';

export class TraceNode {
    static {
        this.prototype.metadata = ['dist'];
        this.prototype.metadata_unit_scales = { dist: { scale: 'length', unit: 'm' } };
    }

    constructor(feature, dist, parent) {
        this.feature = feature;
        this.dist = dist;
        this.parent = parent;
        this.children = [];

        this.node_id = feature.getUrn();
        this.partial = false;
        this.full_dist = dist;
    }

    stopAt(dist) {
        this.dist = dist;
        this.partial = true;
    }

    // ========================== TREE BEHAVIOUR ======================

    ident() {
        return 'TraceNode( ' + this.dist + 'm,' + this.node_id + ',' + this.children.length + ' )';
    }

    definition(parentId) {
        const standardProps = ['dist', 'start_coord', 'stop_coord'];
        const props = {
            parent: parentId,
            feature: this.feature.getUrn()
        };
        let val;

        for (let prop of standardProps) {
            val = result(this, prop);
            if (val !== undefined) props[prop] = val;
        }

        for (let prop of this.metadata) {
            if (standardProps.includes(prop)) continue;
            val = this[prop];
            props[prop] = val;
        }
        return props;
    }

    start_coord() {
        if (!this.partial || !this.parent) return;

        const geom = this.feature.geometry;

        if (this.isForward(geom)) return geom.coordinates[0];
        else return geom.coordinates[geom.coordinates.length - 1];
    }

    stop_coord() {
        if (!this.partial || !this.parent) return;

        const geom = this.feature.geometry;
        let pos = (this.dist - this.parent.dist) / (this.full_dist - this.parent.dist);

        if (!this.isForward(geom)) pos = 1.0 - pos;

        return geom.pointAtDistance(pos * geom.length()).coordinates;
    }

    end_coord() {
        if (this.partial) return this.stop_coord();

        const geom = this.feature.geometry;

        if (this.isForward(geom)) return geom.coordinates[geom.coordinates.length - 1];
        else return geom.coordinates[0];
    }

    isForward(geom) {
        if (geom.type != 'LineString') return true;

        // Get upstream geometry
        // TODO: ENH if parent is in internals better to use geo_geom
        const parentGeom = this.parent.feature.geometry;

        // Check point self's end point on a vertex of parent (normally is)
        // TODO: Do points too
        if (parentGeom.type == 'LineString') {
            const coords = geom.coordinates;
            if (parentGeom.containsVertex(coords[0])) return true;
            if (parentGeom.containsVertex(coords[coords.length - 1])) return false;
        }

        // Find nearest end point on parent geom
        // Note: Workaround because geom.project(parentGeom) not safe on linestring (sometimes SEGVs)
        // TODO: Encapsulate this in geom library
        let pnt;
        if (parentGeom.type == 'LineString') {
            // Find nearest point
            const pnt1 = parentGeom.coordinates[0];
            const pnt2 = parentGeom.coordinates[parentGeom.coordinates.length - 1];

            pnt = geom.distanceTo(pnt1) < geom.distanceTo(pnt2) ? pnt1 : pnt2;
        } else {
            pnt = parentGeom;
        }

        // Find projection of point on self's geom
        const projectedPoint = geom.pointNearestTo(pnt);
        const pos = projectedPoint.distanceAlong / geom.length();

        return pos < 0.5;
    }

    minDistTo(geoms) {
        let self_coord = latLng(self.end_coord());
        let minDist = Infinity;
        for (const geom in geoms) {
            for (const coord in geom.coordinates) {
                let dist = self_coord.distanceTo(latLng(coord));
                if (minDist > dist) {
                    minDist = dist;
                }
            }
        }
        return minDist;
    }

    // ========================== TREE BEHAVIOUR ======================

    pruneToRootPath() {
        this.children = [];
        let node = this;

        while (node.parent) {
            node.parent.children = [node];
            node = node.parent;
        }
        return node;
    }

    tidy() {
        return this;
    }

    subTreeFeatures(featureTypes) {
        const features = [];
        const nodes = {};
        let stack = [this];

        while (stack.length) {
            const node = stack.pop();
            if (!featureTypes || featureTypes.includes(node.feature.table.name)) {
                const urn = node.feature.getUrn();
                if (!nodes[urn]) {
                    nodes[urn] = node;
                    features.push(node.feature);
                }
            }
            //Recurse (preserving order)
            stack = stack.concat(node.children.reverse());
        }
        return features;
    }

    asTraceResult(featureTypes) {
        const nodeDefs = {};
        const featureDefs = {};

        let nodeId = 0;
        const stack = [{ node: this, parentId: 0 }]; // Trace node and parentId

        while (stack.length) {
            const item = stack.pop();
            const node = item.node;

            // Case: In requested types .. so add a node
            if (!featureTypes || featureTypes.includes(node.feature.getType())) {
                nodeId++;
                nodeDefs[nodeId] = node.definition(item.parentId);

                const featureUrn = node.feature.getUrn();
                if (!featureDefs[featureUrn]) {
                    featureDefs[featureUrn] = node.feature; //ENH.asGeojsonFeature(**feature_aspects)
                }
            } else {
                // Case: Skip the node
                nodeId = item.parentId;
            }

            // Recurse on children
            const children = node.children.reverse();
            for (let i = 0; i < children.length; i++) {
                stack.push({ node: children[i], parentId: nodeId });
            }
        }

        return {
            metadata: this.metadata,
            metadata_unit_scales: this.metadata_unit_scales,
            nodes: nodeDefs,
            features: featureDefs
        };
    }
}
