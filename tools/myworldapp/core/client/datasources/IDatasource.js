// Copyright: IQGeo Limited 2010-2023
import { MywClass } from 'myWorld/base/class';

/**
 * @class Specifies methods to implement when creating a Data Source
 * @name IDatasource
 */
export class IDatasource extends MywClass {
    /**
     * Instantiates a layer from a layer definition
     * @param  {layerDefinition} layerDef
     * @return {ILayer}
     */
    createLayer(layerDef) {}

    /**
     * To be defined in subclasses.
     * Performs a selection on self using an external selection service.
     * @param  {Layer}  layer           layer where the selection originated. used for tolerance calculations
     * @param  {LatLng}   selectionPoint  Point the user clicked/selected
     * @param  {number}   zoomLevel       Zoom level at time of selection
     * @param  {number}   pixelTolerance  Number of pixels to use as tolerance for the selection
     * @return {Promise<geojson>}           The selected features details
     */
    select(layer, selectionPoint, zoomLevel, pixelTolerance) {}

    /**
     * Sends a search request
     * Only returns results accessible by the current application
     * @param  {string}         searchTerm      Text to search for
     * @param  {searchOptions}  [options]       Options to influence the search
     * @return {Promise<Array<autoCompleteResult>>}  Promise for autocomplete suggestions of type 'external_feature' or 'external_query' to present the user
     */
    runSearch(searchTerm, options) {}
}

/**
 * Options for executing a search operation on a datasource
 * @typedef searchOptions
 * @property {LatLngBounds}   bounds        Bounds for prediction biasing.
 *                                            Predictions may be biased towards, but not restricted to, the given bounds
 * @property {number}         limit         Maximum number of results per result type and feature type
 */

export default IDatasource;
