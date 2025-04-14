// Copyright: IQGeo Limited 2010-2023
import factory from './factory';
import lineString from './linestring';

/* globals turf: false */

//return a polygon to use with turf
const pol = coordinates => ({
    type: 'Polygon',
    coordinates: coordinates
});

export default factory(lineString, {
    /*
     * True if has more than 2 points and doesn't self intersect
     * @return {Boolean}
     */
    isValid() {
        return this.coordinates.length > 2 && !this.selfIntersects();
    },

    intersects(another) {
        this.assertTurf();
        const intersection = turf.intersects(pol(this.coordinates), pol(another.coordinates));

        return !!intersection;
    },

    /*
     * Checks if the given point is inside the ring
     * ray-casting algorithm based on
     * http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
     * @param  {Point} point [description]
     * @return {boolean}       [description]
     */
    containsPoint(point) {
        const x = point[0],
            y = point[1];

        let inside = false;
        const ring = this.coordinates;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0],
                yi = ring[i][1];
            const xj = ring[j][0],
                yj = ring[j][1];

            const intersect = yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }
});
