// Copyright: IQGeo Limited 2010-2023
import { FilterParser, trace as mywTrace } from 'myWorld-base';
import Heap from 'heap';

const trace = mywTrace('tracing');

export class NetworkEngine {
    static newFor(view, definition, extraFilters) {
        const engineName = definition.engine;
        const EngineClass = NetworkEngine.engines[engineName];

        if (!EngineClass) throw new Error('Cannot find network engine: ' + engineName);

        return new EngineClass(view, definition, extraFilters);
    }

    static engines = {};

    // Determines whether A* optimisation using great circle distances can be enabled.
    static euclidean = true;

    /**
     * @class Abstract superclass for network tracing engines
     * @param  {FeatureView} dbView
     * @param  {object} definition
     * @param  {object} extraFilters
     * @constructs
     */
    constructor(dbView, definition, extraFilters) {
        /**
         * @type {FeatureView}
         */
        this.view = dbView.getReadonlyView();
        /**
         * @type {object}
         */
        this.networkDef = definition;
        /**
         * @type {object}
         */
        this.extraFilters = extraFilters || {};

        this._buildPredicates();

        this.initialized = this.view.getUnitScale('length').then(unitScale => {
            this.lengthScale = unitScale;
            return this;
        });
    }

    _buildPredicates() {
        //predicates per feature type
        this.predicates = {};

        Object.entries(this.networkDef.feature_types).forEach(([featureType, props]) => {
            // Get filter from configuration (if present)
            let filter = props.filter;

            //Add filter passed into constructor (if present)
            //ENH: Could add after compilation using MywDbPredicate.and()
            const extraFilter = this.extraFilters[featureType];
            if (extraFilter) {
                if (filter) filter = `(${filter}) & (${extraFilter})`;
                else filter = extraFilter;
            }

            // Compile it
            if (filter) {
                this.predicates[featureType] = new FilterParser(filter).parse();
            }
        });
    }

    // ======================== TRACING OPS =======================
    subPathsFor() {
        return null;
    }

    async traceOut(fromUrn, options) {
        trace(2, 'Tracing from', fromUrn, ':', options);
        const direction = options.direction || 'both';

        await this.initialized;
        const result = await this._trace(fromUrn, direction, options);
        return result.root.tidy();
    }

    async shortestPath(fromUrn, toUrn, options) {
        trace(2, 'Finding path', fromUrn, '->', toUrn);

        options = Object.assign({}, options, { stopUrns: [toUrn] });

        await this.initialized;
        const result = await this._trace(fromUrn, 'both', options);
        const toNode = result.stop;
        return toNode?.pruneToRootPath().tidy();
    }

    async _trace(fromUrn, direction, options) {
        // Add start node
        const rootNode = await this.rootNode(fromUrn, direction);
        let cmp = (a, b) => {
            let a_dist = a.minPossibleDist;
            let b_dist = b.minPossibleDist;
            if (a_dist == undefined || b_dist == undefined) {
                a_dist = a.dist;
                b_dist = b.dist;
            }
            return a_dist - b_dist;
        };
        const activeNodes = new Heap(cmp); // TraceNodes in the 'wave front'
        const visitedNodes = {}; // Paths we have encountered so far
        visitedNodes[rootNode.node_id] = true;

        const stopUrns = options.stopUrns;
        if (this.euclidean && stopUrns) {
            const stopGeoms = await this._getStopGeoms(stopUrns);
            options = { ...options, stopGeoms };
        }

        const stop = await this._traceNode(
            rootNode,
            activeNodes,
            visitedNodes,
            direction,
            rootNode,
            options
        );
        return { root: rootNode, stop: stop };
    }

    async _traceNode(node, activeNodes, visitedNodes, direction, rootNode, options) {
        const nodeUrn = node.feature.getUrn();
        const stopUrns = options.stopUrns || [];
        const stopGeoms = options.stopGeoms || [];
        trace(4, 'Processing:', node.ident());

        // Check for found stop node
        if (stopUrns.includes(nodeUrn)) return node;

        let connectedNodes; //promise
        // Check for node beyond distance limit
        if (node.partial) {
            connectedNodes = [];
        } else {
            connectedNodes = await this.connectedNodes(node, direction, rootNode);
        }
        // Add end nodes of connected items to wavefront
        connectedNodes.forEach(connNode => {
            trace(5, '  Connection:', connNode.ident());

            // Check for already found
            if (visitedNodes[connNode.node_id]) {
                trace(8, '  Already visited');
                return;
            }

            // Check for end beyond distance limit
            // Note: This may change the node_id
            if (options.maxDist && connNode.dist > options.maxDist) {
                trace(7, '  Beyond max dist');
                connNode.stopAt(options.maxDist);
            }

            //Prevent cycles
            visitedNodes[connNode.node_id] = true;

            // Prevent memory overflow etc
            if (options.maxNodes && Object.keys(visitedNodes).length > options.maxNodes) {
                trace(4, '  Visited nodes exceeds max:', options.maxNodes);
                throw new Error('Trace size limit exceeded');
            }

            // Add to wavefront
            trace(6, '  Activating:', connNode.ident());
            if (this.euclidean) {
                connNode.minPossibleDist = connNode.dist + connNode.minDistTo(stopGeoms);
            }
            activeNodes.push(connNode);

            node.children.push(connNode);
        });

        if (activeNodes.empty()) return;

        // Move to next closest node
        const nextNode = activeNodes.pop();
        return this._traceNode(nextNode, activeNodes, visitedNodes, direction, rootNode, options);
    }

    // ======================== HELPERS =======================

    //returns promise which resolves to record URN (or null)
    async featureRecFor(urn, networkOnly) {
        //TODO: have options be passed in
        const rec = await this.view
            .get(urn, { displayValues: true, includeGeoGeometry: true })
            .catch(reason => {
                console.log('Warning: ', urn, ': ', reason);
                return null;
            });

        if (!rec) {
            trace(5, 'No such feature:', urn);
            return null;
        }

        if (networkOnly && !this.includesFeature(rec)) {
            trace(8, 'Not element:', urn);
            return null;
        }
        return rec;
    }

    includesFeature(feature) {
        //can't be named includes due to class
        const featureType =
            typeof feature.getType == 'function'
                ? feature.getType()
                : feature.featureDef.feature_name;
        if (!(featureType in this.networkDef.feature_types)) {
            return false;
        }

        const pred = this.predicates[featureType];
        if (pred) return pred.matches(feature);
        else return true;
    }

    lengthOf(featureRec) {
        //Length of featureRec for tracing purposes (in m)

        let length = this.featureProp(featureRec, 'length', 'm');
        if (length !== null) {
            trace(10, featureRec, 'Got length from record:', length);
            return length;
        }

        // Compute from geometry
        // ENH: Warn if geom is in internal world (where units will be wrong)
        length = featureRec.geodeticLength();
        trace(10, featureRec.getUrn(), 'Computed length:', length);

        return length;
    }

    featureProp(featureRec, prop, unit) {
        //Value of configured property prop (or null)
        //Get configured field name for property
        const fieldName = this.featurePropFieldName(featureRec.table.name, prop);
        if (!fieldName) return null;

        //Get field value
        let val = featureRec.properties[fieldName];
        if (val === undefined) return null;

        if (val && unit) {
            const fieldUnit = featureRec.featureDef.fields[fieldName].unit;
            val = this.lengthScale.convert(val, fieldUnit, 'm');
        }

        return val;
    }

    featurePropFieldName(featureType, prop) {
        // The field of FEATURE_TYPE to use for configured property PROP (if set)
        //
        // PROP is the name of a configurable field property in a
        // network definition ('upstream', 'downstream' or 'length')
        //
        // Returns None if the property is not configured for FEATURE_REC

        // Get configuration for feature type
        // ENH: Warn if not in network?
        const featureProps = this.networkDef.feature_types[featureType];
        if (!featureProps) return;

        // Get configured field name for property
        return featureProps[prop];
    }

    urnFor(feature, field) {
        // urn for object referenced by FIELD (a reference or foreign_key field)

        let val = feature.properties[field];
        if (!val) return val;

        const fieldDesc = feature.featureDef.fields[field];

        if (fieldDesc.baseType() == 'foreign_key') {
            val = fieldDesc.targetTableName() + '/' + val;
        }
        return val;
    }

    parseUrn(urn) {
        let qualifiers = {};
        const parts = urn.split('?');
        if (parts.length > 1) {
            urn = parts[0];
            qualifiers = Object.fromEntries(new URLSearchParams(parts[1]).entries());
        }

        return { urn, qualifiers };
    }

    async _getStopGeoms(stopUrns) {
        let stopGeoms = [];
        for (let stopUrn in stopUrns) {
            let stopFeat = await this.featureRecFor(stopUrn);
            if (stopFeat?.geometry) {
                stopGeoms.push(stopFeat.geometry);
            }
        }
        return stopGeoms;
    }
}
