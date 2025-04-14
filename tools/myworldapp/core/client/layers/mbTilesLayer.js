// Copyright: IQGeo Limited 2010-2023
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';

/**
 * Define a myWorld specific tile layer for tiles supplied by the myWorld tile server.<br/>
 * Prevents browser from caching tiles between sessions
 * @extends {ClippedTileLayer}
 * @private
 */
export class MbTilesLayer extends TileLayer {
    /**
     * @param  {object} options Options as specified for {@link https://openlayers.org/en/latest/apidoc/module-ol_layer_Tile-TileLayer.html}
     */
    constructor(options) {
        //add the url template part that matches the myWorld tile server rest api
        //also add a random number to prevent the browser from caching tiles between sessions
        const url = `${options.url}&z={z}&x={x}&y={-y}`;
        const source = new XYZ({ url });
        super({ ...options, source });
    }
}

export default MbTilesLayer;
