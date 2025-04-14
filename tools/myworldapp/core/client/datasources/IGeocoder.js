// Copyright: IQGeo Limited 2010-2023
import { MywClass } from 'myWorld/base/class';

/**
 * @class Specifies methods to implement when creating an External Data Source
 * @name IGeocoder
 */
export class IGeocoder extends MywClass {
    /**
     * Geocode an address and call the callback
     * @param  {string}   address  The address to search for
     * @param  {LatLngBounds}   bounds   Bounds to influence the geocoding
     * @return {Promise<GeocodeFeature>}
     */
    geocode(address, bounds) {}

    /**
     * Obtains an address from the provided point and calls a callback with the result
     * @param  {LatLng}   point    Geographical point for which to obtain a corresponding address
     * @returns {Promise<string>}   Address for the given point
     */
    reverseGeocode(point) {}
}

export default IGeocoder;
