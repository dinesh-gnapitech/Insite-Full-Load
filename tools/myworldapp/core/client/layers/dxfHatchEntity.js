import * as helpers from 'dxf-parser/dist/ParseHelpers';
import log from 'loglevel';

/*
 * Functions for parsing a HATCH DXF entity and various data structures contained within
 * Created using https://images.autodesk.com/adsk/files/autocad_2012_pdf_dxf-reference_enu.pdf
 */

// Helper function to convert degrees to radians
const degToRad = d => (d * Math.PI) / 180;

export class HatchEntity {
    constructor() {
        this.ForEntityName = 'HATCH';
    }
    parseEntity(scanner, curr) {
        const entity = { type: curr.value };
        curr = scanner.next();
        while (!scanner.isEOF()) {
            if (curr.code === 0) break;
            switch (curr.code) {
                case 10:
                    entity.elevationPoint = helpers.parsePoint(scanner);
                    break;

                case 210:
                    entity.extrusionDirection = helpers.parsePoint(scanner);
                    break;

                case 2:
                    entity.patternName = curr.value;
                    break;

                case 70:
                    entity.fillType = curr.value == 1 ? 'SOLID' : 'PATTERN';
                    break;

                case 63:
                    if (!entity.fillColors) entity.fillColors = [];
                    entity.fillColors.push(helpers.getAcadColor(curr.value));
                    break;

                case 421:
                    //  Seems to be a duplicate of 63's derived value. Unused?
                    break;

                case 71:
                    entity.associative = !!curr.value;
                    break;

                case 91:
                    entity.boundaryPath = [...Array(curr.value)].map(i =>
                        getBoundaryPath(scanner, curr)
                    );
                    break;

                case 75:
                    entity.style =
                        curr.value == 0 ? 'normal' : curr.value == 1 ? 'outer' : 'ignore';
                    break;

                case 76:
                    entity.pattern =
                        curr.value == 0 ? 'user' : curr.value == 1 ? 'predefined' : 'custom';
                    break;

                case 98:
                    entity.seedPoints = curr.value;
                    entity.seedPoints = [...new Array(entity.seedPoints)].map(i => {
                        curr = scanner.next();
                        return helpers.parsePoint(scanner);
                    });
                    break;

                case 450:
                    entity.colorType = curr.value ? 'gradient' : 'solid';
                    break;

                case 451:
                case 463:
                    //  Reserved for future use
                    break;

                case 453:
                    entity.colorCount = curr.value;
                    break;

                case 460:
                    entity.angle = curr.value;
                    break;

                case 452:
                case 461:
                case 462:
                    //  Only used by dialog code
                    break;

                case 470:
                    entity.string = curr.value;
                    break;

                case 52:
                    entity.patternAngle = curr.value;
                    break;

                case 41:
                    entity.patternScale = curr.value;
                    break;

                case 77:
                    entity.patternDouble = !!curr.value;
                    break;

                case 78:
                    entity.patternDefLines = [...new Array(curr.value)].map(i =>
                        getPatternData(scanner, curr)
                    );
                    break;

                case 1001:
                    //  Extended data, ignore it. While this is handled in checkCommonEntityProperties, it doesn't actually iterate through the list
                    while (curr.code >= 1000 && curr.code <= 1071) curr = scanner.next();
                    scanner.rewind();
                    break;

                case 47:
                    entity.operationPixelSize = curr.value;
                    break;

                case 102:
                    //  ACAD_REACTORS tag, this just points to an owner dictionary
                    break;

                case 330:
                    entity.acadReactorsDictHandle = curr.value;
                    break;

                default: {
                    // check common entity attributes
                    const parsed = helpers.checkCommonEntityProperties(entity, curr, scanner);

                    if (!parsed) {
                        log.debug('Unhandled code in HatchEntity::parseEntity:', curr);
                    }
                    break;
                }
            }
            curr = scanner.next();
        }
        return entity;
    }
}

function getPatternData(scanner, curr) {
    let expectedEntries = 6;
    let readEntries = 0;
    const entity = {
        basePoint: {},
        offset: {},
        dashLengths: []
    };
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 53:
                entity.angle = curr.value;
                break;

            case 43:
                entity.basePoint.x = curr.value;
                break;

            case 44:
                entity.basePoint.y = curr.value;
                break;

            case 45:
                entity.offset.x = curr.value;
                break;

            case 46:
                entity.offset.y = curr.value;
                break;

            case 79:
                expectedEntries += curr.value;
                break;

            case 49:
                entity.dashLengths.push(curr.value);
                break;

            default:
                log.debug('Unhandled code in getPatternData:', curr);
                handled = false;
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}

function getLineEdgeData(scanner, curr) {
    const expectedEntries = 2;
    let readEntries = 0;
    const entity = {};
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 10:
                entity.startPoint = helpers.parsePoint(scanner);
                break;

            case 11:
                entity.endPoint = helpers.parsePoint(scanner);
                break;

            default:
                log.debug('Unhandled code in getLineEdgeData:', curr);
                handled = false;
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}

function getCircularArcEdgeData(scanner, curr) {
    const expectedEntries = 5;
    let readEntries = 0;
    const entity = {};
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 10:
                entity.center = helpers.parsePoint(scanner);
                break;
            case 40:
                entity.radius = curr.value;
                break;

            case 50:
                entity.startAngle = degToRad(curr.value);
                break;

            case 51:
                entity.endAngle = degToRad(curr.value);
                break;

            case 73:
                entity.isCounterClockwise = !!curr.value;
                break;

            default:
                log.debug('Unhandled code in getCircularArcEdgeData:', curr);
                handled = false;
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}

function getEllipticArcEdgeData(scanner, curr) {
    const expectedEntries = 6;
    let readEntries = 0;
    const entity = {};
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 10:
                entity.center = helpers.parsePoint(scanner);
                break;

            case 11:
                entity.majorAxisEndPoint = helpers.parsePoint(scanner);
                break;

            case 40:
                entity.axisRatio = curr.value;
                break;

            case 50:
                entity.startAngle = degToRad(curr.value);
                break;

            case 51:
                entity.endAngle = degToRad(curr.value);
                break;

            case 73:
                entity.isCounterClockwise = !!curr.value;
                break;

            default:
                log.debug('Unhandled code in getEllipticArcEdgeData:', curr);
                handled = false;
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}

function getSplineEdgeData(scanner, curr) {
    let expectedEntries = 6;
    let readEntries = 0;
    const entity = {};
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 94:
                entity.degreeOfSplineCurve = curr.value;
                break;

            case 73:
                entity.rational = !!curr.value;
                break;

            case 74:
                entity.periodic = !!curr.value;
                break;

            case 95:
                entity.numberOfKnots = curr.value;
                expectedEntries += curr.value;
                break;

            case 96:
                entity.numberOfControlPoints = curr.value;
                expectedEntries += curr.value;
                break;

            case 97:
                entity.numberOfFitPoints = curr.value;
                expectedEntries += curr.value;
                break;

            case 40:
                if (!entity.knotValues) entity.knotValues = [];
                entity.knotValues.push(curr.value);
                break;

            case 10:
                if (!entity.controlPoints) entity.controlPoints = [];
                entity.controlPoints.push(helpers.parsePoint(scanner));
                break;

            case 11:
                if (!entity.fitPoints) entity.fitPoints = [];
                entity.fitPoints.push(helpers.parsePoint(scanner));
                break;

            default:
                log.debug('Unhandled code in getSplineEdgeData:', curr);
                handled = false;
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}

function getPolylineBoundaryData(scanner, curr) {
    const expectedEntries = 3;
    let readEntries = 0;
    const entity = {};
    let hasBulge = false;
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 72:
                hasBulge = curr.value;
                break;

            case 73:
                entity.isClosed = true;
                break;

            case 93:
                entity.points = [...new Array(curr.value)].map(i => {
                    curr = scanner.next();
                    const newPoint = helpers.parsePoint(scanner);
                    if (hasBulge) {
                        curr = scanner.next();
                        newPoint.bulge = curr.value;
                    }
                    return newPoint;
                });
                break;

            default:
                log.debug('Unhandled code in getPolylineBoundaryData:', curr);
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}

export const BoundaryPathEdgeType = {
    line: 1,
    circularArc: 2,
    ellipticArc: 3,
    spline: 4
};

function getBoundaryPath(scanner, curr) {
    let expectedEntries = 2;
    let readEntries = 0;
    const entity = {};
    curr = scanner.next();
    while (!scanner.isEOF()) {
        let handled = true;
        switch (curr.code) {
            case 92:
                entity.flags = {
                    external: !!(curr.value & 0x1),
                    polyline: !!(curr.value & 0x2),
                    derived: !!(curr.value & 0x4),
                    textbox: !!(curr.value & 0x8),
                    outermost: !!(curr.value & 0x10)
                };

                if (entity.flags.polyline) {
                    entity.polylineBoundary = getPolylineBoundaryData(scanner, curr);
                } else {
                    expectedEntries += 2;
                }
                break;

            case 93:
                entity.edges = curr.value;
                break;

            case 72:
                entity.edgeType = curr.value;

                entity.edges = [...new Array(entity.edges)].map(i => {
                    switch (entity.edgeType) {
                        case BoundaryPathEdgeType.line:
                            return getLineEdgeData(scanner, curr);

                        case BoundaryPathEdgeType.circularArc:
                            return getCircularArcEdgeData(scanner, curr);

                        case BoundaryPathEdgeType.ellipticArc:
                            return getEllipticArcEdgeData(scanner, curr);

                        case BoundaryPathEdgeType.spline:
                            return getSplineEdgeData(scanner, curr);
                    }
                });

                break;

            case 97:
                entity.sources = [...new Array(curr.value)].map(i => {
                    curr = scanner.next();
                    return curr.value;
                });
                break;

            default:
                log.debug('Unhandled code in getBoundaryPath:', curr);
                break;
        }
        if (handled) readEntries++;
        if (readEntries == expectedEntries) return entity;
        curr = scanner.next();
    }
    return entity;
}
