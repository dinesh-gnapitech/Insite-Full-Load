// Copyright: IQGeo Limited 2010-2023
import { trace } from 'myWorld/base';
import { StyleManager } from 'myWorld/layers/styleManager';
import { ILayerControlWidget } from './layerControlWidget';
import { renderOLLegendIcon, renderMyWorldLegendIconFromStyle } from './renderLegendIcon';

/**
 * @class Allows Opacity control for a layer.
 * @name EsriLegendLayerControlWidget
 * @constructor
 * @extends {LayerControlWidget}
 */
export class EsriLegendLayerControlWidget extends ILayerControlWidget {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'esri-legend';

        this.prototype.events = {
            click: 'noop'
        };
    }

    render() {
        const layer = this.options.layer;
        const ds = layer.datasource;
        const layerType = ds.options.esriServerType;

        switch (layerType) {
            case 'MapServer':
                return this.render_mapServer();

            case 'FeatureServer':
                return this.render_featureServer();
        }
    }

    render_mapServer() {
        const layer = this.options.layer;
        const ds = layer.datasource;
        const esriMapName = layer.layerDef.esriMap;
        const esriMapDef = ds.maps[esriMapName];

        ds.ensureLoggedIn()
            .then(() => ds.getLegendInfo(layer.layerDef))
            .catch(reason => {
                trace('esri', 1, `Unable to obtain legend for ${esriMapName}: `, reason);
                return [];
            })
            .then(result => {
                result.layers.forEach(layerResult => {
                    const featureTypeInfo = esriMapDef.find(
                        def => def.layerId === layerResult.layerId
                    );
                    const externalName = featureTypeInfo
                        ? featureTypeInfo.external_name
                        : layerResult.layerName;
                    if (layerResult.legend.length > 1) {
                        this.$el.append(`<div class="heading">${externalName}</div>`);
                    }
                    layerResult.legend.forEach(legendItem => {
                        const label = legendItem.label?.length
                            ? legendItem.label
                            : layerResult.legend.length > 1
                            ? ''
                            : externalName;
                        this.$el.append(
                            `<div><div class="icon"><img height="16px" src="data:${legendItem.contentType};base64,${legendItem.imageData}"/></div><span class="label">${label}</span>`
                        );
                    });
                });
            });
    }

    async render_featureServer() {
        const layer = this.options.layer;
        await layer.initialized;
        const featureRendering = layer.layerDef.featureRendering;

        this.$el.removeClass('esri-legend').addClass('vector-legend');
        const legend = layer.maplibLayer.getLegendInfo();
        for (let [featureType, info] of Object.entries(legend)) {
            const renderingFeatureType = featureRendering?.[featureType] ?? 'esri';
            if (renderingFeatureType == 'esri') {
                const node = this._createFeatureServerLegendContainer(info.label, info.legendInfo);
                this.$el.append(node);
            } else if (renderingFeatureType == 'myworld') {
                if (!this.styleManager) this.styleManager = new StyleManager();
                const label = layer.datasource.featuresDD[featureType].external_name;
                renderMyWorldLegendIconFromStyle(
                    this.$el,
                    info.legendInfo.mywStyle,
                    info.legendInfo.layerFeatureItem,
                    label
                );
            }
        }
    }

    /**
     * Generates a set of DOM elements that house legend info, will be called recursively for layered entries
     * @param {string} label The name of the legend entry
     * @param {object} info Is one of two object types. For a single layer legend, it contains a style (OpenLayers style) and type (GeoJSON type)
     * For a multi-layer legend, it is an object that contains a legend name for keys and an info object for its value
     * @returns DOM structure containing legend
     */
    _createFeatureServerLegendContainer(label, info) {
        const style = info.style;
        const type = info.type;
        const legendInfo = document.createElement('div');
        if (style && type) {
            //  This is a flat legend info
            legendInfo.classList.add('legend-container');
            const iconNode = document.createElement('div');
            iconNode.classList.add('icon');
            iconNode.appendChild(renderOLLegendIcon(type, style));
            legendInfo.appendChild(iconNode);
            const name = document.createElement('span');
            name.classList.add('label');
            name.innerHTML = label;
            legendInfo.appendChild(name);
        } else {
            //  This is a layered legend info
            for (const [name, subInfo] of Object.entries(info)) {
                const subName = `${label} - ${name}`;
                const legendEntry = this._createFeatureServerLegendContainer(subName, subInfo);
                legendInfo.appendChild(legendEntry);
            }
        }
        return legendInfo;
    }

    noop(ev) {
        ev.stopPropagation();
    }
}

export default EsriLegendLayerControlWidget;
