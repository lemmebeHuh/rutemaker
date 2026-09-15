/**
 * Route Simplifier Module
 * Implements Ramer-Douglas-Peucker (RDP) algorithm to downsample high-density
 * GPS trackpoints into a manageable set of waypoints for editing.
 */

const RouteSimplifier = (() => {
  'use strict';

  /**
   * Find perpendicular distance from a point to a line segment.
   */
  function perpendicularDistance(point, lineStart, lineEnd) {
    let dx = lineEnd.lng - lineStart.lng;
    let dy = lineEnd.lat - lineStart.lat;

    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > 0) {
      dx /= mag;
      dy /= mag;
    }

    const pvx = point.lng - lineStart.lng;
    const pvy = point.lat - lineStart.lat;

    const pvdot = dx * pvx + dy * pvy;
    const ax = pvx - pvdot * dx;
    const ay = pvy - pvdot * dy;

    return Math.sqrt(ax * ax + ay * ay);
  }

  /**
   * Ramer-Douglas-Peucker algorithm.
   */
  function ramerDouglasPeucker(points, epsilon) {
    if (points.length < 3) return points;

    let maxDist = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const dist = perpendicularDistance(points[i], points[0], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }

    if (maxDist > epsilon) {
      const left = ramerDouglasPeucker(points.slice(0, index + 1), epsilon);
      const right = ramerDouglasPeucker(points.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [points[0], points[end]];
    }
  }

  /**
   * Simplify a list of trackpoints to a target number of waypoints.
   * Dynamically adjusts epsilon to reach the target count.
   * @param {Array} trackpoints 
   * @param {number} targetCount
   */

  /**
   * Generates a Catmull-Rom spline through a set of coordinates to smooth sharp corners.
   */
  function catmullRomSpline(points, segmentsPerCurve = 10) {
    if (points.length < 3) return points;
    
    // Duplicate start and end points
    const p = [points[0], ...points, points[points.length - 1]];
    const result = [];
    
    for (let i = 1; i < p.length - 2; i++) {
      const p0 = p[i - 1];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2];
      
      for (let t = 0; t < 1; t += 1/segmentsPerCurve) {
        const t2 = t * t;
        const t3 = t2 * t;
        
        const lat = 0.5 * (
          (2 * p1.lat) +
          (-p0.lat + p2.lat) * t +
          (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
          (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3
        );
        
        const lng = 0.5 * (
          (2 * p1.lng) +
          (-p0.lng + p2.lng) * t +
          (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
          (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3
        );
        
        result.push({ lat, lng });
      }
    }
    
    // Include last point
    const end = points[points.length - 1];
    result.push({ lat: end.lat, lng: end.lng });
    return result;
  }

  function simplifyToWaypoints(trackpoints, targetCount = 30) {
    const validPoints = trackpoints
      .filter(tp => tp.position)
      .map(tp => ({
        lat: tp.position.latitudeDegrees,
        lng: tp.position.longitudeDegrees
      }));

    if (validPoints.length <= targetCount) return validPoints;

    let epsilon = 0.00001;
    let step = 0.00005;
    let maxIterations = 100;
    let result = validPoints;

    for (let i = 0; i < maxIterations; i++) {
      result = ramerDouglasPeucker(validPoints, epsilon);
      if (result.length <= targetCount) break;
      epsilon += step;
      if (result.length > targetCount * 2) {
        step *= 1.5; // accelerate if far
      }
    }

    // If still too many (edge case), just slice evenly
    if (result.length > targetCount + 10) {
      const sliced = [];
      const ratio = result.length / targetCount;
      for (let i = 0; i < targetCount; i++) {
        sliced.push(result[Math.floor(i * ratio)]);
      }
      sliced.push(result[result.length - 1]); // Always include end
      return sliced;
    }

    return result;
  }

  return {
    simplifyToWaypoints,
    ramerDouglasPeucker,
    catmullRomSpline
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RouteSimplifier;
}
