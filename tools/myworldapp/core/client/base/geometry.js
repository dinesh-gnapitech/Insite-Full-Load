// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld/base/core';
import geometry from 'myWorld/geometry/geometry';

myw.geometry = geometry;

/**
 * Loads libraries necessary for the spatial analysis methods on geometry objects.
 * This methods needs to be called before calling spatial analysis methods.
 * The turf library is loaded as a global
 * @function
 * @return {Promise} Resolves when the code has loaded ans is ready to use
 */
myw.geometry.init = function () {
    var p = import(/* webpackChunkName: "turf" */ '@turf/turf').then(function (turf) {
        if (typeof global != 'undefined') {
            //nodejs (test) environment
            global.turf = turf;
        } else {
            window.turf = turf;
        }
    });
    this.init = () => p; //"cache" promise
    return p;
};

export default geometry;
