/**
 * GPX Parser Module
 * Parses GPX files and converts them into the same data structure as TCXParser
 * so the rest of the application works seamlessly.
 */

const GPXParser = (() => {
  'use strict';

  /**
   * Parse a GPX XML string into the same structure as TCXParser.parse()
   */
  function parse(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid GPX XML: ' + parseError.textContent);
    }

    // GPX tracks
    const trkElements = xmlDoc.querySelectorAll('trk');
    const activities = [];

    for (const trkEl of trkElements) {
      activities.push(parseTrack(trkEl));
    }

    // If no <trk>, try <rte> (route) elements
    if (activities.length === 0) {
      const rteElements = xmlDoc.querySelectorAll('rte');
      for (const rteEl of rteElements) {
        activities.push(parseRoute(rteEl));
      }
    }

    return {
      activities,
      metadata: {
        creator: extractCreator(xmlDoc, xmlString),
        schemaLocation: '',
      }
    };
  }

  /**
   * Parse a <trk> element into an Activity-like object.
   */
  function parseTrack(trkEl) {
    const name = getTextContent(trkEl, 'name') || '';
    const type = getTextContent(trkEl, 'type') || '';

    // Determine sport from GPX type field
    const sport = detectSport(type, name);

    const laps = [];
    const trkSegElements = trkEl.querySelectorAll('trkseg');

    for (const segEl of trkSegElements) {
      laps.push(parseSegment(segEl, 'trkpt'));
    }

    return {
      sport,
      id: (laps.length > 0 && laps[0].startTime) ? laps[0].startTime : new Date().toISOString(),
      laps,
      summary: computeActivitySummary(laps),
    };
  }

  /**
   * Parse a <rte> element into an Activity-like object.
   */
  function parseRoute(rteEl) {
    const name = getTextContent(rteEl, 'name') || '';
    const type = getTextContent(rteEl, 'type') || '';
    const sport = detectSport(type, name);

    // Treat all rtept as one segment
    const lap = parseSegment(rteEl, 'rtept');

    return {
      sport,
      id: (laps.length > 0 && laps[0].startTime) ? laps[0].startTime : new Date().toISOString(),
      laps: [lap],
      summary: computeActivitySummary([lap]),
    };
  }

  /**
   * Parse a segment (trkseg or rte) into a Lap-like object.
   */
  function parseSegment(segEl, pointTag) {
    const trackpoints = [];
    const ptElements = segEl.querySelectorAll(pointTag);
    let cumulativeDistance = 0;

    for (let i = 0; i < ptElements.length; i++) {
      const ptEl = ptElements[i];
      const tp = parsePoint(ptEl);

      // Calculate cumulative distance
      if (i > 0 && trackpoints[i - 1].position && tp.position) {
        const prev = trackpoints[i - 1];
        const dist = haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          tp.position.latitudeDegrees, tp.position.longitudeDegrees
        );
        cumulativeDistance += dist;
      }
      tp.distanceMeters = cumulativeDistance;
      trackpoints.push(tp);
    }

    // Calculate total time and distance
    let totalTimeSeconds = 0;
    if (trackpoints.length >= 2) {
      const first = trackpoints[0].time;
      const last = trackpoints[trackpoints.length - 1].time;
      if (first && last) {
        try {
          const t = (new Date(last) - new Date(first)) / 1000;
          if (!isNaN(t) && t > 0) totalTimeSeconds = t;
        } catch(e) {}
      }
    }

    return {
      startTime: trackpoints.length > 0 ? trackpoints[0].time : '',
      totalTimeSeconds,
      distanceMeters: cumulativeDistance,
      maximumSpeed: 0,
      calories: 0,
      intensity: 'Active',
      triggerMethod: 'Manual',
      tracks: [{ trackpoints }],
    };
  }

  /**
   * Parse a single <trkpt> or <rtept> element.
   */
  function parsePoint(ptEl) {
    const lat = parseFloat(ptEl.getAttribute('lat')) || 0;
    const lon = parseFloat(ptEl.getAttribute('lon')) || 0;

    const tp = {
      time: getTextContent(ptEl, 'time') || '',
      position: { latitudeDegrees: lat, longitudeDegrees: lon },
      altitudeMeters: null,
      distanceMeters: null,
      heartRateBpm: null,
      cadence: null,
      speed: null,
    };

    // Elevation
    const eleText = getTextContent(ptEl, 'ele');
    if (eleText !== null) {
      tp.altitudeMeters = parseFloat(eleText);
    }

    // Heart rate from extensions (Garmin, Strava, etc.)
    const hrEl = ptEl.querySelector('extensions');
    if (hrEl) {
      // Try common HR extension formats
      const hrValue = hrEl.querySelector('hr') ||
                      hrEl.querySelector('TrackPointExtension > hr') ||
                      hrEl.querySelector('gpxtpx\\:hr, hr');
      if (hrValue) {
        tp.heartRateBpm = parseInt(hrValue.textContent) || null;
      }

      // Try cadence
      const cadValue = hrEl.querySelector('cad') ||
                        hrEl.querySelector('TrackPointExtension > cad') ||
                        hrEl.querySelector('gpxtpx\\:cad, cad');
      if (cadValue) {
        tp.cadence = parseInt(cadValue.textContent) || null;
      }
    }

    return tp;
  }

  /**
   * Detect sport type from GPX type/name fields.
   */
  function detectSport(type, name) {
    const combined = (type + ' ' + name).toLowerCase();
    if (combined.includes('run') || combined.includes('lari')) return 'Running';
    if (combined.includes('walk') || combined.includes('jalan') || combined.includes('hike')) return 'Walking';
    if (combined.includes('bike') || combined.includes('cycling') || combined.includes('ride') || combined.includes('sepeda')) return 'Biking';
    return 'Biking'; // default
  }

  /**
   * Haversine distance between two lat/lng points in meters.
   */
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Compute summary stats from all laps (same logic as TCXParser).
   */
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

  // --- Helpers ---

  function getTextContent(parent, selector) {
    try {
      const el = parent.querySelector(selector);
      return el ? el.textContent.trim() : null;
    } catch (e) {
      return null;
    }
  }

  function extractCreator(xmlDoc, xmlString) {
    const creatorEl = xmlDoc.querySelector('metadata > name') || xmlDoc.querySelector('metadata > author > name');
    if (creatorEl) return creatorEl.textContent.trim();
    const attr = xmlDoc.documentElement.getAttribute('creator');
    if (attr) return attr;
    return 'GPX Import';
  }

  // Public API
  return {
    parse,
    getAllTrackpoints,
    computeActivitySummary,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GPXParser;
