// Copyright: IQGeo Limited 2010-2023
import { trace } from 'myWorld/base';
import { ILayerControlWidget } from './layerControlWidget';

/**
 * @class Provides a legend for GeoServer backed layers.
 * @name OgcLegendLayerControlWidget
 * @constructor
 * @extends {LayerControlWidget}
 */
export class OgcLegendLayerControlWidget extends ILayerControlWidget {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'ogc-legend';

        this.prototype.events = {
            click: 'noop'
        };
    }

    render() {
        const layer = this.options.layer;
        const ds = layer.datasource;

        ds.ensureLoggedIn()
            .then(() => ds.getLegendInfo(layer.layerDef))
            .then(urls => {
                for (let url of urls) {
                    this.$el.append(`<div><img src="${url}"/></div>`);
                }
            })
            .catch(reason => {
                trace('ogc', 1, 'Unable to obtain legends : ', reason);
                return [];
            });
    }

    noop(ev) {
        ev.stopPropagation();
    }
}

export default OgcLegendLayerControlWidget;
