// Copyright: IQGeo Limited 2010-2023
import { msg } from 'myWorld/base/localisation';

export default {
    messageGroup: 'TracePlugin',
    /*
     * Get a features available network and and trace directions;
     * @param  feature  Feature
     * @param  {String} defaultNetwork Specify a network will set the direction, By default first network is used.
     * @return {Object} Representing directions, avaiable networks and selected network used to determine possible directions
     */
    getFeatureNetwork(feature, defaultNetwork) {
        return feature.getNetworks().then(this._getNetworks);
    },

    determineDirection(directed) {
        if (directed) {
            return [
                { id: 'upstream', label: msg(this.messageGroup, 'upstream') },
                { id: 'downstream', label: msg(this.messageGroup, 'downstream') },
                { id: 'both', label: msg(this.messageGroup, 'both') }
            ];
        }
        return [{ id: 'both', label: msg(this.messageGroup, 'both') }];
    },

    _getNetworks(res) {
        return { networks: res || {} };
    },

    _buildSubPaths(paths) {
        return Object.entries(paths || {}).map(([id, label]) => ({
            id,
            label
        }));
    }
};
