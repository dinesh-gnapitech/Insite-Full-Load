// Copyright: IQGeo Limited 2010-2023
import { result, sortBy } from 'underscore';
import { UnitScale } from 'myWorld/base/unitScale';
import myw from 'myWorld/base/core';
import { msg } from 'myWorld/base/localisation';

//methods to mix into trace nodes
//A trace nodes has several trace properties and it's prototype is the corresponding feature
export const TraceNodeMixin = {
    tooltip() {
        return `<dl><dd class='result-title'>${this.getTitle()}</dd><dd>${this.getShortDescription()}</dd><dd>${this.metadata().join(
            '</dd><dd>'
        )}</dd></dl>`;
    },

    metadata() {
        const unitMetadata = this.traceResult.metadata_unit_scales ?? {
            dist: { scale: 'length', unit: 'm' }
        };
        const metadata = this.traceResult.metadata.map(propName => {
            let val = result(this, propName);
            if (val === undefined) return;

            if (unitMetadata[propName] && val !== null) {
                const scaleName = unitMetadata[propName]['scale'];
                const sourceUnit = unitMetadata[propName]['unit'];

                // ENH: Also check myw.config['core.unitSystem'], and derrive a display unit for
                // any scaleName from that. applicationDefinition should still override, probably.
                const displayUnit = myw.applicationDefinition.displayUnits[scaleName] ?? sourceUnit;

                const unitConfig = myw.config['core.units'][scaleName];
                const unitScale = new UnitScale(unitConfig);
                const unit = unitScale.value(val, sourceUnit);
                val = unit.toString(displayUnit);
            }

            const messageId = propName === 'dist' ? 'distance_key' : propName;

            let localisedPropName = msg('TracePlugin', messageId);
            // When no localisation is found
            if (localisedPropName.startsWith('TracePlugin.')) {
                const propNameDisplay = propName.charAt(0).toUpperCase() + propName.slice(1);
                localisedPropName = propNameDisplay.replace(/_/gi, ' ');
            }

            return `${localisedPropName}: ${val}`;
        });
        return metadata.filter(Boolean);
    },

    /**
     * Augments each traceNode with a spine identifier and returns a list of traceNodes representing the spine.
     * @return {Array} Returns an array representing the root spine (Longest path)
     */
    buildSpine() {
        let spine = [];
        let leaves = this.getLeaves();

        leaves = sortBy(leaves, 'dist').reverse();

        for (let i = 0; i < leaves.length; i++) {
            const branch = this._buildSpineFromEdge(leaves[i], []);

            for (let x = 0; x < branch.length; x++) {
                if (null == branch[x].spine) {
                    branch[x].spine = i;
                }
            }

            if (i == 0) {
                spine = branch;
            }
        }
        return spine;
    },

    _buildSpineFromEdge(node, spine) {
        const parent = node.parent;

        spine.unshift(node);
        if (parent) {
            this._buildSpineFromEdge(parent, spine);
        }
        return spine;
    },

    /**
     *   Find all leaf nodes from a starting node
     *
     **/
    getLeaves() {
        const leaves = [];
        this._findLeaves(this, leaves);
        return leaves;
    },

    _findLeaves(node, edges) {
        if (node.children.length) {
            for (let i = 0; i < node.children.length; i++) {
                this._findLeaves(node.children[i], edges);
            }
            return;
        }

        edges.push(node);
    }
};

export default TraceNodeMixin;
