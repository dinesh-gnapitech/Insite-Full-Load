// Copyright: IQGeo Limited 2010-2023
import { argsAsURI } from 'myWorld/base/util';
import StyleManager from './styleManager';
import ClippedTileLayerMixin from './clippedTileLayerMixin';
import OlVectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MywGeoJSONFormat from './mywGeoJSONFormat';
import MywMVTFormat from './mywMVTFormat';
import { getTileGridFor } from './tileLayerUtils';

export class MywVectorTileLayer extends OlVectorTileLayer {
    /**
     * Vector Tile layer for tiles supplied by the myWorld tile server.<br/>
     * Not recommended to use with styles scaled in meters as it uses OpenLayers' VectorTileLayer which does clipping
     * of each tile causing major problems to render (text or symbol) styles that cover big sections of tiles
     * Also, several instances quickly multiply number of requests. e.g. 10 layers, 12 tiles -> 120 requests to render a map - browsers throttle this
     * Extends {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_VectorTile-VectorTileLayer.html|VectorTileLayer}
     * @mixes ClippedTileLayerMixin
     * @constructs
     * @param {object} options Options as specified for {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_VectorTile-VectorTileLayer.html}
     * @param {string} [attributions] Attributions to pass to source
     * @param {object} [mapboxStyles] Mapbox styles that will be applied as per {@link https://github.com/openlayers/ol-mapbox-style/#applystyle} and {@link https://github.com/openlayers/ol-mapbox-style/#applybackground}
     * @param {polygonGeometry[]} [clipGeometries]
     * @param {function} [tileLoadFunction] Tile load function to be passed to {@link https://openlayers.org/en/latest/apidoc/module-ol_source_VectorTile-VectorTile.html|VectorTileSource}
     */
    constructor(datasource, options) {
        const {
            name,
            tileSize = 512,
            maxTileZoom = 17,
            declutter = false,
            attributions,
            tileLoadFunction,
            clipGeometries,
            format: formatStr = 'mvt',
            ...layerOptions
        } = options;
        const format = format == 'geojson' ? new MywGeoJSONFormat() : new MywMVTFormat(datasource);
        const url = `${datasource.server.baseUrl}layer/${name}/tile/{z}/{x}/{y}.${formatStr}`;
        const tileGrid = getTileGridFor(maxTileZoom, tileSize);

        const source = new VectorTileSource({
            url,
            tileGrid,
            attributions,
            format,
            tileLoadFunction
        });

        //when obtaining the style, pass a function that obtains the style definition so that lookup only happens when creating the style instead of each rerender
        const lfItemFn = (featureDD, fieldName) =>
            this.getFeatureItemFor(featureDD.name, fieldName);

        const style = (feature, resolution) => {
            const props = feature.getProperties();
            const featureType = props.feature_type;
            const featureDD = datasource.featuresDD[featureType];
            if (!featureDD.fields) return;
            const geomFieldName = props.geom_field ?? featureDD.primary_geom_name;
            const mywStyle = this.styleManager.getStyleForField(
                featureDD,
                geomFieldName,
                lfItemFn,
                this
            );
            let olStyle = mywStyle.normal?.olStyle(this.map.getView());
            // render features don't have setStyle: feature.setStyle(olStyle); // for faster followup renders
            while (typeof olStyle == 'function') olStyle = olStyle(feature, resolution);

            return olStyle;
        };
        super({ declutter, ...layerOptions, source, style });

        /** reference to the datasource object
         * @type {MyWorldDatasource} */
        this.datasource = datasource;

        this.options = options;

        this.initClipping(clipGeometries);
        const featureNames = this.options.featureTypes.map(lfItem => lfItem.name);
        this.datasource.getRenderRequestArgs(featureNames).then(args => {
            const url = this.options.url + '?' + argsAsURI(args);
            this.getSource().setUrl(url);
        });
        this.datasource.getDDInfoFor(featureNames);
    }

    /*
     * Implementation of ILayer.onAdd.
     * @param {ol/Map} map
     */
    onAdd(map) {
        this.map = map;
        this.styleManager = new StyleManager(map.getView());
    }

    /**
     * Implementation of ILayer.onRemove
     * @param  {ol/Map} map
     */
    onRemove(map) {
        this.map = null;
    }

    getFeatureItemFor(featureType, geomFieldName) {
        return this.options.featureTypes.find(
            lfItem => lfItem.name == featureType && geomFieldName == lfItem.field_name
        );
    }
}

Object.assign(MywVectorTileLayer.prototype, ClippedTileLayerMixin);

export default MywVectorTileLayer;
