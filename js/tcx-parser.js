/**
 * TCX Parser Module
 * Parses Garmin TCX v2 XML files into structured JavaScript objects.
 * Supports: Biking, Running, Walking activities
 * Compatible with Strava-exported TCX files.
 */

const TCXParser = (() => {
  'use strict';

  /**
   * Parse a TCX XML string into a structured activity object.
   * @param {string} xmlString - Raw TCX XML content
   * @returns {Object} Parsed activity data
   */
  function parse(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid TCX XML: ' + parseError.textContent);
    }

    const activities = [];
    const activityElements = xmlDoc.getElementsByTagName('Activity');

    for (const actEl of activityElements) {
      activities.push(parseActivity(actEl));
    }

    return {
      activities,
      metadata: {
        creator: extractCreator(xmlString),
        schemaLocation: xmlDoc.documentElement.getAttribute('xsi:schemaLocation') || '',
      }
    };
  }

  /**
   * Parse a single Activity element.
   */
  function parseActivity(actEl) {
    const sport = actEl.getAttribute('Sport') || 'Biking';
    const id = getTextContent(actEl, ':scope > Id');

    const laps = [];
    const lapElements = actEl.getElementsByTagName('Lap');

    for (const lapEl of lapElements) {
      laps.push(parseLap(lapEl));
    }

    return {
      sport,
      id,
      laps,
      // Computed summary
      summary: computeActivitySummary(laps),
    };
  }

  /**
   * Parse a single Lap element.
   */
  function parseLap(lapEl) {
    const startTime = lapEl.getAttribute('StartTime') || '';

    const lap = {
      startTime,
      totalTimeSeconds: parseFloat(getTextContent(lapEl, 'TotalTimeSeconds')) || 0,
      distanceMeters: parseFloat(getTextContent(lapEl, 'DistanceMeters')) || 0,
      maximumSpeed: parseFloat(getTextContent(lapEl, 'MaximumSpeed')) || 0,
      calories: parseInt(getTextContent(lapEl, 'Calories')) || 0,
      intensity: getTextContent(lapEl, 'Intensity') || 'Active',
      triggerMethod: getTextContent(lapEl, 'TriggerMethod') || 'Manual',
      tracks: [],
    };

    const trackElements = lapEl.getElementsByTagName('Track');
    for (const trackEl of trackElements) {
      lap.tracks.push(parseTrack(trackEl));
    }

    return lap;
  }

  /**
   * Parse a single Track element (array of Trackpoints).
   */
  function parseTrack(trackEl) {
    const trackpoints = [];
    const tpElements = trackEl.getElementsByTagName('Trackpoint');

    for (const tpEl of tpElements) {
      trackpoints.push(parseTrackpoint(tpEl));
    }

    return { trackpoints };
  }

  /**
   * Parse a single Trackpoint element.
   */
  function parseTrackpoint(tpEl) {
    let timeText = '';
    const timeEls = tpEl.getElementsByTagName('Time');
    if (timeEls.length > 0) timeText = timeEls[0].textContent.trim();

    const tp = {
      time: timeText || '',
      position: null,
      altitudeMeters: null,
      distanceMeters: null,
      heartRateBpm: null,
      cadence: null,
      speed: null,
    };

    const posEls = tpEl.getElementsByTagName('Position');
    if (posEls.length > 0) {
      const posEl = posEls[0];
      const latEls = posEl.getElementsByTagName('LatitudeDegrees');
      const lonEls = posEl.getElementsByTagName('LongitudeDegrees');
      if (latEls.length > 0 && lonEls.length > 0) {
        const lat = parseFloat(latEls[0].textContent);
        const lon = parseFloat(lonEls[0].textContent);
        if (!isNaN(lat) && !isNaN(lon)) {
          tp.position = { latitudeDegrees: lat, longitudeDegrees: lon };
        }
      }
    }

    const altEls = tpEl.getElementsByTagName('AltitudeMeters');
    if (altEls.length > 0) {
      tp.altitudeMeters = parseFloat(altEls[0].textContent);
    }

    const distEls = tpEl.getElementsByTagName('DistanceMeters');
    if (distEls.length > 0) {
      tp.distanceMeters = parseFloat(distEls[0].textContent);
    }

    const hrEls = tpEl.getElementsByTagName('HeartRateBpm');
    if (hrEls.length > 0) {
      const hrValEls = hrEls[0].getElementsByTagName('Value');
      if (hrValEls.length > 0) {
        tp.heartRateBpm = parseInt(hrValEls[0].textContent);
      }
    }

    const cadEls = tpEl.getElementsByTagName('Cadence');
    if (cadEls.length > 0) {
      tp.cadence = parseInt(cadEls[0].textContent);
    } else {
        const runCadEls = tpEl.getElementsByTagName('RunCadence');
        if (runCadEls.length > 0) {
            tp.cadence = parseInt(runCadEls[0].textContent);
        }
    }

    const extEls = tpEl.getElementsByTagName('Extensions');
    if (extEls.length > 0) {
      const tpxEl = extEls[0];
      const speedEls = tpxEl.getElementsByTagName('Speed');
      if (speedEls.length > 0) {
        tp.speed = parseFloat(speedEls[0].textContent);
      }
      
      const wattsEls = tpxEl.getElementsByTagName('Watts');
      if (wattsEls.length > 0) {
        tp.watts = parseInt(wattsEls[0].textContent);
      }
    }

    return tp;
  }

  function computeActivitySummary(laps) {
    let totalTimeSeconds = 0;
    let totalDistanceMeters = 0;
    let maximumSpeed = 0;
    let totalCalories = 0;
    let totalTrackpoints = 0;
    let allTrackpoints = [];

    for (const lap of laps) {
      totalTimeSeconds += lap.totalTimeSeconds;
      totalDistanceMeters += lap.distanceMeters;
      maximumSpeed = Math.max(maximumSpeed, lap.maximumSpeed);
      totalCalories += lap.calories;

      for (const track of lap.tracks) {
        totalTrackpoints += track.trackpoints.length;
        allTrackpoints = allTrackpoints.concat(track.trackpoints);
      }
    }

    // Compute elevation gain/loss
    let elevationGain = 0;
    let elevationLoss = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (let i = 1; i < allTrackpoints.length; i++) {
      const prev = allTrackpoints[i - 1].altitudeMeters;
      const curr = allTrackpoints[i].altitudeMeters;
      if (prev !== null && curr !== null) {
        const diff = curr - prev;
        if (diff > 0) elevationGain += diff;
        else elevationLoss += Math.abs(diff);
        minElevation = Math.min(minElevation, curr);
        maxElevation = Math.max(maxElevation, curr);
      }
    }

    // First trackpoint elevation
    if (allTrackpoints.length > 0 && allTrackpoints[0].altitudeMeters !== null) {
      minElevation = Math.min(minElevation, allTrackpoints[0].altitudeMeters);
      maxElevation = Math.max(maxElevation, allTrackpoints[0].altitudeMeters);
    }

    const avgSpeed = totalTimeSeconds > 0 ? totalDistanceMeters / totalTimeSeconds : 0;

    return {
      totalTimeSeconds,
      totalDistanceMeters,
      maximumSpeed,
      totalCalories,
      totalTrackpoints,
      avgSpeed,
      elevationGain: Math.round(elevationGain * 10) / 10,
      elevationLoss: Math.round(elevationLoss * 10) / 10,
      minElevation: minElevation === Infinity ? 0 : Math.round(minElevation * 10) / 10,
      maxElevation: maxElevation === -Infinity ? 0 : Math.round(maxElevation * 10) / 10,
      startTime: allTrackpoints.length > 0 ? allTrackpoints[0].time : '',
      endTime: allTrackpoints.length > 0 ? allTrackpoints[allTrackpoints.length - 1].time : '',
    };
  }

  /**
   * Extract all trackpoints from parsed data as a flat array.
   */
  function getAllTrackpoints(parsedData) {
    const trackpoints = [];
    for (const activity of parsedData.activities) {
      for (const lap of activity.laps) {
        for (const track of lap.tracks) {
          trackpoints.push(...track.trackpoints);
        }
      }
    }
    return trackpoints;
  }

  /**
   * Get bounding box of the route.
   */
  function getBounds(parsedData) {
    const tps = getAllTrackpoints(parsedData);
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    for (const tp of tps) {
      if (tp.position) {
        minLat = Math.min(minLat, tp.position.latitudeDegrees);
        maxLat = Math.max(maxLat, tp.position.latitudeDegrees);
        minLon = Math.min(minLon, tp.position.longitudeDegrees);
        maxLon = Math.max(maxLon, tp.position.longitudeDegrees);
      }
    }

    return { minLat, maxLat, minLon, maxLon };
  }

  // --- Helpers ---

  function getTextContent(parent, selector) {
    try {
      const el = parent.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (e) {
      // :scope selector not supported in some edge cases
      return null;
    }
  }

  function extractCreator(xmlString) {
    const match = xmlString.match(/<!--\s*(.*?)\s*-->/);
    return match ? match[1].trim() : 'Strava';
  }

  // Public API
  return {
    parse,
    getAllTrackpoints,
    getBounds,
    computeActivitySummary,
  };
})();

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TCXParser;
}
