// Copyright: IQGeo Limited 2010-2023
import { sortBy } from 'underscore';
import { ILayerControlWidget } from './layerControlWidget';
import StyleManager from 'myWorld/layers/styleManager';
import { renderMyWorldLegendIcon } from './renderLegendIcon';

/**
 * @class Provides legend for vector layers.
 * @name MyWorldLegendLayerControlWidget
 * @constructor
 * @extends {LayerControlWidget}
 */
export class MyWorldLegendLayerControlWidget extends ILayerControlWidget {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'vector-legend';

        this.prototype.events = {
            click: 'noop'
        };
    }

    constructor(options) {
        super(options);
        this.styleManager = this.options.layer.styleManager || new StyleManager();
    }

    async render() {
        const layer = this.options.layer;
        const featureTypes = layer.layerDef.feature_types;

        const withName = featureTypes.map(featureType =>
            Object.assign(featureType, {
                label: this._getFeatureExternalName(layer, featureType.name)
            })
        );
        const featureTypeNames = featureTypes.map(item => item.name);
        await layer.datasource.getDDInfoFor(featureTypeNames);
        const sorted = sortBy(withName, 'label');
        sorted.forEach(featureType => {
            renderMyWorldLegendIcon(this.$el, this.options.layer, this.styleManager, featureType);
        });
    }

    _getFeatureExternalName(layer, type) {
        return layer.datasource.featuresDD[type].external_name;
    }

    noop(ev) {
        ev.stopPropagation();
    }
}

export default MyWorldLegendLayerControlWidget;
