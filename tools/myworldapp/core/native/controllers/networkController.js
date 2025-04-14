// Copyright: IQGeo Limited 2010-2023
import { intersection, pick, sortBy } from 'underscore';
import { trace } from 'myWorld-base';
import { BaseController } from '../base/controllers';
import { NetworkEngine } from '../networks/networkEngine';

export class NetworkController extends BaseController {
    /**
     * Returns the networks a given feature can be part of
     * @param  {MyWorldFeature} feature
     * @return {Promise}         Network definition keyed on network name
     */
    async getNetworksFor(feature) {
        //For each network ..
        const networks = await this._db.cachedTable('network').all();
        const promises = networks.map(value =>
            (async network => {
                let engine;
                await network.setFeatureItems();
                engine = this._networkEngineFor(network);
                const subPaths = await engine.subPathsFor(feature);
                return { network, engine, subPaths };
            })(value)
        );
        const results = await Promise.all(promises);
        const sorted = sortBy(results, 'network', 'name');
        const networkInfos = sorted.reduce((prev, result) => {
            const { network, engine, subPaths } = result;
            if (subPaths || engine.includesFeature(feature)) {
                const info = pick(engine.networkDef, ['topology', 'directed', 'external_name']);
                info.sub_paths = subPaths;
                prev[network.name] = info;
            }
            return prev;
        }, {});
        return networkInfos;
    }

    /**
     * Find connected network objects
     * @param {string}   network  Name of network to trace through
     * @param {string}   featureUrn  Start feature urn
     * @param {boolean}  options.direction Direction to trace in (upstream|downstream|both)
     * @param {string}   options.resultType  Structure of results: 'features' or 'tree'
     * @param {number}   [options.maxDist]  Max distance to trace to, in meters
     * @param {string[]} [options.resultFeatureTypes]  Feature types to include in result
     * @param {Object<string>} [options.filters]  Filters keyed on feature type
     * @return {Promise<Array<Feature>>}  Connected features
     */
    async traceOut(network, featureUrn, options) {
        //Create engine
        const networkRec = await this._db.cachedTable('network').get(network);
        await networkRec.setFeatureItems();
        const engine = this._networkEngineFor(networkRec, options.filters);

        //Perform trace
        const tree = await engine.traceOut(featureUrn, options); // TODO: Handle no-such-feature and other errors

        return this.resultFrom(tree, options.resultType, options.resultFeatureTypes);
    }

    /**
     * Find shortest path through a network
     * @param {string}    network  Name of network to trace through
     * @param {Feature}    startUrn  Start feature urn
     * @param {string}    toUrn  URN of destination feature
     * @param {string}   options.resultType  Structure of results: 'features' or 'tree'
     * @param {number}   [options.maxDist]  Max distance to trace to, in meters
     * @param {string[]} [options.resultFeatureTypes]  Feature types to include in result
     * @return {Promise<Array<Feature>>}  Path to destination feature (empty if not reachable)
     */
    async shortestPath(network, startUrn, toUrn, options) {
        const networkRec = await this._db.cachedTable('network').get(network);
        await networkRec.setFeatureItems();
        const engine = this._networkEngineFor(networkRec, options.filters);

        //Perform trace
        const tree = await engine.shortestPath(startUrn, toUrn, options); // TODO: Handle no-such-feature and other errors
        return this.resultFrom(tree, options.resultType, options.resultFeatureTypes);
    }

    async resultFrom(tree, resultType, featureTypes) {
        if (!tree) return resultType == 'features' ? { features: [] } : {};

        const featureTypeDefs = await this.currentUser.getAppFeatureTypeDefs();
        const accessibleFeatureTypes = Object.values(featureTypeDefs).map(def => {
            const dsName = def.datasource_name;
            return dsName == 'myworld' ? def.feature_name : `${dsName}/${def.feature_name}`;
        });
        if (featureTypes) {
            featureTypes = intersection(featureTypes, accessibleFeatureTypes);
        } else {
            featureTypes = accessibleFeatureTypes;
        }

        if (resultType == 'features') {
            //ENH: include display_values and geo_geometry
            return { features: tree.subTreeFeatures(featureTypes) };
        } else if (resultType == 'tree') {
            return tree.asTraceResult(featureTypes);
        } else {
            throw new Error('Bad result type: ', resultType);
        }
    }

    _networkEngineFor(networkRec, extraFilters) {
        trace('network', 1, 'Constructing engine for network:', networkRec.name, extraFilters);
        // Create a new readonly view, lifetime the same as the network engine (i.e. per request)
        let readonlyView = this.view.getReadonlyView();
        return NetworkEngine.newFor(readonlyView, networkRec, extraFilters);
    }
}
