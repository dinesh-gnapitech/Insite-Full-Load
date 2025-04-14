// Copyright: IQGeo Limited 2010-2023
import TileWMS from 'ol/source/TileWMS';
import { CONNECTION_METHODS, SetupImageLoad } from './geoserverImgRequest';
import TileState from 'ol/TileState';
import TileGrid from 'ol/tilegrid/TileGrid';
import { get as getProjection } from 'ol/proj';
import { getWidth } from 'ol/extent';

export class TileWmsSource extends TileWMS {
    /**
     * @class  A source for tiles rendered by Geoserver
     * @constructs
     * @param  {object} options   Options - has featureItems and wmsLayerGroup - both used in generation of WMS Layers
     * @extends {ol/source/TileWMS} https://openlayers.org/en/latest/apidoc/module-ol_source_TileWMS-TileWMS.html|TileWMS
     */

    constructor(options) {
        //  Check here for any custom tile sizes, then create a new TileGrid to accommodate it
        if (options.tileSize || options.params?.WIDTH || options.params?.HEIGHT) {
            const width = options.params?.WIDTH || options.tileSize || 256;
            const height = options.params?.HEIGHT || options.tileSize || 256;
            delete options.tileSize;
            delete options.params?.WIDTH;
            delete options.params?.HEIGHT;

            const projExtent = getProjection('EPSG:3857').getExtent();
            const startResolution = getWidth(projExtent) / 256;
            const resolutions = new Array(43);
            for (let i = 0; i < resolutions.length; ++i) {
                resolutions[i] = startResolution / Math.pow(2, i);
            }
            options.tileGrid = new TileGrid({
                extent: projExtent,
                resolutions: resolutions,
                tileSize: [width, height]
            });
        }
        super(options);
        //  Set this up as an array to help better handle combined requests
        this.featureItems = options.wmsLayerGroup
            ? options.wmsLayerGroup.split(',').map(name => ({ name }))
            : options.featureItems;

        this.cacheBust = Math.round(Math.random() * 1000000);

        this.originalTileUrlFunction = this.getTileUrlFunction();
        this.originalTileLoadFunction = this.getTileLoadFunction();
        this.setTileUrlFunction(this.getNewTileUrlFunction());
        this.setTileLoadFunction(this.getNewTileLoadFunction());

        if (options.username || options.password) {
            this.authOptions = {
                type: CONNECTION_METHODS.BASIC,
                username: options.username,
                password: options.password
            };
        } else {
            this.authOptions = {
                type: CONNECTION_METHODS.NONE
            };
        }
    }

    setFeatureItems(featureItems) {
        this.featureItems = featureItems;
        this.refresh();
    }

    getNewTileUrlFunction() {
        return (tilePoint, pixelRatio, projection) => {
            const zoomLevel = tilePoint[0];
            const layers = this.getWMSLayers(zoomLevel);
            this.updateParams({ LAYERS: layers, CACHEBUST: this.cacheBust });
            return this.originalTileUrlFunction(tilePoint, pixelRatio, projection);
        };
    }

    getNewTileLoadFunction() {
        return (tile, url) => {
            if (this.crossOrigin) {
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
            const layers = this.getParams()['LAYERS'] || [];
            if (layers.length == 0) {
                tile.setState(TileState.EMPTY);
                return tile;
            }

            if (this.authOptions?.type === CONNECTION_METHODS.NONE) {
                //No authentication options set, so no point using the fetch
                return this.originalTileLoadFunction(tile, url);
            } else if (!this.error) {
                SetupImageLoad(tile.getImage(), url, this.authOptions);
            }
        };
    }

    redraw() {
        this.cacheBust = Math.round(Math.random() * 1000000);
        this.updateParams({ CACHEBUST: this.cacheBust });
        this.refresh(); //Trigger re-render
    }

    /**
     * Gets WMS layers that should be visible
     * If a wmsLayerGroup has been provided, that is returned otherwise configuration will be matched with a given zoom level
     * @param {number} zoom Zoom level
     */
    getWMSLayers(zoom) {
        const layers = [];
        this.featureItems.forEach(featureItem => {
            if (featureItem.min_vis && zoom < featureItem.min_vis) {
                return;
            }

            if (featureItem.max_vis && zoom > featureItem.max_vis) {
                return;
            }
            layers.push(featureItem.name);
        });
        return layers;
    }
}

export default TileWmsSource;
