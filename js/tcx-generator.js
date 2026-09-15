/**
 * TCX Generator Module
 * Generates valid Garmin TCX v2 XML files from structured JavaScript objects.
 * Output is compatible with Strava upload validation.
 * Supports: Biking, Running, Walking with optional Heart Rate data.
 */

const TCXGenerator = (() => {
  'use strict';

  const GARMIN_NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
  const ACTIVITY_EXT_NS = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2';
  const SCHEMA_LOCATION = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd';

  /**
   * Generate a TCX XML string from structured activity data.
   * @param {Object} activityData - Parsed/modified activity data
   * @param {Object} options - Generation options
   * @returns {string} Valid TCX XML string
   */
  function generate(activityData, options = {}) {
    const {
      creator = 'Strava',
      prettyPrint = true,
    } = options;

    const indent = prettyPrint ? ' ' : '';
    const nl = prettyPrint ? '\n' : '';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>${nl}`;
    xml += `<!-- Written by ${creator} -->${nl}`;
    xml += `<TrainingCenterDatabase`;
    xml += ` xsi:schemaLocation="${SCHEMA_LOCATION}"`;
    xml += ` xmlns:ns5="http://www.garmin.com/xmlschemas/ActivityGoals/v1"`;
    xml += ` xmlns:ns3="${ACTIVITY_EXT_NS}"`;
    xml += ` xmlns:ns2="http://www.garmin.com/xmlschemas/UserProfile/v2"`;
    xml += ` xmlns="${GARMIN_NS}"`;
    xml += ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`;
    xml += `>${nl}`;

    xml += `${indent}<Activities>${nl}`;

    for (const activity of activityData.activities) {
      xml += generateActivity(activity, indent, nl, creator);
    }

    xml += `${indent}</Activities>${nl}`;
    
    if (creator !== 'Strava' && creator !== 'None') {
      xml += `${indent}<Author xsi:type="Application_t">${nl}`;
      xml += `${indent}  <Name>Garmin Connect API</Name>${nl}`;
      xml += `${indent}  <Build>${nl}`;
      xml += `${indent}    <Version>${nl}`;
      xml += `${indent}      <VersionMajor>0</VersionMajor>${nl}`;
      xml += `${indent}      <VersionMinor>0</VersionMinor>${nl}`;
      xml += `${indent}      <BuildMajor>0</BuildMajor>${nl}`;
      xml += `${indent}      <BuildMinor>0</BuildMinor>${nl}`;
      xml += `${indent}    </Version>${nl}`;
      xml += `${indent}  </Build>${nl}`;
      xml += `${indent}  <LangID>en</LangID>${nl}`;
      xml += `${indent}  <PartNumber>006-D2449-00</PartNumber>${nl}`;
      xml += `${indent}</Author>${nl}`;
    }
    xml += `</TrainingCenterDatabase>${nl}`;


    return xml;
  }

  /**
   * Generate XML for a single Activity.
   */
  function generateActivity(activity, indent, nl, creatorName = 'Garmin Forerunner 945') {
    let xml = '';
    const i1 = indent.repeat(2);
    const i2 = indent.repeat(3);

    xml += `${i1}<Activity Sport="${escapeXml(activity.sport === "Walking" ? "Other" : activity.sport)}">${nl}`;
    xml += `${i2}<Id>${escapeXml(activity.id)}</Id>${nl}`;

    for (const lap of activity.laps) {
      xml += generateLap(lap, indent, nl);
    }

    
      // Dynamic device tag injection
      if (creatorName !== 'Strava' && creatorName !== 'None') {
        let pId = "3113"; // Garmin Forerunner 945 default
        if (creatorName.includes("COROS")) pId = "1234";
        if (creatorName.includes("HUAWEI")) pId = "5678";
        if (creatorName.includes("Apple")) pId = "9999";
        if (creatorName.includes("Wahoo")) pId = "2222";
        if (creatorName.includes("Edge 530")) pId = "3121";
        if (creatorName.includes("Fenix 7")) pId = "3906";
        if (creatorName.includes("245")) pId = "3146";
        
        xml += `${i2}<Creator xsi:type="Device_t">${nl}`;
        xml += `${i2}  <Name>${escapeXml(creatorName)}</Name>${nl}`;
        xml += `${i2}  <UnitId>3320294101</UnitId>${nl}`;
        xml += `${i2}  <ProductID>${pId}</ProductID>${nl}`;
        xml += `${i2}  <Version>${nl}`;
        xml += `${i2}    <VersionMajor>11</VersionMajor>${nl}`;
        xml += `${i2}    <VersionMinor>60</VersionMinor>${nl}`;
        xml += `${i2}    <BuildMajor>0</BuildMajor>${nl}`;
        xml += `${i2}    <BuildMinor>0</BuildMinor>${nl}`;
        xml += `${i2}  </Version>${nl}`;
        xml += `${i2}</Creator>${nl}`;
      }
      xml += `${i1}</Activity>${nl}`;
      return xml;

  }

  /**
   * Generate XML for a single Lap with recalculated summary stats.
   */
  function generateLap(lap, indent, nl) {
    let xml = '';
    const i2 = indent.repeat(3);
    const i3 = indent.repeat(4);

    // Recalculate lap stats from trackpoints
    const stats = recalculateLapStats(lap);

    xml += `${i2}<Lap StartTime="${escapeXml(lap.startTime)}">${nl}`;
    xml += `${i3}<TotalTimeSeconds>${stats.totalTimeSeconds}</TotalTimeSeconds>${nl}`;
    xml += `${i3}<DistanceMeters>${stats.distanceMeters}</DistanceMeters>${nl}`;
    xml += `${i3}<MaximumSpeed>${stats.maximumSpeed}</MaximumSpeed>${nl}`;
    xml += `${i3}<Calories>${stats.calories}</Calories>${nl}`;
    xml += `${i3}<Intensity>${escapeXml(lap.intensity || 'Active')}</Intensity>${nl}`;
    xml += `${i3}<TriggerMethod>${escapeXml(lap.triggerMethod || 'Manual')}</TriggerMethod>${nl}`;

    for (const track of lap.tracks) {
      xml += generateTrack(track, indent, nl);
    }

    xml += `${i2}</Lap>${nl}`;
    return xml;
  }

  /**
   * Generate XML for a single Track.
   */
  function generateTrack(track, indent, nl) {
    let xml = '';
    const i3 = indent.repeat(4);

    xml += `${i3}<Track>${nl}`;

    for (const tp of track.trackpoints) {
      xml += generateTrackpoint(tp, indent, nl);
    }

    xml += `${i3}</Track>${nl}`;
    return xml;
  }

  /**
   * Generate XML for a single Trackpoint.
   */
  function generateTrackpoint(tp, indent, nl) {
    let xml = '';
    const i4 = indent.repeat(5);
    const i5 = indent.repeat(6);
    const i6 = indent.repeat(7);
    const i7 = indent.repeat(8);

    xml += `${i4}<Trackpoint>${nl}`;
    xml += `${i5}<Time>${escapeXml(tp.time)}</Time>${nl}`;

    // Position
    if (tp.position) {
      xml += `${i5}<Position>${nl}`;
      xml += `${i6}<LatitudeDegrees>${formatCoord(tp.position.latitudeDegrees)}</LatitudeDegrees>${nl}`;
      xml += `${i6}<LongitudeDegrees>${formatCoord(tp.position.longitudeDegrees)}</LongitudeDegrees>${nl}`;
      xml += `${i5}</Position>${nl}`;
    }

    // Altitude
    if (tp.altitudeMeters !== null && tp.altitudeMeters !== undefined) {
      xml += `${i5}<AltitudeMeters>${formatDecimal(tp.altitudeMeters, 1)}</AltitudeMeters>${nl}`;
    }

    // Cumulative Distance
    if (tp.distanceMeters !== null && tp.distanceMeters !== undefined) {
      xml += `${i5}<DistanceMeters>${formatDecimal(tp.distanceMeters, 1)}</DistanceMeters>${nl}`;
    }

    // Heart Rate
    if (tp.heartRateBpm !== null && tp.heartRateBpm !== undefined) {
      xml += `${i5}<HeartRateBpm>${nl}`;
      xml += `${i6}<Value>${Math.round(tp.heartRateBpm)}</Value>${nl}`;
      xml += `${i5}</HeartRateBpm>${nl}`;
    }

    // Cadence (direct child)
    if (tp.cadence !== null && tp.cadence !== undefined) {
      xml += `${i5}<Cadence>${Math.round(tp.cadence)}</Cadence>${nl}`;
    }

    // Extensions (Speed)
    if (tp.speed !== null && tp.speed !== undefined) {
      xml += `${i5}<Extensions>${nl}`;
      xml += `${i6}<TPX xmlns="${ACTIVITY_EXT_NS}">${nl}`;
      xml += `${i7}<Speed>${formatDecimal(tp.speed, 1)}</Speed>${nl}`;
      xml += `${i6}</TPX>${nl}`;
      xml += `${i5}</Extensions>${nl}`;
    }

    xml += `${i4}</Trackpoint>${nl}`;
    return xml;
  }

  /**
   * Recalculate lap summary statistics from trackpoint data.
   */
  function recalculateLapStats(lap) {
    let allTrackpoints = [];
    for (const track of lap.tracks) {
      allTrackpoints = allTrackpoints.concat(track.trackpoints);
    }

    if (allTrackpoints.length === 0) {
      return {
        totalTimeSeconds: lap.totalTimeSeconds || 0,
        distanceMeters: lap.distanceMeters || 0,
        maximumSpeed: lap.maximumSpeed || 0,
        calories: lap.calories || 0,
      };
    }

    // Total time from first to last trackpoint
    const startTime = new Date(allTrackpoints[0].time);
    const endTime = new Date(allTrackpoints[allTrackpoints.length - 1].time);
    const totalTimeSeconds = Math.round((endTime - startTime) / 1000);

    // Distance from last trackpoint's cumulative distance
    const lastTp = allTrackpoints[allTrackpoints.length - 1];
    const distanceMeters = lastTp.distanceMeters !== null ? lastTp.distanceMeters : lap.distanceMeters;

    // Maximum speed
    let maximumSpeed = 0;
    for (const tp of allTrackpoints) {
      if (tp.speed !== null && tp.speed > maximumSpeed) {
        maximumSpeed = tp.speed;
      }
    }

    return {
      totalTimeSeconds,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
      maximumSpeed: Math.round(maximumSpeed * 10) / 10,
      calories: lap.calories || 0,
    };
  }

  /**
   * Create a new empty activity structure.
   * @param {string} sport - 'Biking', 'Running', or 'Walking'
   * @param {string} startTime - ISO 8601 start time
   * @returns {Object} Activity data structure
   */
  function createEmptyActivity(sport, startTime) {
    return {
      activities: [{
        sport: sport,
        id: startTime,
        laps: [{
          startTime: startTime,
          totalTimeSeconds: 0,
          distanceMeters: 0,
          maximumSpeed: 0,
          calories: 0,
          intensity: 'Active',
          triggerMethod: 'Manual',
          tracks: [{
            trackpoints: [],
          }],
        }],
      }],
      metadata: {
        creator: 'Strava',
        schemaLocation: SCHEMA_LOCATION,
      }
    };
  }

  // --- Helpers ---

  function escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function formatCoord(value) {
    // 7 decimal places for GPS coordinates (matches Strava output)
    return value.toFixed(7);
  }

  function formatDecimal(value, decimals) {
    return parseFloat(value).toFixed(decimals);
  }

  // Public API
  return {
    generate,
    createEmptyActivity,
    recalculateLapStats,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TCXGenerator;
}




