/**
 * Clone Engine Module
 * Applies real biometrics (HR, Cadence, Watts) from a cloned Strava activity
 * to the generated trackpoints by interpolating over distance percentage.
 */

const CloneEngine = (() => {
  'use strict';

  function applyClonedStream(trackpoints, clonedStream) {
    if (!trackpoints || trackpoints.length === 0 || !clonedStream || clonedStream.length === 0) {
      return trackpoints;
    }

    // Extract stream data
    const distanceStream = clonedStream.find(s => s.type === 'distance')?.data;
    const hrStream = clonedStream.find(s => s.type === 'heartrate')?.data;
    const cadenceStream = clonedStream.find(s => s.type === 'cadence')?.data;
    const wattsStream = clonedStream.find(s => s.type === 'watts')?.data;

    if (!distanceStream || distanceStream.length === 0) {
      console.warn("CloneEngine: No distance stream found in cloned activity.");
      return trackpoints;
    }

    const totalClonedDistance = distanceStream[distanceStream.length - 1];
    if (totalClonedDistance <= 0) return trackpoints;

    // Calculate cumulative distance for trackpoints
    let currentDist = 0;
    const tpDistances = [0];
    for (let i = 1; i < trackpoints.length; i++) {
      const prev = trackpoints[i-1];
      const curr = trackpoints[i];
      if (prev.position && curr.position) {
        currentDist += RouteEngine.haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          curr.position.latitudeDegrees, curr.position.longitudeDegrees
        );
      }
      tpDistances.push(currentDist);
    }

    const totalTpDistance = tpDistances[tpDistances.length - 1];
    if (totalTpDistance <= 0) return trackpoints;

    // Helper to interpolate stream value based on distance percentage
    function interpolate(stream, targetPct) {
      if (!stream || stream.length === 0) return null;
      const targetDist = targetPct * totalClonedDistance;
      
      // Binary search for closest distance index
      let low = 0;
      let high = distanceStream.length - 1;
      let idx = 0;
      
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (distanceStream[mid] < targetDist) {
          idx = mid;
          low = mid + 1;
        } else if (distanceStream[mid] > targetDist) {
          high = mid - 1;
        } else {
          idx = mid;
          break;
        }
      }

      if (idx >= distanceStream.length - 1) return stream[stream.length - 1];

      const d1 = distanceStream[idx];
      const d2 = distanceStream[idx + 1];
      const v1 = stream[idx];
      const v2 = stream[idx + 1];

      if (d1 === d2) return v1;
      
      const fraction = (targetDist - d1) / (d2 - d1);
      return Math.round(v1 + fraction * (v2 - v1));
    }

    // Apply interpolated values to trackpoints
    return trackpoints.map((tp, i) => {
      const pct = tpDistances[i] / totalTpDistance;
      const newTp = { ...tp, position: tp.position ? { ...tp.position } : null };

      if (hrStream) {
        const hr = interpolate(hrStream, pct);
        if (hr !== null) newTp.heartRateBpm = hr;
      }
      if (cadenceStream) {
        const cadence = interpolate(cadenceStream, pct);
        if (cadence !== null) newTp.cadence = cadence;
      }
      if (wattsStream) {
        const watts = interpolate(wattsStream, pct);
        if (watts !== null) newTp.watts = watts; // Note: fit-generator/tcx-generator need to support this
      }

      return newTp;
    });
  }

  return {
    applyClonedStream
  };
})();
