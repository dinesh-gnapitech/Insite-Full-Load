// Copyright: IQGeo Limited 2010-2023
import { fromLonLat } from 'ol/proj.js';

/**
 * A Mixin to add clipping by a multi-polygon support to tile layer
 * @mixin ClippedTileLayerMixin
 */

/** @lends ClippedTileLayerMixin.prototype */
export const ClippedTileLayerMixin = {
    /**
     * @param  {polygonGeometry[]} clipGeometries   The GeoJSON geometries to clip by
     * The geometries should be Polygon or MultiPolygon geometries.
     * Each polygon should have linear rings which don't self-intersect and
     * which don't intersect each other. The external ring should be oriented
     * anti-clockwise. The internal rings should be oriented clockwise and lie
     * inside the external ring.
     * It does not matter if different polygons in the list of geometries
     * intersect.
     */
    initClipping(clipGeometries) {
        this.setClipGeometry(clipGeometries || []);
        this.on('prerender', this._onPreRenderClipping);
        this.on('postrender', this._onPostRenderClipping);
    },

    /**
     * @param  {polygonGeometry[]} geometries  GeoJSON geometries to clip by
     * The geometries should be Polygon or MultiPolygon geometries.
     * Each polygon should have linear rings which don't self-intersect and
     * which don't intersect each other. The external ring should be oriented
     * anti-clockwise. The internal rings should be oriented clockwise and lie
     * inside the external ring.
     * It does not matter if different polygons in the list of geometries
     * intersect.
     */
    setClipGeometry(geometries) {
        if (geometries.length) {
            this._clipGeometry = normalizeGeometry(geometries);
        } else {
            this._clipGeometry = [];
        }
    },

    _onPreRenderClipping(event) {
        const ctx = event.context;
        const frameState = event.frameState;

        ctx.save();
        if (this._clipGeometry.length) {
            ctx.beginPath();
            for (const clipGeometry of this._clipGeometry) {
                const x =
                    clipGeometry.x * frameState.coordinateToPixelTransform[0] +
                    frameState.coordinateToPixelTransform[4];
                const y =
                    clipGeometry.y * frameState.coordinateToPixelTransform[3] +
                    frameState.coordinateToPixelTransform[5];
                const width = clipGeometry.w * frameState.coordinateToPixelTransform[0];
                const height = clipGeometry.h * frameState.coordinateToPixelTransform[3];
                ctx.rect(x, y, width, height);
            }
            ctx.clip();
        }
    },

    _onPostRenderClipping(event) {
        const ctx = event.context;
        ctx.restore();
    }
};

/*
 * Combines the passed in geometries into a single MultiPolygon.
 * @param {polygonGeometry} geometry   A Polygon or Multipolygon GeoJSON geometry
 * @return {MultiPolygon}  Nested array of coordinates representing a multipolygon
 */
function normalizeGeometry(geometries) {
    let extents = [];
    for (const geometry of geometries) {
        const type = geometry.getType();
        const geomCoordinates = geometry.getCoordinates();
        //ENH: use toProjCoords
        if (type === 'Polygon') {
            extents.push(processLonLat(geomCoordinates));
        } else if (type === 'MultiPolygon') {
            for (const set of geomCoordinates) {
                extents.push(this._processLonLat(set));
            }
        } else {
            throw new Error(`Unsupported type: ${type}`);
        }
    }
    return extents;
}

function processLonLat(coords) {
    const extent = coords[0].map(coord => fromLonLat(coord));
    const x = extent.map(coord => coord[0]);
    const y = extent.map(coord => coord[1]);
    const minX = Math.min(...x);
    const maxX = Math.max(...x);
    const minY = Math.min(...y);
    const maxY = Math.max(...y);
    return { x: minX, y: maxY, w: maxX - minX, h: minY - maxY };
}

export default ClippedTileLayerMixin;
