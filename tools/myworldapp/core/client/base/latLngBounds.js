import { latLng } from './latLng';

export function latLngBounds(southWest, northEast) {
    if (typeof southWest.getSouthWest == 'function') return southWest;
    return new LatLngBounds(southWest, northEast);
}

export class LatLngBounds {
    /**
     * Represents a rectangular geographical area on a map.
     * Instances can be created via factory function
     * @constructs
     * @param {import("./latLng").coordinate} corner1 Corner 1 coordinate
     * @param {import("./latLng").coordinate} corner2 Oposite corner coordinate
     * @example
     * latLngBounds(latLng(52.2020, 0.1287), latLng(52.2120, 0.1387))
     * latLngBounds([0.1287, 52.2020], [0.1387, 52.2120])
     * latLngBounds({lat: 52.2020, lng: 0.1287}, {lat: 52.2120, lng: 0.1387})
     * new LatLngBounds(latLng(52.2020, 0.1287), latLng(52.2120, 0.1387))
     */
    constructor(corner1, corner2) {
        if (Array.isArray(corner1) && !corner2) {
            //array of [southWest, northEast] keeping the Leaflet signature for backwards compatibility
            // @ts-ignore
            corner2 = corner1[1] || corner1[0];
            // @ts-ignore
            corner1 = corner1[0];
        } else if (!corner2) {
            //one argument that isn't an array. bounds of one point
            corner2 = corner1;
        }
        const c1 = latLng(corner1);
        const c2 = latLng(corner2);
        this._southWest = latLng(Math.min(c1.lat, c2.lat), Math.min(c1.lng, c2.lng));
        this._northEast = latLng(Math.max(c1.lat, c2.lat), Math.max(c1.lng, c2.lng));
    }

    /**
     * Checks if represents the same bounds as another LatLngBounds object
     * @param {LatLngBounds} other
     * @returns {boolean}
     */
    equalsTo(other) {
        return (
            this.getSouthWest().equalsTo(other.getSouthWest()) &&
            this.getNorthEast().equalsTo(other.getNorthEast())
        );
    }

    /**
     * @returns {import("./latLng").LatLng} South-west coordinate
     */
    getSouthWest() {
        return this._southWest;
    }

    /**
     * @returns {import("./latLng").LatLng} North-east coordinate
     */
    getNorthEast() {
        return this._northEast;
    }

    /**
     * @returns {import("./latLng").LatLng} North-west coordinate
     */
    getNorthWest() {
        return latLng(this.getNorth(), this.getWest());
    }

    /**
     * @returns {import("./latLng").LatLng} South-east coordinate
     */
    getSouthEast() {
        return latLng(this.getSouth(), this.getEast());
    }

    /**
     * @returns {number} West longitude of the bounds
     */
    getWest() {
        return this.getSouthWest().lng;
    }

    /**
     * @returns {number} East longitude of the bounds
     */
    getEast() {
        return this.getNorthEast().lng;
    }

    /**
     * @returns {number} North latitude of the bounds
     */
    getNorth() {
        return this.getNorthEast().lat;
    }

    /**
     * @returns {number} South latitude of the bounds
     */
    getSouth() {
        return this.getSouthWest().lat;
    }

    /**
     * @returns {import("./latLng").LatLng} Center of the bounds
     */
    getCenter() {
        const lat = (this.getNorth() + this.getSouth()) / 2;
        const lng = (this.getEast() + this.getWest()) / 2;
        return latLng(lat, lng);
    }

    /**
     * Checks if self intersects with another given bounds
     * @param {LatLngBounds} other
     * @returns {boolean}
     */
    intersects(other) {
        const sw = this._southWest;
        const ne = this._northEast;
        const sw2 = other.getSouthWest();
        const ne2 = other.getNorthEast();
        const latIntersects = ne2.lat >= sw.lat && sw2.lat <= ne.lat;
        const lngIntersects = ne2.lng >= sw.lng && sw2.lng <= ne.lng;
        return latIntersects && lngIntersects;
    }

    /**
     * Checks if self wholy contains a coordinate or another bounds
     * @param {import("./latLng").LatLng|LatLngBounds} latLngBoundsOrLatLng
     * @returns {boolean}
     */
    contains(latLngBoundsOrLatLng) {
        // @ts-ignore
        if (latLngBoundsOrLatLng.lat) {
            //LatLng
            const sw = this._southWest;
            const ne = this._northEast;
            // @ts-ignore
            const lat = latLngBoundsOrLatLng.lat;
            // @ts-ignore
            const lng = latLngBoundsOrLatLng.lng;
            const latContains = lat >= sw.lat && lat <= ne.lat;
            const lngContains = lng >= sw.lng && lng <= ne.lng;
            return latContains && lngContains;
        } else {
            //LatLngBounds
            const sw = this.getSouthWest();
            const ne = this.getNorthEast();
            // @ts-ignore
            const sw2 = latLngBoundsOrLatLng.getSouthWest();
            // @ts-ignore
            const ne2 = latLngBoundsOrLatLng.getNorthEast();
            const latContains = sw2.lat >= sw.lat && ne2.lat <= ne.lat;
            const lngContains = sw2.lng >= sw.lng && ne2.lng <= ne.lng;
            return latContains && lngContains;
        }
    }

    /**
     * Returns bounds created by extending or retracting the current bounds by a given ratio
     * in each direction. For example, a ratio of 0.5 extends the bounds by 50% in each direction. Negative values will retract the bounds
     * @param {number} ratio
     */
    pad(ratio) {
        const sw = this._southWest;
        const ne = this._northEast;
        const heightBuffer = Math.abs(sw.lat - ne.lat) * ratio;
        const widthBuffer = Math.abs(sw.lng - ne.lng) * ratio;

        return latLngBounds(
            latLng(sw.lat - heightBuffer, sw.lng - widthBuffer),
            latLng(ne.lat + heightBuffer, ne.lng + widthBuffer)
        );
    }

    /**
     * Returns a string with bounding box coordinates in a 'southwest_lng,southwest_lat,northeast_lng,northeast_lat' format.
     * Useful for sending requests to web services that return geo data.
     * @returns {string}
     */
    toBBoxString() {
        return [
            this.getSouthWest().lng,
            this.getSouthWest().lat,
            this.getNorthEast().lng,
            this.getNorthEast().lat
        ].join(',');
    }

    /**
     * Returns a string with bounding box represented as polygon (5 coordinates).
     * Useful for sending requests to web services that expect a polygon
     * @returns {string}
     */
    asCoordsStr() {
        return [
            this.getSouthWest(),
            this.getSouthEast(),
            this.getNorthEast(),
            this.getNorthWest(),
            this.getSouthWest()
        ]
            .map(c => c.asStr())
            .join(',');
    }

    /**
     * Returns a new representation of the boudns as coordinates of a geojson geometry
     * @returns {Array<Array<number>>}
     */
    asGeometry() {
        // @ts-ignore
        return [
            this.getSouthWest(),
            this.getNorthWest(),
            this.getNorthEast(),
            this.getSouthEast(),
            this.getSouthWest()
        ].map(latlng => latlng.asCoordinate());
    }

    /**
     * Extend the bounds to contain the given point or latLngBounds Object
     * @param {import("./latLng").LatLng|LatLngBounds} pointOrLatLngBounds
     * @returns {LatLngBounds}
     */
    extend(pointOrLatLngBounds) {
        const sw = this._southWest;
        const ne = this._northEast;
        let sw2;
        let ne2;

        //Set sw2 and ne2
        if (pointOrLatLngBounds instanceof LatLngBounds) {
            //LatLngBounds
            const other = pointOrLatLngBounds;
            if (this.contains(other)) return this; //No need to do anything
            sw2 = other.getSouthWest();
            ne2 = other.getNorthEast();
        } else {
            //Point
            const point = pointOrLatLngBounds;
            sw2 = point;
            ne2 = point;
        }

        this._southWest = latLng(Math.min(sw.lat, sw2.lat), Math.min(sw.lng, sw2.lng));
        this._northEast = latLng(Math.max(ne.lat, ne2.lat), Math.max(ne.lng, ne2.lng));
    }

    /*
     * Subtracts a given bounding box from self
     * @param  {LatLngBounds} bounds2     Bounding box to subtract/exclude from self
     * @return {Array<LatLngBounds>} List of bounding boxes that make up the result of the subtraction
     */
    subtract(other) {
        let left, right, top, bottom;
        const result = [];

        if (!this.intersects(other)) return [this];

        // Determine where edges of bounds2 cross bounds1
        if (other.getWest() > this.getWest() && other.getWest() < this.getEast())
            left = other.getWest();

        if (other.getEast() > this.getWest() && other.getEast() < this.getEast())
            right = other.getEast();

        if (other.getSouth() > this.getSouth() && other.getSouth() < this.getNorth())
            bottom = other.getSouth();

        if (other.getNorth() > this.getSouth() && other.getNorth() < this.getNorth())
            top = other.getNorth();

        // Calculate left and right strips
        if (left) {
            result.push(latLngBounds(this.getSouthWest(), latLng(this.getNorth(), left)));
        }
        if (right) {
            result.push(latLngBounds(latLng(this.getSouth(), right), this.getNorthEast()));
        }

        // Calculate top and bottom strips and truncate if there are left and right strips
        let west, east;
        if (top) {
            if (left) west = left;
            else west = this.getWest();
            if (right) east = right;
            else east = this.getEast();
            result.push(latLngBounds(latLng(top, west), latLng(this.getNorth(), east)));
        }
        if (bottom) {
            if (left) west = left;
            else west = this.getWest();
            if (right) east = right;
            else east = this.getEast();
            result.push(latLngBounds(latLng(this.getSouth(), west), latLng(bottom, east)));
        }

        return result;
    }
}
