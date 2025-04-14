/**
 * @module base/latLng
 */

/**
 * A coordinate
 * Can be an object with lat and lng properties or an array of numbers representing an xy coordinate. Example: [16, 48].
 * Notice that a [lng, lat] coordinate also fits this description
 * @typedef {Array<number> | latLngLiteral | LatLng} coordinate
 */

/**
 * @typedef {Object} latLngLiteral
 * @property {number} lat     Latitude
 * @property {number} lng     Longitude
 */

/**
 * factory function for LatLng
 * @param {number|coordinate} lat Latitude or a coordinate
 * @param {number} [lng] Longitude. Ignored if lat is a coordinate or a lat/lng like object
 * @returns {LatLng}
 */
export function latLng(lat, lng) {
    if (lat instanceof LatLng) return lat;
    return new LatLng(lat, lng);
}

/**
 * Represents a geographical point with a certain latitude and longitude.
 * Instances can be created via factory function
 * @example
 * new LatLng(52.2020, 0.1287)
 * latLng(52.2020, 0.1287)
 * latLng([0.1287, 52.2020])
 * latLng({lat: 52.2020, lng: 0.1287})
 */
export class LatLng {
    /**
     * @param {number|coordinate} latOrCoord Latitude or a coordinate
     * @param {number} [lng] Longitude. Ignored if lat is a coordinate or a lat/lng like object
     */
    constructor(latOrCoord, lng) {
        let lat;
        if (Array.isArray(latOrCoord)) {
            //array of [lng, lat]
            lng = latOrCoord[0];
            lat = latOrCoord[1];
        } else if (
            Object.prototype.hasOwnProperty.call(latOrCoord, 'lat') &&
            Object.prototype.hasOwnProperty.call(latOrCoord, 'lng')
        ) {
            //{lat, lng} literal
            /** @type {latLngLiteral} */
            // @ts-ignore
            const coord = latOrCoord;
            lng = coord.lng;
            lat = coord.lat;
        } else {
            lat = latOrCoord;
        }
        if (isNaN(lat)) throw new Error(`Provided latitude is not a number: ${lat}`);
        if (isNaN(lng)) throw new Error(`Provided longitude is not a number: ${lng}`);

        /** Latitude @type {number} */
        this.lat = lat;
        /** @type {number} */
        this.lng = lng;
    }

    /**
     * Compares with another coordinate
     * @param {LatLng} other
     * @returns boolean
     */
    equalsTo(other) {
        return this.lat == other.lat && this.lng == other.lng;
    }

    /**
     * Bearing between self and another coordinate
     * @param {LatLng} other
     */
    bearingTo(other) {
        // From http://gregorthemapguy.blogspot.co.uk/2014/02/leaflet-latlng-objects-get-bearings.html
        other = latLng(other);
        const d2r = Math.PI / 180;
        const r2d = 180 / Math.PI;
        const lat1 = this.lat * d2r;
        const lat2 = other.lat * d2r;
        const dLon = (other.lng - this.lng) * d2r;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x =
            Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        let brng = Math.atan2(y, x);

        brng = brng * r2d;
        brng = (brng + 360) % 360;
        return brng;
    }

    /**
     * @returns {string} lng,lat
     */
    asStr() {
        return this.lng + ',' + this.lat;
    }

    /**
     * Useful when generating coordinates of geojson geometries
     * @returns {coordinate}
     */
    asCoordinate() {
        return [this.lng, this.lat];
    }

    /**
     * Calculate the distance between two points based on the haversine formula in meters
     * https://www.movable-type.co.uk/scripts/latlong.html
     * @param {*} other
     */
    distanceTo(other) {
        //ENH: implement other units
        other = latLng(other);
        const R = 6371e3; // metres
        const toRadians = lat => {
            return (lat * Math.PI) / 180;
        };
        const φ1 = toRadians(this.lat);
        const φ2 = toRadians(other.lat);
        const Δφ = toRadians(other.lat - this.lat);
        const Δλ = toRadians(other.lng - this.lng);

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const d = R * c;
        return d;
    }
}
