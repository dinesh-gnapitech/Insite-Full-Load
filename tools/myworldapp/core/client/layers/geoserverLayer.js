// Copyright: IQGeo Limited 2010-2023
import { pick } from 'underscore';
import { FilterParser } from 'myWorld/base/filterParser';
import { DBPredicate } from 'myWorld/base/dbPredicate';
import { CONNECTION_METHODS, SetupImageLoad } from './geoserverImgRequest';
import TileLayer from 'ol/layer/Tile';
import TileWmsSource from './tileWmsSource';
import TileState from 'ol/TileState';

export class GeoserverLayer extends TileLayer {
    /**
     * @class  A tile layer rendered by Geoserver
     * @constructs
     * @param  {string} url   URL for the tile server
     * @param  {object} options   Options
     * Extends {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_Tile-TileLayer.html|TileLayer}
     * Options in addition to those of openLayers TileLayer:
     * featureItems
     * wmsLayerGroup
     */
    constructor(url, options) {
        url = url || '';
        options = options || {};

        const { featureItems, wmsLayerGroup, tileSize } = options;
        const params = options.wmsParams
            ? { ...options.wmsParams }
            : pick(options, 'STYLES', 'WIDTH', 'HEIGHT');

        const source = new TileWmsSource({
            url,
            featureItems,
            wmsLayerGroup,
            tileSize,
            params
        });

        super({ source, ...options });

        //Need to set tile Url and load functions to deal with active delta and authentication respectively
        source.setTileUrlFunction(this.getTileUrl.bind(this));
        source.setTileLoadFunction(this.loadTile.bind(this));

        this.source = source;

        this.options = options;

        //ENH: this properties exist to support GeoserverCombinedLayer. move code there instead (and refactor what's necessary)
        this._layerOptions = [options];
        this._calculatedPrefixes = [];

        //  Each of these is keyed on geoserver layer name
        this._calculatedParams = {
            predicates: {},
            viewParams: {},
            styles: {}
        };
        this.updatePrefixes();
        const prefixedFeatureItems = wmsLayerGroup
            ? wmsLayerGroup.split(',').map(name => ({ name, field_name: name }))
            : featureItems.map(featureDef => ({
                  ...featureDef,
                  name: (options.prefix ?? '') + featureDef.name
              }));
        this._updateFeatureItems(prefixedFeatureItems);
        this.updatePredicates();

        this.authOptions = this.options.auth;
    }

    getTileUrl(tilePoint, pixelRatio, projection) {
        //  Calculate the WMS layers and filters here
        const sessionVars = this.options.getSessionVars();

        const params = this.getRequestParams(tilePoint, sessionVars);
        this.source.updateParams(params);

        return this.source.originalTileUrlFunction(tilePoint, pixelRatio, projection);
    }

    getRequestParams(tilePoint, sessionVars) {
        const params = {};

        //Recalculate Layers
        const layers = this._getLayers(tilePoint[0]);
        params.layers = layers;

        //Recalculate filters
        params.CQL_FILTER = layers
            .map(layer =>
                this.getCQLFor(layer, this._calculatedParams.predicates[layer], sessionVars)
            )
            .join(';');
        params.viewparams = layers.map(layer => this._calculatedParams.viewParams[layer]).join(';');

        //  Keep track of the indexes we have here in case we're mixing in different style types
        const stylesIndexes = {};
        params.STYLES = layers
            .map(layer => {
                const styleIndex = stylesIndexes[layer] || 0;
                stylesIndexes[layer] = styleIndex + 1;
                return this._calculatedParams.styles[layer]?.[styleIndex] ?? '';
            })
            .join(',');

        return params;
    }

    _getLayers(zoom) {
        return this.source.getWMSLayers(zoom);
    }

    // calculate prefixes
    updatePrefixes() {
        this._calculatedPrefixes = [];

        const dsActiveDelta = this.options.getActiveDelta?.();
        this._layerOptions.map(options => {
            let prefix = options.prefix;
            const layerDelta = options.activeDeltaWorkspace;

            //Set prefix and viewparam if activeDelta workspace layer
            if (layerDelta) {
                if (dsActiveDelta) {
                    prefix = `${layerDelta}:`;
                } else {
                    //No longer looking at a delta
                    prefix = '';
                }
            }
            this._calculatedPrefixes.push(prefix);
        });
    }

    _updateFeatureItems(featureItems) {
        const calculated = {};

        featureItems
            .filter(item => item.field_name)
            .map(value => {
                if (calculated[value.name]) {
                    //  Re-calculate min/max zoom/select
                    const cached = calculated[value.name];
                    cached.min_vis = Math.min(cached.min_vis, value.min_vis);
                    cached.max_vis = Math.max(cached.max_vis, value.max_vis);
                    cached.min_select = Math.min(cached.min_select, value.min_select);
                    cached.max_select = Math.max(cached.max_select, value.max_select);
                } else {
                    calculated[value.name] = value;
                }
            });
        const asArray = Object.values(calculated);
        this.getSource().setFeatureItems(asArray);
    }

    updatePredicates() {
        this._calculatedParams = {
            predicates: {},
            viewParams: {},
            styles: {}
        };

        const dsActiveDelta = this.options.getActiveDelta?.();
        this._layerOptions.map((options, index) => {
            let prefix = this._calculatedPrefixes[index];
            let viewparams = '';
            const {
                activeDeltaWorkspace,
                wmsLayerGroup,
                featureItems,
                wmsParams,
                STYLES,
                filters
            } = options;

            //Set prefix and viewparam if activeDelta workspace layer
            if (activeDeltaWorkspace && dsActiveDelta) {
                viewparams = `delta:${dsActiveDelta}`; //Set viewparams to active delta
            }
            (wmsLayerGroup
                ? wmsLayerGroup.split(',').map(name => ({ name, field_name: name }))
                : featureItems
            )
                .filter(item => item.field_name)
                .forEach(featureItem => {
                    const layerName = wmsLayerGroup || `${prefix || ''}${featureItem.name}`;
                    this._calculatedParams.viewParams[layerName] = viewparams;

                    //Setup the STYLE parameter
                    const style = wmsParams?.STYLES || STYLES;
                    if (style) {
                        if (this._calculatedParams.styles[layerName])
                            this._calculatedParams.styles[layerName].push(style);
                        else this._calculatedParams.styles[layerName] = [style];
                    }
                });
            (filters ?? []).forEach(filter => {
                if (!filter?.value) return;
                const layerName = `${prefix || ''}${filter.layerName}`;
                const parsedFilter = new FilterParser(filter.value).parse();
                const cached = this._calculatedParams.predicates[layerName];
                if (cached) {
                    this._calculatedParams.predicates[layerName] = new DBPredicate('join_op', '|', [
                        cached,
                        parsedFilter
                    ]);
                } else {
                    this._calculatedParams.predicates[layerName] = parsedFilter;
                }
            });
        });
    }

    redraw() {
        this.source.redraw();
    }

    /**
     * Obtains the CQL filter for the given predicate
     * @param {string} geoserverLayer
     * @param {DBPredicate} predicate
     * @param {object} sessionVars
     * @returns {string}
     */
    getCQLFor(geoserverLayer, predicate, sessionVars) {
        return predicate
            ? predicate.sqlFilter(predicate.layer, undefined, sessionVars, 'CQL')
            : 'INCLUDE';
    }

    /**
     * Override the default tileLoad function to enable authentication options
     * If auth is not required, used original function, else use fetch
     * @param {ol/ImageTile} tile
     * @param {string} url
     */
    async loadTile(tile, url) {
        if (this.options.crossOrigin) {
            tile.crossOrigin = '';
        }

        /*
         Alt tag is set to empty string to keep screen readers from reading URL and for compliance reasons
         http://www.w3.org/TR/WCAG20-TECHS/H67
        */
        tile.alt = '';

        /*
         Set role="presentation" to force screen readers to ignore this
         https://www.w3.org/TR/wai-aria/roles#textalternativecomputation
        */
        tile.role = 'presentation';

        //  Check if the selected layers array is empty. If it is, just return as is
        const layers = this.source.getParams()['layers'] || [];
        if (layers.length == 0) {
            tile.setState(TileState.EMPTY);
            return tile;
        }

        if (this.authOptions?.type === CONNECTION_METHODS.NONE) {
            //No authentication options set, so no point using the fetch
            return this.source.originalTileLoadFunction(tile, url);
        } else if (!this.error) {
            try {
                await SetupImageLoad(tile.getImage(), url, this.authOptions);
            } catch (error) {
                this.error = true;
                throw error;
            }
        }
    }
}

export default GeoserverLayer;
