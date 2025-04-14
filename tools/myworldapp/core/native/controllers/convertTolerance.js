// Copyright: IQGeo Limited 2010-2023
import { trace } from 'myWorld-base';

// Degrees to meters at the equator conversion factor
const degreesToMetresAtEquatorFactor = 111412.84;

// Constants used in the scale distortion formula
const p2 = -93.5 / degreesToMetresAtEquatorFactor;
const p3 = 0.118 / degreesToMetresAtEquatorFactor;

// Distortion factor:
// Multiply by the factor to convert a length in degrees along the equator
// to get a length in degrees along the specified latitude
export const scaleDistortionAt = latitude => {
    const lat = latitude * ((2.0 * Math.PI) / 360.0); // Latitude in radians
    return Math.cos(lat) + p2 * Math.cos(3 * lat) + p3 * Math.cos(5 * lat);
};

// Tolerance Converter
// Convert a tolerance in pixels to metres at specified zoom level.
// The tolerance is interpreted as the radius in the East/West direction.
// Due to the map projection used, the conversion is not dependent on the latitude.

export function pixelsToMetres(toleranceInPixels, zoom, latitude) {
    const nominal_pixel_size_m_z0 = 156250.0; // Nominal size of level 0 pixel at equator
    const nominal_pixel_size_m = nominal_pixel_size_m_z0 / Math.pow(2, zoom);
    const toleranceInMetres = toleranceInPixels * nominal_pixel_size_m;
    const distortionFactor = scaleDistortionAt(latitude);
    return toleranceInMetres * distortionFactor;
}
// Convert a tolerance in metres to degrees at the given latitude.
// The tolerance is interpreted as the radius in the East/West direction.
export function metresToLatitudeCorrectedDegrees(toleranceInMetres, latitude) {
    const distortionFactor = scaleDistortionAt(latitude);
    trace('selection', 5, `Distortion factor is: ${distortionFactor}`);
    return toleranceInMetres / degreesToMetresAtEquatorFactor / distortionFactor;
}
// Convert a tolerance in metres to degrees at the equator.
export function metresToEquatorialDegrees(toleranceInMetres) {
    return toleranceInMetres / degreesToMetresAtEquatorFactor;
}
