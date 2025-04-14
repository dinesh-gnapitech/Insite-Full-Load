// Copyright: IQGeo Limited 2010-2023
import { toLatLng } from 'myWorld/base/proj';

import Feature from 'ol/Feature';
import TextFeature from 'ol/format/TextFeature';
import { transformGeometryWithOptions } from 'ol/format/Feature';
import { Point, LineString, Polygon, Circle } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { toProjExtent } from 'myWorld/base/proj';

import { DxfParser } from 'dxf-parser';
import { HatchEntity, BoundaryPathEdgeType } from './dxfHatchEntity';
export * from './dxfHatchEntity';

//  Helper function for taking coords in {x: #, y: #} format and putting into an array
const xyToArray = coord => [coord.x, coord.y];
//  In a DXF, colors are stored as a 32 bit int, split it into an rgb(#,#,#) string here
const colorToRGBString = color =>
    `rgb(${(color & 0xff0000) >> 16},${(color & 0xff00) >> 8},${color & 0xff})`;
//  When we process a solid, the base points are in the wrong order, correct that here
const correctSolidCoordinates = points => [points[0], points[1], points[3], points[2]];

export class DxfFormat extends TextFeature {
    /**
     * Handles loading DXF information from a text file and converts it to various OpenLayers Features
     * @param {object} options Contains options needed for conversion to work
     * @param {string} options.sourceCRS The CRS that we expect data coming from the DXF to be in
     * @param {string} options.destCRS The CRS that we want to translate the DXF coordinates to
     */
    constructor(options) {
        super();

        //  The CRS that we expect the data to be in
        this._sourceCRS = options.sourceCRS;

        //  The CRS that we want the data to end up in
        this._destCRS = options.destCRS;
    }

    /**
     * Parses DXF objects from a text string, ensuring that we register our own custom handler for HATCH entities
     * @param {string} text The contents of the DXF file
     * @returns {object} The DXF file parsed into an easier to read format
     */
    _parseDXF(text) {
        const parser = new DxfParser();
        parser.registerEntityHandler(HatchEntity);
        return parser.parseSync(text);
    }

    /**
     *
     * @param {strng} text The contents of the DXF file
     * @param {object} opt_options Options passed in from OpenLayers
     * @returns {Array<ol/Feature>}
     */
    readFeaturesFromText(text, opt_options) {
        const newFeatures = [];
        this.layerInfo = {};
        this.blockInfo = {};

        const dxf = this._parseDXF(text);

        //  First, we parse the layer definitions to get the style defs, at present this only contains pre-converted color info
        for (let [layerName, layerSpec] of Object.entries(dxf.tables.layer?.layers) || {}) {
            this.layerInfo[layerName] = {
                color: colorToRGBString(layerSpec.color)
            };
        }

        //  Next, we parse blocks, getting OpenLayers features for each.
        //  These act as templates and are primarily used with INSERT blocks, they normally hold things like custom icons
        for (let [blockName, blockSpec] of Object.entries(dxf.blocks)) {
            if (blockSpec.entities) {
                const drawInstructions = blockSpec.entities
                    .filter(entity => entity.type != 'INSERT')
                    .map(instruction => ({
                        ...instruction,
                        color: colorToRGBString(instruction.color)
                    }));
                if (drawInstructions.length) {
                    const newInfo = {};
                    newInfo.features = [];
                    drawInstructions.forEach(instruction =>
                        newInfo.features.push(this._processEntity(dxf.blocks, instruction))
                    );
                    this.blockInfo[blockName] = newInfo;
                }
                //  TODO: Consolidate blocks with geometries openlayers natively supports into one feature with one geometrycollection
            }
        }

        //  Finally, we iterate through the individual entities, creating OpenLayers Features from them
        dxf.entities.forEach(entity => {
            const layerName = entity.layer;
            const layerSpec = dxf.tables.layer?.layers[layerName];
            if (!(layerSpec?.visible ?? true)) return;

            const processed = this._processEntity(dxf.blocks, entity);
            processed.forEach(feature => {
                feature.setGeometry(this.translateGeometry(feature.getGeometry()));
            });
            newFeatures.push(...processed);
        });
        return newFeatures;
    }

    /**
     * Translates all of the coordinates from the provided source CRS to the CRS we expect
     * @param {ol/geom/Geometry} geometry The geometry to convert
     * @returns {ol/geom/Geometry} The translated geometry
     */
    translateGeometry(geometry) {
        return transformGeometryWithOptions(geometry, false, {
            featureProjection: this._destCRS,
            dataProjection: this._sourceCRS
        });
    }

    /**
     * Converts the provided entity into one or more OpenLayers features
     * @param {object} blocks The raw blocks table from the parsed DXF
     * @param {object} entity The entity to parse
     * @returns {Array<ol/Feature>} The list of processed entities
     */
    _processEntity(blocks, entity) {
        switch (entity.type) {
            case 'POINT':
                return [this._processPoint(entity)];

            case 'LINE':
                return [this._processLine(entity)];

            case 'POLYLINE':
            case 'LWPOLYLINE':
                return [this._processLWPolyline(entity)];

            case 'SPLINE':
                return [this._processSpline(entity)];

            case 'SOLID':
                return [this._processSolid(entity)];

            case 'CIRCLE':
                return [this._processCircle(entity)];

            case 'ARC':
                return [this._processArc(entity)];

            case 'ELLIPSE':
                return [this._processEllipse(entity)];

            case 'HATCH':
                return this._processHatch(entity);

            case 'TEXT':
                return [this._processText(entity)];

            case 'MTEXT':
                return [this._processMText(entity)];

            case 'INSERT':
                return this._processInsert(blocks, entity);

            case 'ATTDEF':
                //  We don't need these
                return [];

            default:
                console.error('Unimplemented type:', entity.type);
                return [];
        }
    }

    /**
     * Processes a POINT entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processPoint(entity) {
        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: new Point(xyToArray(entity.position))
            })
        );

        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            new Style({
                image: new CircleStyle({
                    radius: 1,
                    fill: new Fill({
                        color
                    })
                })
            });
        });
        return newFeature;
    }

    /**
     * Processes a LINE entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processLine(entity) {
        return this._createLine(entity, {
            vertices: entity.vertices,
            isShape: entity.shape,
            extrusionDirection: entity.extrusionDirection
        });
    }

    /**
     * Creates a LineString feature from a LINE entity and several options
     * @param {object} entity The parsed entity
     * @param {object} options Various options for creating the feature
     * @param {Array<object>} options.vertices The list of vertices that make up the line
     * @param {boolean} options.isShape Whether the list of vertices connects back to its first point
     * @param {object} options.extrusionDirection The extrusion vector of the shape. Used to transform coordinates
     * @returns {ol/Feature}
     */
    _createLine(entity, options) {
        const vertices = options.vertices.map(val => xyToArray(val));
        if (options.isShape) {
            vertices.push(vertices[0]);
        }
        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: this._applyExtrusionDirection(
                    new LineString(vertices),
                    null,
                    options.extrusionDirection
                )
            })
        );

        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            return new Style({
                stroke: new Stroke({
                    color
                })
            });
        });
        return newFeature;
    }

    /**
     * Processes a LWPOLYLINE entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processLWPolyline(entity) {
        return this._createLWPolyline(entity, {
            points: entity.vertices,
            isShape: entity.shape,
            extrusionDirection: {
                x: entity.extrusionDirectionX,
                y: entity.extrusionDirectionY,
                z: entity.extrusionDirectionZ
            }
        });
    }

    /**
     * Creates a LineString feature from a LWPOLYLINE entity and several options
     * @param {object} entity The parsed entity
     * @param {object} options Various options for creating the feature
     * @param {Array<object>} options.points The list of vertices that make up the line, includes bulge values
     * @param {boolean} options.isShape Whether the list of vertices connects back to its first point
     * @param {object} options.extrusionDirection The extrusion vector of the shape. Used to transform coordinates
     * @param {boolean} options.fill Whether to fill the generated shape
     * @returns {ol/Feature}
     */
    _createLWPolyline(entity, options) {
        const vertices = options.points.map(val => xyToArray(val));
        const bulges = options.points.map(val => val.bulge);
        if (options.isShape) {
            vertices.push(vertices[0]);
            bulges.push(bulges[0]);
        }

        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: this._applyExtrusionDirection(
                    new LineString(vertices),
                    null,
                    options.extrusionDirection
                )
            })
        );
        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            return new Style({
                renderer: (coordinates, state) => {
                    //  TODO: There is a bug here where OpenLayers simplifies the list of coordinates into a smaller list
                    //  This causes the bulges list to be incorrect
                    this._renderLWPolyline(coordinates, state, color, bulges, options.fill);
                }
            });
        });
        return newFeature;
    }

    /**
     * Custom renderer for LWPOLYLINE entities
     * @param {Array<Array<Number>>} coordinates List of coordinates passed in by OpenLayers
     * @param {object} state The state passed in by OpenLayers
     * @param {string} color The color to apply to draw operations
     * @param {Array<Number>} bulges The bulge values for the coordinates
     * @param {boolean} fill Whether to fill in the generated shape
     */
    _renderLWPolyline = (coordinates, state, color, bulges, fill) => {
        const ctx = state.context;
        ctx.beginPath();
        ctx.moveTo(...coordinates[0]);
        for (let i = 1; i < coordinates.length; ++i) {
            const bulge = bulges[i - 1] ?? 0;
            const prev = coordinates[i - 1];
            const current = coordinates[i];

            if (bulge === 0) {
                ctx.lineTo(current[0], current[1]);
            } else {
                //  TODO: This isn't quite correct, since we need to use arc instead of quadraticCurveTo
                const vector = [(current[0] - prev[0]) / 2, (current[1] - prev[1]) / 2];
                const lineMidpoint = [current[0] - vector[0], current[1] - vector[1]];
                const rotatedVector = [
                    vector[0] * Math.cos(Math.PI / 2) - vector[1] * Math.sin(Math.PI / 2),
                    vector[0] * Math.sin(Math.PI / 2) + vector[1] * Math.cos(Math.PI / 2)
                ];
                const bezierPoint = [
                    lineMidpoint[0] + rotatedVector[0] * bulge,
                    lineMidpoint[1] + rotatedVector[1] * bulge
                ];
                const controlPoint1 = [
                    prev[0] + rotatedVector[0] * bulge,
                    prev[1] + rotatedVector[1] * bulge
                ];
                const controlPoint2 = [
                    current[0] + rotatedVector[0] * bulge,
                    current[1] + rotatedVector[1] * bulge
                ];
                ctx.quadraticCurveTo(
                    controlPoint1[0],
                    controlPoint1[1],
                    bezierPoint[0],
                    bezierPoint[1]
                );
                ctx.quadraticCurveTo(controlPoint2[0], controlPoint2[1], current[0], current[1]);
            }
        }
        ctx.strokeStyle = color;
        ctx.stroke();
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        }
    };

    /**
     * Processes a SPLINE entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processSpline(entity) {
        return this._createSpline(entity, { controlPoints: entity.controlPoints });
    }

    /**
     * Creates a LineString feature from a SPLINE entity and several options
     * @param {object} entity The parsed entity
     * @param {object} options Various options for creating the feature
     * @param {Array<object>} options.controlPoints The list of control points that are used to generate the spline
     * @param {object} options.extrusionDirection The extrusion vector of the shape. Used to transform coordinates
     * @returns {ol/Feature}
     */
    _createSpline(entity, options) {
        //  TODO: Research what knot values and weights do
        const sampleCount = 100;
        const controlPoints = options.controlPoints.map(point => xyToArray(point));

        const tValues = [...Array(sampleCount + 1).keys()].map(i => i / 1 / sampleCount);
        const points = tValues.map(t => this._interpolateSpline(controlPoints, t));
        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: this._applyExtrusionDirection(
                    new LineString(points),
                    null,
                    options.extrusionDirection
                )
            })
        );
        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            return new Style({
                stroke: new Stroke({
                    color
                })
            });
        });
        return newFeature;
    }

    /**
     * Applies interpolation to determine the point of a spline according to value t
     * @param {Array<Array<Number>>} controlPoints The list of control points
     * @param {Number} t Value between 0 and 1 to show progress along the line
     * @returns {Array<Number>} The calculated position
     */
    _interpolateSpline(controlPoints, t) {
        if (controlPoints.length > 1) {
            const newControlPoints = [];
            controlPoints.forEach((current, i) => {
                if (i == 0) return;
                const prev = controlPoints[i - 1];
                newControlPoints.push([
                    prev[0] + (current[0] - prev[0]) * t,
                    prev[1] + (current[1] - prev[1]) * t
                ]);
            });
            return this._interpolateSpline(newControlPoints, t);
        } else {
            return controlPoints[0];
        }
    }

    /**
     * Processes a SOLID entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processSolid(entity) {
        return this._createSolid(entity, {
            points: correctSolidCoordinates(entity.points),
            extrusionDirection: entity.extrusionDirection
        });
    }

    /**
     * Creates a Polygon feature from a SOLID entity and several options
     * @param {object} entity The parsed entity
     * @param {object} options Various options for creating the feature
     * @param {Array<object>} options.points The list of vertices that make up the line, includes bulge values
     * @param {object} options.extrusionDirection The extrusion vector of the shape. Used to transform coordinates
     * @returns {ol/Feature}
     */
    _createSolid(entity, options) {
        let points = options.points.map(val => xyToArray(val));

        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: this._applyExtrusionDirection(
                    new Polygon([points]),
                    null,
                    entity.extrusionDirection
                )
            })
        );
        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            return new Style({
                stroke: new Stroke({
                    color
                }),
                fill: new Fill({
                    color
                })
            });
        });
        return newFeature;
    }

    /**
     * Processes a CIRCLE entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processCircle(entity) {
        //  TODO: The parser library current doesn't read extrusion directions
        return this._createArc(entity, {
            center: entity.center,
            radius: entity.radius,
            startAngle: 0,
            endAngle: 2 * Math.PI
        });
    }

    /**
     * Processes an ARC entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processArc(entity) {
        return this._createArc(entity, {
            center: entity.center,
            radius: entity.radius,
            startAngle: -entity.endAngle,
            endAngle: -entity.startAngle,
            extrusionDirection: {
                x: entity.extrusionDirectionX,
                y: entity.extrusionDirectionY,
                z: entity.extrusionDirectionZ
            }
        });
    }

    /**
     * Creates a Circle feature from a CIRCLE or ARC entity and several options
     * @param {object} entity The parsed entity
     * @param {object} options Various options for creating the feature
     * @param {Array<object>} options.center The center point of the circle
     * @param {Number} options.radius The radius of the circle
     * @param {Number} options.startAngle The start angle from which to draw the circle, in radians
     * @param {Number} options.endAngle The end angle from which to draw the circle, in radians
     * @param {object} options.extrusionDirection The extrusion vector of the shape. Used to transform coordinates
     * @param {boolean} options.fill Whether to fill the generated shape
     * @returns {ol/Feature}
     */
    _createArc(entity, options) {
        const center = xyToArray(options.center);
        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: this._applyExtrusionDirection(
                    new Circle(center, options.radius),
                    center,
                    options.extrusionDirection
                )
            })
        );
        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            return new Style({
                renderer: (coordinates, state) =>
                    this._renderArc(
                        coordinates,
                        state,
                        color,
                        options.startAngle,
                        options.endAngle,
                        options.fill
                    )
            });
        });

        return newFeature;
    }

    /**
     * Custom renderer for CIRCLE and ARC entities
     * @param {Array<Array<Number>>} coordinates List of coordinates passed in by OpenLayers
     * @param {object} state The state passed in by OpenLayers
     * @param {string} color The color to apply to draw operations
     * @param {Number} startAngle The start angle from which to draw the circle, in radians
     * @param {Number} endAngle The end angle from which to draw the circle, in radians
     * @param {boolean} fill Whether to fill in the generated shape
     */
    _renderArc(coordinates, state, color, startAngle, endAngle, fill) {
        const ctx = state.context;
        const center = coordinates[0];
        const radius = Math.hypot(coordinates[1][0] - center[0], coordinates[1][1] - center[1]);
        ctx.beginPath();
        ctx.arc(...center, radius, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.stroke();
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        }
    }

    /**
     * Processes an ELLIPSE entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processEllipse(entity) {
        //  TODO: The parser library current doesn't read extrusion directions
        return this._createEllipse(entity, {
            majorAxisEndPoint: entity.majorAxisEndPoint,
            axisRatio: entity.axisRatio,
            center: entity.center,
            startAngle: -entity.endAngle,
            endAngle: -entity.startAngle
        });
    }

    /**
     * Creates a Circle feature from an ELLIPSE entity and several options
     * @param {object} entity The parsed entity
     * @param {object} options Various options for creating the feature
     * @param {Array<object>} options.center The center point of the circle
     * @param {object} options.majorAxisEndPoint The endpoint of the major axis. Used to determine rotation and scaling
     * @param {Number} options.axisRatio The size ratio of y to x axis, used for determining thickness
     * @param {Number} options.startAngle The start angle from which to draw the circle, in radians
     * @param {Number} options.endAngle The end angle from which to draw the circle, in radians
     * @param {object} options.extrusionDirection The extrusion vector of the shape. Used to transform coordinates
     * @param {boolean} options.fill Whether to fill the generated shape
     * @returns {ol/Feature}
     */
    _createEllipse(entity, options) {
        const center = xyToArray(options.center);
        const radius = Math.hypot(...xyToArray(options.majorAxisEndPoint));
        const rotation = Math.atan2(options.majorAxisEndPoint.y, options.majorAxisEndPoint.x);

        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: this._applyExtrusionDirection(
                    new Circle(center, radius),
                    center,
                    options.extrusionDirection
                )
            })
        );

        newFeature.setStyle(feature => {
            const color = this._getFeatureColor(feature);
            return new Style({
                renderer: (coordinates, state) =>
                    this._renderEllipse(
                        coordinates,
                        state,
                        color,
                        options.startAngle,
                        options.endAngle,
                        -rotation,
                        options.axisRatio,
                        options.fill
                    )
            });
        });

        return newFeature;
    }

    /**
     * Custom renderer for ELLIPSE entities
     * @param {Array<Array<Number>>} coordinates List of coordinates passed in by OpenLayers
     * @param {object} state The state passed in by OpenLayers
     * @param {string} color The color to apply to draw operations
     * @param {boolean} startAngle The start angle from which to draw the circle, in radians
     * @param {boolean} endAngle The end angle from which to draw the circle, in radians
     * @param {Number} rotation The rotation of the ellipse, in radians
     * @param {Number} axisRatio The size ratio of y to x axis, used for determining thickness
     * @param {boolean} fill Whether to fill in the generated shape
     */
    _renderEllipse = (
        coordinates,
        state,
        color,
        startAngle,
        endAngle,
        rotation,
        axisRatio,
        fill
    ) => {
        //  TODO: There is a bug where small enough axis ratios can cause the drawn ellipse to be incorrectly clipped (sub 1 pixel size)
        const center = coordinates[0];
        const ctx = state.context;
        ctx.save();
        ctx.translate(center[0], center[1]);
        ctx.rotate(rotation);
        ctx.scale(1, axisRatio);
        ctx.translate(-center[0], -center[1]);
        this._renderArc(coordinates, state, color, startAngle, endAngle, fill);
        ctx.restore();
    };

    /**
     * Processes a HATCH entity
     * @param {object} entity The parsed entity
     * @returns {Array<ol/Feature>}
     */
    _processHatch(entity) {
        const newFeatures = [];

        entity.boundaryPath.forEach(boundary => {
            if (boundary.flags.polyline) {
                newFeatures.push(
                    this._createLWPolyline(entity, {
                        points: boundary.polylineBoundary.points,
                        isShape: boundary.polylineBoundary.isClosed,
                        extrusionDirection: entity.extrusionDirection,
                        fill: true
                    })
                );
            } else {
                switch (boundary.edgeType) {
                    case BoundaryPathEdgeType.line:
                        // eslint-disable-next-line no-case-declarations
                        const points = this._convertBoundaryLinesToPolygon(boundary.edges);
                        newFeatures.push(
                            this._createSolid(entity, {
                                points,
                                extrusionDirection: entity.extrusionDirection
                            })
                        );
                        break;

                    case BoundaryPathEdgeType.circularArc:
                        boundary.edges.forEach(edge => {
                            newFeatures.push(
                                this._createArc(entity, {
                                    center: edge.center,
                                    radius: edge.radius,
                                    startAngle: edge.startAngle,
                                    endAngle: edge.endAngle,
                                    extrusionDirection: entity.extrusionDirection,
                                    fill: true
                                })
                            );
                        });
                        break;

                    case BoundaryPathEdgeType.ellipticArc:
                        boundary.edges.forEach(edge => {
                            newFeatures.push(
                                this._createEllipse(entity, {
                                    majorAxisEndPoint: edge.majorAxisEndPoint,
                                    center: edge.center,
                                    startAngle: edge.startAngle,
                                    endAngle: edge.endAngle,
                                    extrusionDirection: entity.extrusionDirection,
                                    fill: true
                                })
                            );
                        });
                        break;

                    case BoundaryPathEdgeType.spline:
                        boundary.edges.forEach(edge => {
                            newFeatures.push(
                                this._createSpline(entity, {
                                    controlPoints: edge.controlPoints,
                                    extrusionDirection: entity.extrusionDirection
                                })
                            );
                        });
                        break;
                }
            }
        });
        return newFeatures;
    }

    /**
     * Helper function that converts a list of lines that are either connected or not quite connected to a list that can be used to generate a polygon
     * @param {Array<object>} points The points of the shape. In the format {startPoint: {x: #, y: #}, endPoint: {x: #, y: #}}
     * @returns {Array<object>} The points of the polygon, in the format {x: #, y: #}
     */
    _convertBoundaryLinesToPolygon(points) {
        return points
            .sort((a, b) =>
                Math.hypot(a.endPoint.x - b.startPoint.x, a.endPoint.y - b.startPoint.y)
            )
            .map(a => a.startPoint);
    }

    /**
     * Processes a TEXT entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processText(entity) {
        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: new Point(xyToArray(entity.startPoint))
            })
        );

        let textBaseline = 'alphabetic';
        switch (entity.valign) {
            case 1:
                textBaseline = 'bottom';
                break;

            case 2:
                textBaseline = 'middle';
                break;

            case 3:
                textBaseline = 'top';
                break;
        }

        const scale = [entity.xScale ?? 1, entity.yScale ?? 1];
        const rotation = entity.rotation / Math.PI;
        newFeature.setStyle((feature, resolution) => {
            const color = this._getFeatureColor(feature);
            const { text, textHeight } = entity;
            const scaledSize = Math.floor(textHeight / resolution);
            return new Style({
                text: new Text({
                    text,
                    scale,
                    rotation,
                    font: `${scaledSize}px sans-serif`,
                    fill: new Fill({
                        color
                    }),
                    textBaseline
                })
            });
        });
        return newFeature;
    }

    /**
     * Processes an MTEXT entity
     * @param {object} entity The parsed entity
     * @returns {ol/Feature}
     */
    _processMText(entity) {
        const newFeature = this.addEntityPropsToFeature(
            entity,
            new Feature({
                geometry: new Point(xyToArray(entity.position))
            })
        );

        const text = this._parseMTextContents(entity.text);
        newFeature.setStyle((feature, resolution) => {
            const color = this._getFeatureColor(feature);
            const { height } = entity;
            const scaledSize = Math.floor(height / resolution);
            return new Style({
                text: new Text({
                    text,
                    font: `${scaledSize}px sans-serif`,
                    fill: new Fill({
                        color
                    }),
                    textBaseline: 'alphabetic'
                })
            });
        });
        return newFeature;
    }

    /**
     * Parses the contents of an MTEXT field and returns formatted text
     * @param {string} text The text to parse
     * @returns {Array<string>} The formatted text that can be used by OpenLayers
     */
    _parseMTextContents(text) {
        const subgroups = text.match(/{(.*)}/);
        if (subgroups) {
            text = text.replace(subgroups[0], this._parseMTextContents(subgroups[1]));
        } else {
            //  ENH: Parse and use format tags
            // const props = [...text.matchAll(/\\(.*?);/g)];
            text = text.replaceAll(/\\(.*?);/g, '');
        }
        return text;
    }

    /**
     * Processes an INSERT entity
     * @param {object} blocks The raw blocks table from the parsed DXF
     * @param {object} entity The parsed entity
     * @returns {Array<ol/Feature>}
     */
    _processInsert(blocks, entity) {
        const newFeatures = [];
        const entityName = entity.name;
        const blockSpec = blocks[entityName];
        const inserts = blockSpec.entities?.filter(entity => entity.type == 'INSERT') ?? [];
        const notInserts = blockSpec.entities?.filter(entity => entity.type != 'INSERT') ?? [];

        inserts.forEach(entity => {
            newFeatures.push(...this._processInsert(blocks, entity));
        });
        if (notInserts.length) {
            const rotation = entity.rotation ? (entity.rotation * Math.PI) / 180 : 0;
            const block = this.blockInfo[entity.name];
            block.features.forEach((features, i) => {
                const center = xyToArray(entity.position);
                features.forEach(feature => {
                    const newFeature = this.addEntityPropsToFeature(entity, feature.clone());
                    const geometry = newFeature.getGeometry();
                    geometry.translate(entity.position.x, entity.position.y);
                    geometry.scale(entity.xScale ?? 1, entity.yScale ?? 1, center);
                    geometry.rotate(rotation, center);
                    newFeatures.push(newFeature);
                });
            });
        }
        return newFeatures;
    }

    /**
     * Helper function that applies common variables to a Feature from a provided entity
     * @param {object} entity The source entity
     * @param {ol/Feature} feature The destination feature
     * @returns {ol/Feature} The edited feature that was passed in
     */
    addEntityPropsToFeature(entity, feature) {
        feature.myw_properties = {};
        feature.set('dxfLayer', entity.layer);
        if (entity.color) {
            const color = entity.color.length ? entity.color : colorToRGBString(entity.color);
            feature.set('color', color);
        }
        feature.set('colorIndex', entity.colorIndex);
        if (entity.extendedData) {
            feature.myw_properties.XDATA = entity.extendedData.customStrings.join('\n');
        }
        return feature;
    }

    /**
     * Helper function that returns the appropriate color for a given feature
     * @param {ol/Feature} feature
     * @returns {string}
     */
    _getFeatureColor(feature) {
        //  If the color index is 256, we should pull the color from the layer definition
        if (feature.get('colorIndex') == 256) {
            const dxfLayer = feature.get('dxfLayer');
            return this.layerInfo[dxfLayer].color;
        } else return feature.get('color');
    }

    /**
     * Transforms an array of points according to the extrusion direction provided.
     * At present, this only accounts for the value of the z vector
     * @param {ol/geometry} geometry The OpenLayers geometry to apply the extrusion translation to
     * @param {Array<Number>} position The position to perform scaling from
     * @param {object} extrusionDirection The vector to extrude points, in the format {x: #, y: #, z: #}
     * @returns {Array<object>} The transformed points
     */
    _applyExtrusionDirection(geometry, position, extrusionDirection = {}) {
        const { x = 0, y = 0, z = 1 } = extrusionDirection;
        //  TODO: We need to handle more complex x/y/z value combinations, just in case they appear
        if (x != 0 || y != 0 || ![1, -1].includes(z)) {
            console.warn('Unhandled condition: complex extrusionDirection value');
        }
        if (z == -1) {
            geometry.scale(-1, 1, position);
        }
        return geometry;
    }
}

export class DxfLayer extends VectorLayer {
    /**
     * Layer that loads the contents of a DXF file and renders its contents to the map as Features
     * @param {object} options Contains options needed for conversion to work
     * @param {string} options.url The url to fetch the source DXF contents from
     * @param {string} options.sourceCRS The source CRS that was used when creating the DXF file
     * @param {object} options.datasource The parent datasource creating this layer
     * @param {object} options.layerDef The original layerDef
     */
    constructor(options) {
        super({
            source: new VectorSource({
                format: new DxfFormat({
                    sourceCRS: options.sourceCRS,
                    destCRS: options.destCRS
                }),
                url: options.url
            })
        });
        this.sourceCRS = options.sourceCRS;
        this.destCRS = options.destCRS;
        this.datasource = options.datasource;
        this.layerDef = options.layerDef;
    }

    /**
     * Stores a reference to the map and logs data access
     * @param {Map} map
     * @returns {Boolean}
     */
    onAdd(map) {
        this.setMap(map);
        this._map = map;
        this.datasource.system.recordDataAccess(
            this.datasource.database.applicationName,
            `layer.${this.layerDef.name}`
        );
        return true;
    }

    /**
     * Clears the stored reference to the map
     * @param {Map} map
     */
    onRemove(map) {
        this._map = null;
        this.setMap(null);
    }

    /**
     * Performs a select of features around the specified LatLng
     * @param {LatLng} latLng
     * @returns {Promise<Array<Object>>}
     */
    async select(latLng) {
        const pixel = this._map.latLngToPixel(latLng);
        const features = this._map.getFeaturesAtPixel(pixel, {
            layerFilter: layer => layer == this,
            hitTolerance: this._map.getSelectTolerance()
        });
        return this._processResults(features);
    }

    /**
     * Performs a box select of points in the specified LatLngBounds
     * @param {LatLngBounds} bounds
     * @returns {Promise<Array<Object>>}
     */
    async selectBox(bounds) {
        const extent = toProjExtent(bounds, this._projection);
        const features = this.getSource().getFeaturesInExtent(extent);
        return this._processResults(features);
    }

    runSearch(searchTerm, options) {
        const searchTermLower = searchTerm.toLowerCase();

        //  Process individual layers
        return this.getSource()
            .getFeatures()
            .filter(feature => {
                const name = feature.get('dxfLayer');
                const nameLower = name.toLowerCase();
                if (nameLower.match(searchTermLower) !== null) {
                    return true;
                }

                for (const val of Object.values(feature.myw_properties)) {
                    if (typeof val !== 'string') {
                        continue;
                    }

                    const valLower = val.toLowerCase();
                    if (valLower.match(searchTermLower) !== null) {
                        return true;
                    }
                }
            })
            .map(feature => {
                const name = feature.get('dxfLayer');
                return {
                    data: {
                        feature: this._processFeature(feature)
                    },
                    datasource: this.datasource.name,
                    label: name,
                    type: 'kml_feature',
                    value: name
                };
            });
    }

    /**
     * Internal function to convert fetched KML features into myWorld recognisable features
     * @param {Array<Object>} features
     * @returns {Array<Object>}
     * @private
     */
    _processResults(features) {
        const ret = [];
        for (let feature of features) {
            if (!feature) continue;
            ret.push(this._processFeature(feature));
        }
        return ret;
    }

    _processFeature(feature) {
        let clazz = this.datasource._getFeatureClassFor('kml_entity');

        const featureGeom = feature.getGeometry();
        const coordsFlat = featureGeom.getFlatCoordinates();
        const newCoordsFlat = new Array(coordsFlat.length);
        let featureGeomClone;
        if (featureGeom.getType() == 'Circle') {
            featureGeomClone = new Point(featureGeom.getCenter());
        } else {
            featureGeomClone = featureGeom.clone();
            for (let i = 0; i < coordsFlat.length; i += 2) {
                const newCoords = toLatLng(coordsFlat.slice(i, i + 2), this.destCRS);
                newCoordsFlat[i] = newCoords.lng;
                newCoordsFlat[i + 1] = newCoords.lat;
            }
            featureGeomClone.setFlatCoordinates(featureGeomClone.getLayout(), newCoordsFlat);
        }
        const name = feature.get('dxfLayer');
        const description = feature.get('description');
        const id = `${name}/${feature.ol_uid}`;
        const featureData = {
            geometry: featureGeomClone,
            id,
            properties: Object.assign(
                {
                    name,
                    description
                },
                feature.myw_properties
            )
        };
        const newfeature = new clazz(featureData);
        newfeature.getTitle = () => name;
        newfeature.getFieldDD = internalName => {
            const ret = clazz.prototype.getFieldDD.call(this, internalName);
            return ret;
        };
        return newfeature;
    }
}

export default DxfLayer;
