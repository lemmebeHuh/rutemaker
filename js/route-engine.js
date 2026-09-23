/**
 * Route Engine Module
 * Handles route manipulation: time shift, speed scaling, distance scaling,
 * trimming, reversal, loop multiplication, and route generation from waypoints.
 */

const RouteEngine = (() => {
  'use strict';

  const EARTH_RADIUS_M = 6371000;

  /**
   * Shift all timestamps by a new start time.
   * @param {Array} trackpoints - Array of trackpoint objects
   * @param {string} newStartTime - ISO 8601 string
   * @returns {Array} New array of trackpoints with shifted times
   */
  function timeShift(trackpoints, newStartTime) {
    if (trackpoints.length === 0) return [];

    const originalStart = new Date(trackpoints[0].time).getTime();
    const newStart = new Date(newStartTime).getTime();
    const offset = newStart - originalStart;

    return trackpoints.map(tp => ({
      ...tp,
      position: tp.position ? { ...tp.position } : null,
      time: new Date(new Date(tp.time).getTime() + offset).toISOString().replace('.000Z', 'Z'),
    }));
  }

  /**
   * Scale speed of the entire activity.
   * Factor > 1 = faster (shorter time), Factor < 1 = slower (longer time).
   * @param {Array} trackpoints
   * @param {number} factor - Speed multiplier (e.g., 1.2 for 20% faster)
   * @returns {Array} New trackpoints with adjusted timestamps and speeds
   */
  function speedScale(trackpoints, factor) {
    if (trackpoints.length === 0 || factor <= 0) return trackpoints;

    const startTime = new Date(trackpoints[0].time).getTime();

    return trackpoints.map((tp, i) => {
      const originalOffset = new Date(tp.time).getTime() - startTime;
      const newOffset = originalOffset / factor;
      const newTime = new Date(startTime + newOffset);

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        time: newTime.toISOString().replace('.000Z', 'Z'),
        speed: tp.speed !== null ? Math.round(tp.speed * factor * 10) / 10 : null,
      };
    });
  }

  /**
   * Trim route from start and/or end by percentage.
   * @param {Array} trackpoints
   * @param {number} startPercent - 0-100, percentage to trim from start
   * @param {number} endPercent - 0-100, percentage to trim from end
   * @returns {Array} Trimmed trackpoints with recalculated cumulative distance
   */
  function trimRoute(trackpoints, startPercent = 0, endPercent = 100) {
    if (trackpoints.length === 0) return [];

    const startIdx = Math.floor((startPercent / 100) * trackpoints.length);
    const endIdx = Math.ceil((endPercent / 100) * trackpoints.length);
    const trimmed = trackpoints.slice(startIdx, endIdx);

    return recalculateCumulativeDistance(trimmed);
  }

  /**
   * Reverse the route direction.
   * @param {Array} trackpoints
   * @returns {Array} Reversed trackpoints with original timing preserved
   */
  function reverseRoute(trackpoints) {
    if (trackpoints.length <= 1) return [...trackpoints];

    // Keep original timestamps but reverse positions
    const times = trackpoints.map(tp => tp.time);
    const reversed = [...trackpoints].reverse();

    const result = reversed.map((tp, i) => ({
      ...tp,
      position: tp.position ? { ...tp.position } : null,
      time: times[i],
    }));

    return recalculateCumulativeDistance(result);
  }

  /**
   * Multiply route by looping it N times.
   * Creates seamless loops with proper time continuation.
   * @param {Array} trackpoints
   * @param {number} loops - Number of total loops (including original)
   * @returns {Array} Extended trackpoints
   */
  function loopRoute(trackpoints, loops) {
    if (trackpoints.length === 0 || loops <= 1) return [...trackpoints];

    const result = [...trackpoints];
    const totalOriginalTime = new Date(trackpoints[trackpoints.length - 1].time).getTime() -
      new Date(trackpoints[0].time).getTime();

    for (let loop = 1; loop < loops; loop++) {
      const timeOffset = totalOriginalTime * loop;
      const distanceOffset = trackpoints[trackpoints.length - 1].distanceMeters || 0;

      for (let i = 1; i < trackpoints.length; i++) {
        const tp = trackpoints[i];
        const newTime = new Date(new Date(tp.time).getTime() + timeOffset);

        result.push({
          ...tp,
          position: tp.position ? { ...tp.position } : null,
          time: newTime.toISOString().replace('.000Z', 'Z'),
          distanceMeters: tp.distanceMeters !== null
            ? Math.round((tp.distanceMeters + distanceOffset * loop) * 10) / 10
            : null,
        });
      }
    }

    return result;
  }

  /**
   * Offset all elevations by a fixed amount.
   * @param {Array} trackpoints
   * @param {number} offsetMeters - Elevation offset in meters
   * @returns {Array} Trackpoints with adjusted elevation
   */
  
  /**
   * Scale speed of the entire activity to match a target average speed exactly.
   * @param {Array} trackpoints
   * @param {number} targetSpeedKmh - Target average speed in km/h
   * @returns {Array} New trackpoints with adjusted timestamps
   */
  function scaleToTargetSpeed(trackpoints, targetSpeedKmh) {
    if (trackpoints.length < 2 || targetSpeedKmh <= 0) return trackpoints;

    // Calculate total distance first
    let totalDist = 0;
    for (let i = 1; i < trackpoints.length; i++) {
      if (trackpoints[i-1].position && trackpoints[i].position) {
        totalDist += haversineDistance(
          trackpoints[i-1].position.latitudeDegrees, trackpoints[i-1].position.longitudeDegrees,
          trackpoints[i].position.latitudeDegrees, trackpoints[i].position.longitudeDegrees
        );
      }
    }

    if (totalDist === 0) return trackpoints;

    const targetSpeedMs = targetSpeedKmh / 3.6;
    const targetTotalTime = totalDist / targetSpeedMs;

    const startTime = new Date(trackpoints[0].time).getTime();
    const currentTotalTime = (new Date(trackpoints[trackpoints.length - 1].time).getTime() - startTime) / 1000;
    
    if (isNaN(currentTotalTime) || currentTotalTime <= 0) {
        let accumulatedTimeMs = 0;
        let validStartTime = isNaN(startTime) ? Date.now() : startTime;
        
        return trackpoints.map((tp, i) => {
            if (i > 0 && trackpoints[i-1].position && tp.position) {
                const dist = haversineDistance(
                    trackpoints[i-1].position.latitudeDegrees, trackpoints[i-1].position.longitudeDegrees,
                    tp.position.latitudeDegrees, tp.position.longitudeDegrees
                );
                accumulatedTimeMs += (dist / targetSpeedMs) * 1000;
            }
            const newTime = new Date(validStartTime + accumulatedTimeMs);
            return {
                ...tp,
                time: newTime.toISOString().replace('.000Z', 'Z'),
                speed: Math.round(targetSpeedMs * 10) / 10
            };
        });
    }
    
    const factor = currentTotalTime / targetTotalTime;
    
    return speedScale(trackpoints, factor);
  }

  function elevationOffset(trackpoints, offsetMeters) {
    return trackpoints.map(tp => ({
      ...tp,
      position: tp.position ? { ...tp.position } : null,
      altitudeMeters: tp.altitudeMeters !== null
        ? Math.round((tp.altitudeMeters + offsetMeters) * 10) / 10
        : null,
    }));
  }

  /**
   * Generate trackpoints along a route defined by waypoints.
   * Uses the provided road-snapped coordinates.
   * @param {Array} routeCoords - Array of [lat, lon] from OSRM
   * @param {Object} options - Generation options
   * @returns {Array} Generated trackpoints
   */
  function generateTrackpointsFromRoute(routeCoords, options = {}) {
    const {
      sport = 'Biking',
      startTime = new Date().toISOString(),
      avgSpeedMs = sport === 'Running' ? 3.0 : sport === 'Walking' ? 1.4 : 5.5,
      intervalSeconds = 1,
    } = options;

    if (routeCoords.length < 2) return [];

    // Calculate distances between consecutive points
    const segments = [];
    let totalDistance = 0;

    for (let i = 1; i < routeCoords.length; i++) {
      const dist = haversineDistance(
        routeCoords[i - 1][0], routeCoords[i - 1][1],
        routeCoords[i][0], routeCoords[i][1]
      );
      segments.push({ dist, from: i - 1, to: i });
      totalDistance += dist;
    }

    // Generate trackpoints at regular time intervals
    const totalTime = totalDistance / avgSpeedMs;
    const trackpoints = [];
    let currentTime = new Date(startTime).getTime();
    let cumulativeDistance = 0;
    let segmentIdx = 0;
    let distIntoSegment = 0;

    // First trackpoint
    trackpoints.push({
      time: new Date(currentTime).toISOString().replace('.000Z', 'Z'),
      position: {
        latitudeDegrees: routeCoords[0][0],
        longitudeDegrees: routeCoords[0][1],
      },
      altitudeMeters: 0,
      distanceMeters: 0,
      heartRateBpm: null,
      cadence: null,
      speed: 0,
    });

    const distPerInterval = avgSpeedMs * intervalSeconds;

    while (segmentIdx < segments.length) {
      distIntoSegment += distPerInterval;

      // Advance through segments
      while (segmentIdx < segments.length && distIntoSegment > segments[segmentIdx].dist) {
        distIntoSegment -= segments[segmentIdx].dist;
        segmentIdx++;
      }

      if (segmentIdx >= segments.length) break;

      // Interpolate position within current segment
      const seg = segments[segmentIdx];
      const fraction = distIntoSegment / seg.dist;
      const fromCoord = routeCoords[seg.from];
      const toCoord = routeCoords[seg.to];

      const lat = fromCoord[0] + (toCoord[0] - fromCoord[0]) * fraction;
      const lon = fromCoord[1] + (toCoord[1] - fromCoord[1]) * fraction;

      currentTime += intervalSeconds * 1000;
      cumulativeDistance += distPerInterval;

      trackpoints.push({
        time: new Date(currentTime).toISOString().replace('.000Z', 'Z'),
        position: {
          latitudeDegrees: Math.round(lat * 10000000) / 10000000,
          longitudeDegrees: Math.round(lon * 10000000) / 10000000,
        },
        altitudeMeters: 0,
        distanceMeters: Math.round(cumulativeDistance * 10) / 10,
        heartRateBpm: null,
        cadence: null,
        speed: Math.round(avgSpeedMs * 10) / 10,
      });
    }

    return trackpoints;
  }

  /**
   * Recalculate cumulative distances from coordinates.
   */
  function recalculateCumulativeDistance(trackpoints) {
    if (trackpoints.length === 0) return [];

    let cumDist = 0;
    const result = [{ ...trackpoints[0], position: trackpoints[0].position ? { ...trackpoints[0].position } : null, distanceMeters: 0 }];

    for (let i = 1; i < trackpoints.length; i++) {
      const prev = trackpoints[i - 1];
      const curr = trackpoints[i];

      if (prev.position && curr.position) {
        cumDist += haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          curr.position.latitudeDegrees, curr.position.longitudeDegrees
        );
      }

      result.push({
        ...curr,
        position: curr.position ? { ...curr.position } : null,
        distanceMeters: Math.round(cumDist * 10) / 10,
      });
    }

    // Also recalculate instantaneous speed
    for (let i = 1; i < result.length; i++) {
      const prevTime = new Date(result[i - 1].time).getTime();
      const currTime = new Date(result[i].time).getTime();
      const dt = (currTime - prevTime) / 1000;

      if (dt > 0 && result[i - 1].position && result[i].position) {
        const dist = haversineDistance(
          result[i - 1].position.latitudeDegrees, result[i - 1].position.longitudeDegrees,
          result[i].position.latitudeDegrees, result[i].position.longitudeDegrees
        );
        result[i].speed = Math.round((dist / dt) * 10) / 10;
      }
    }

    return result;
  }

  /**
   * Haversine distance between two GPS coordinates.
   * @returns {number} Distance in meters
   */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
  }

  function toRad(deg) {
    return deg * Math.PI / 180;
  }

  
  /**
   * Apply a perpendicular offset to the trackpoints to simulate running on the sidewalk.
   * @param {Array} trackpoints
   * @param {number} offsetMeters - Positive for right, negative for left
   */
  
    function removePauses(trackpoints) {
      if (trackpoints.length < 2) return trackpoints;
      let newTps = [{ ...trackpoints[0] }];
      let accumulatedPauseMs = 0;

      for (let i = 1; i < trackpoints.length; i++) {
        const prev = trackpoints[i-1];
        const curr = trackpoints[i];
        
        const dist = (prev.position && curr.position) ? haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          curr.position.latitudeDegrees, curr.position.longitudeDegrees
        ) : 0;

        const timeDiff = new Date(curr.time).getTime() - new Date(prev.time).getTime();
        
        if (dist < 1 && timeDiff > 3000) {
          accumulatedPauseMs += timeDiff;
          continue; 
        }
        
        const newTime = new Date(new Date(curr.time).getTime() - accumulatedPauseMs);
        newTps.push({
          ...curr,
          time: newTime.toISOString().replace('.000Z', 'Z')
        });
      }
      return newTps;
    }

    function enforceMaxSpeed(trackpoints, maxSpeedKmh) {
      if (!maxSpeedKmh || trackpoints.length < 2) return trackpoints;
      const maxSpeedMs = maxSpeedKmh / 3.6;
      let newTps = [{ ...trackpoints[0] }];
      let accumulatedTimeMs = 0;
      
      for (let i = 1; i < trackpoints.length; i++) {
        const prev = newTps[i-1];
        const curr = trackpoints[i];
        
        const dist = (prev.position && curr.position) ? haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          curr.position.latitudeDegrees, curr.position.longitudeDegrees
        ) : 0;
        
        let originalDt = new Date(curr.time).getTime() - new Date(trackpoints[i-1].time).getTime();
        if (isNaN(originalDt) || originalDt <= 0) originalDt = 1000;
        
        let currentSpeedMs = (dist / (originalDt / 1000));
        let newDt = originalDt;
        let newSpeed = curr.speed;
        
        if (currentSpeedMs > maxSpeedMs || (curr.speed && curr.speed > maxSpeedMs)) {
          newDt = dist > 0 ? (dist / maxSpeedMs) * 1000 : originalDt;
          newSpeed = maxSpeedMs;
        }
        
        accumulatedTimeMs += newDt;
        const newTime = new Date(new Date(newTps[0].time).getTime() + accumulatedTimeMs);
        
        newTps.push({
          ...curr,
          time: newTime.toISOString().replace('.000Z', 'Z'),
          speed: newSpeed
        });
      }
      return newTps;
    }

    function applyLaneOffset(trackpoints, offsetMeters) {
    if (trackpoints.length < 2 || offsetMeters === 0) return trackpoints;

    return trackpoints.map((tp, i) => {
      if (!tp.position) return tp;
      
      let p1 = trackpoints[i];
      let p2 = trackpoints[i+1];
      
      if (i === trackpoints.length - 1) {
        // Last point uses previous point's direction
        p1 = trackpoints[i-1];
        p2 = trackpoints[i];
      }
      
      if (!p1.position || !p2.position) return tp;
      
      // Calculate bearing from p1 to p2
      const lat1 = toRad(p1.position.latitudeDegrees);
      const lon1 = toRad(p1.position.longitudeDegrees);
      const lat2 = toRad(p2.position.latitudeDegrees);
      const lon2 = toRad(p2.position.longitudeDegrees);
      
      const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
      let bearing = Math.atan2(y, x);
      
      // Perpendicular bearing (add 90 degrees / pi/2 radians)
      const perpBearing = bearing + (Math.PI / 2);
      
      // Offset point calculation (using Haversine inverse)
      // d / R
      const angularDist = offsetMeters / EARTH_RADIUS_M;
      
      const latOrig = toRad(tp.position.latitudeDegrees);
      const lonOrig = toRad(tp.position.longitudeDegrees);
      
      const latNew = Math.asin(Math.sin(latOrig) * Math.cos(angularDist) + 
                               Math.cos(latOrig) * Math.sin(angularDist) * Math.cos(perpBearing));
      
      let lonNew = lonOrig + Math.atan2(Math.sin(perpBearing) * Math.sin(angularDist) * Math.cos(latOrig), 
                                          Math.cos(angularDist) - Math.sin(latOrig) * Math.sin(latNew));
                                          
      return {
        ...tp,
        position: {
          latitudeDegrees: latNew * 180 / Math.PI,
          longitudeDegrees: lonNew * 180 / Math.PI
        }
      };
    });
  }

  // Public API
  return {
      timeShift,
      speedScale,
      trimRoute,
      reverseRoute,
      loopRoute,
      elevationOffset,
      scaleToTargetSpeed,
      generateTrackpointsFromRoute,
      recalculateCumulativeDistance,
      haversineDistance,
      applyLaneOffset,
      removePauses,
      enforceMaxSpeed,
    };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RouteEngine;
}

