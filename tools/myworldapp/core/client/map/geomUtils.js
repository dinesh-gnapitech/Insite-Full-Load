// Copyright: IQGeo Limited 2010-2023

/**
 * Utility functions for geometry
 * Mostly used in map interaction modes
 */
import { Fill, RegularShape, Stroke, Style, Icon } from 'ol/style';
import MultiPoint from 'ol/geom/MultiPoint';
import Point from 'ol/geom/Point';
import { hexToRGBA } from '../styles/styleUtils';
import LineString from 'ol/geom/LineString';
import { convertUrl } from 'myWorld/base/util';

/**
 * Available via myw.geomUtils
 * @module geomUtils
 */

/**
 * Gets a single array of all the verteces and midpoints of a linestring or polygon feature
 * @param {ol/feature} feature polygon or linestring
 * @return {Array<ol/coordinate>}
 */
export function getVerticesAndMidpointsOf(feature) {
    const type = feature.getGeometry().getType();
    if (type == 'Point') return feature.getGeometry().getCoordinates();

    if (type == 'LineString') {
        const coordinates = feature.getGeometry().getCoordinates();
        feature.getGeometry().forEachSegment((first, last) => {
            const segmentLineString = new LineString([first, last]);
            const midPoint = segmentLineString.getCoordinateAt(0.5);
            coordinates.push(midPoint);
        });
        return coordinates;
    } else if (type == 'Polygon') {
        const geom = feature.getGeometry();
        if (!geom || !geom.getLinearRing) return;
        const rings = geom.getLinearRings();
        const midPointCoordinates = [];
        const ringVerteces = [];

        rings.forEach(ring => {
            const ringCoordinates = JSON.parse(JSON.stringify(ring.getCoordinates()));
            ringCoordinates.forEach((coordinate, index) => {
                if (index == ringCoordinates.length - 1) return;
                const segmentLineString = new LineString([coordinate, ringCoordinates[index + 1]]);
                const midPoint = segmentLineString.getCoordinateAt(0.5);
                midPointCoordinates.push(midPoint);
            });
            ringVerteces.push(...ringCoordinates);
        });
        return [...ringVerteces, ...midPointCoordinates];
    }
}

/**
 * Retuns edit style for a given geometry type. To be used in a GeomDrawMode
 * @param {string} geomType 'Point', 'LineString' or 'Polygon'
 * @param {object} options  As per GeomDrawMode options
 * @param {boolean} [creating=true] Only used for LineString type. When false returns style for editing line, instead of creating
 * @returns {function} Open layers style function
 */
export function getEditStyleFor(geomType, options, creating) {
    if (geomType == 'LineString') return getEditStyleForLineString(options, creating);
    else if (geomType == 'Point') return getEditStyleForPoint(options);
    else if (geomType == 'Polygon') return getEditStyleForPolygon(options);
}

function getEditStyleForLineString(options, creating = true) {
    const vertexSquare = new RegularShape({
        points: 4,
        radius: 6.5,
        fill: new Fill({
            color: '#FFFFFF'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: '#666', width: 1 })
    });
    const vertexEndSquare = new RegularShape({
        points: 4,
        radius: 6.5,
        fill: new Fill({
            color: '#FFFFFF'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: 'rgba(128, 0, 0, 0.6)', width: 4 })
    });
    const midPointSquare = new RegularShape({
        points: 4,
        radius: 6,
        fill: new Fill({
            color: 'rgba(255,255,255,0.7)'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 0.5 })
    });
    return function () {
        const image = vertexSquare;
        return [
            //Vertex square
            new Style({
                image: image,
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coordinates = feature.getGeometry().getCoordinates();
                    coordinates.pop();
                    return new MultiPoint(coordinates);
                }
            }),
            //Midpoint square
            new Style({
                image: midPointSquare,
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coordinates = [];
                    feature.getGeometry().forEachSegment((first, last) => {
                        const segmentLineString = new LineString([first, last]);
                        const midPoint = segmentLineString.getCoordinateAt(0.5);
                        coordinates.push(midPoint);
                    });
                    return new MultiPoint(coordinates);
                }
            }),
            //Endpoint square
            new Style({
                image: creating ? vertexSquare : vertexEndSquare, //Only indicate which square is the end square when not creating
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coordinate = feature.getGeometry().getLastCoordinate();
                    return new Point(coordinate);
                }
            }),
            //Line style
            new Style({
                stroke: new Stroke({
                    color: options.editableOptions.lineGuideOptions.color,
                    width: 3
                }),
                fill: new Fill({
                    color: options.editableOptions.lineGuideOptions.color
                }),
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coords = feature.getGeometry().getCoordinates();
                    coords.pop();
                    return new LineString(coords);
                }
            }),
            //Dotted Line style (for final segment when drawing)
            new Style({
                stroke: new Stroke({
                    color: options.create.polyline.color,
                    width: creating ? 2 : 3,
                    lineDash: creating ? [5, 5] : null
                }),
                fill: new Fill({
                    color: options.editableOptions.lineGuideOptions.color
                }),
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coords = feature.getGeometry().getCoordinates();
                    const finalSegment = [coords[coords.length - 2], coords[coords.length - 1]];
                    return new LineString(finalSegment);
                }
            })
        ];
    };
}

function getEditStyleForPoint(options) {
    const pointOptions = options.create.point;
    const strokeColor = hexToRGBA(pointOptions.color, pointOptions.opacity);
    const width = pointOptions.strokeWidth ?? 4;

    return new Style({
        image: new RegularShape({
            fill: null,
            stroke: new Stroke({ color: strokeColor, width }),
            points: 4,
            radius: 8,
            rotation: Math.PI / 4,
            angle: 0
        })
    });
}

function getEditStyleForPolygon(options) {
    const fillColor = hexToRGBA(options.create.polygon.color, options.create.polygon.fillOpacity);
    const lineColor = hexToRGBA(options.create.polygon.color, options.create.polygon.lineOpacity);
    const vertexSquare = new RegularShape({
        points: 4,
        radius: 6.5,
        fill: new Fill({
            color: '#FFFFFF'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: '#666', width: 1 })
    });
    const midPointSquare = new RegularShape({
        points: 4,
        radius: 6,
        fill: new Fill({
            color: 'rgba(255,255,255,0.7)'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 0.5 })
    });

    return [
        new Style({
            image: vertexSquare,
            geometry: function (feature) {
                if (feature.getGeometry().getType() !== 'Polygon') return;
                const rings = feature.getGeometry().getLinearRings();
                const vertexCoordinates = [];
                rings.forEach(ring => {
                    vertexCoordinates.push(...ring.getCoordinates());
                });
                return new MultiPoint(vertexCoordinates);
            }
        }),
        new Style({
            image: midPointSquare,
            geometry: function (feature) {
                const geom = feature.getGeometry();
                if (!geom || !geom.getLinearRing) return;
                const rings = geom.getLinearRings();
                const midPointCoordinates = [];

                rings.forEach(ring => {
                    const ringCoordinates = ring.getCoordinates();
                    ringCoordinates.forEach((coordinate, index) => {
                        if (index == ringCoordinates.length - 1) return;
                        const segmentLineString = new LineString([
                            coordinate,
                            ringCoordinates[index + 1]
                        ]);
                        const midPoint = segmentLineString.getCoordinateAt(0.5);
                        midPointCoordinates.push(midPoint);
                    });
                });

                return new MultiPoint(midPointCoordinates);
            }
        }),
        new Style({
            stroke: new Stroke({ color: lineColor, width: 3 }),
            fill: new Fill({ color: fillColor })
        })
    ];
}

export function getRotationMarkerStyle(lineStyle, markerUrl, offset) {
    const icon = getIcon(markerUrl);
    return [
        new Style({
            image: icon,
            geometry: function (feature) {
                if (feature.getGeometry().getType() !== 'LineString') return;
                const coordinates = feature.getGeometry().getLastCoordinate();
                return new Point(coordinates);
            }
        }),
        new Style({
            stroke: new Stroke({
                color: lineStyle.color,
                width: lineStyle.weight,
                lineDash: lineStyle.dashArray
            }),
            fill: new Fill({
                color: lineStyle.color
            })
        })
    ];
}

function getIcon(url, scale = 2, anchor = [0.5, 0.5]) {
    return new Icon({
        src: convertUrl(url),
        scale,
        anchor
    });
}
