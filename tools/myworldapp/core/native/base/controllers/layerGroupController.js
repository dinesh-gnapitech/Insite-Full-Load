// Copyright: IQGeo Limited 2010-2023
import { sortBy } from 'underscore';

import { BaseController } from './baseController';

export class LayerGroupController extends BaseController {
    async getAll() {
        // We assume that layer names will not include the '[' character
        // Layer group item information for a layer group is concatenated
        // into a single field which we then convert into an array in
        // _convertLayersToArray().
        // Layer group items are separated by the string '[['. Within
        // the layer group item the sequence number and name are separated
        // by a '[' character. For example:
        // 1[Rail Network[[2[Railway Stations[[3[Syracuse Gas Mains
        const records = await this.runSql(
            'select lg.id as id, lg.name as name, lg.display_name as display_name, lg.description as description,' +
                ' lg.thumbnail as thumbnail, lg.exclusive as exclusive,' +
                " group_concat(lgi.sequence || '[' || l.name,'[[') as layers" +
                ' from myw$layer_group lg, myw$layer_group_item lgi, myw$layer l' +
                ' where lgi.layer_group_id=lg.id and lgi.layer_id=l.id' +
                ' group by lg.id'
        );
        records.forEach(layerGroup => {
            // Convert boolean values as necessary
            if (layerGroup.exclusive !== null) {
                layerGroup.exclusive = layerGroup.exclusive === 1;
            }
            if (layerGroup.description === null) {
                layerGroup.description = '';
            }
            if (layerGroup.thumbnail === null) {
                layerGroup.thumbnail = '';
            }
            layerGroup.layers = this._convertLayersToArray(layerGroup.layers);
        });
        return records;
    }

    // Convert a layerString like this:
    // 1[Rail Network[[2[Railway Stations[[3[Syracuse Gas Mains
    // into a JavaScript array ordered by sequence number like this:
    // ["Rail Network","Railway Stations","Syracuse Gas Mains"]
    _convertLayersToArray(layersString) {
        const layerItemStrings = layersString.split('[[');
        const layerItems = layerItemStrings.map(layerItemString => {
            // We assume that the layer name won't contain a '[' character
            const details = layerItemString.split('[');
            return {
                sequence: parseInt(details[0]),
                name: details[1]
            };
        });
        return sortBy(layerItems, 'sequence').map(obj => obj.name);
    }
}
