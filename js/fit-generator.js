/**
 * FIT Generator Module
 * Generates binary FIT files for Strava upload, supporting precise device spoofing.
 */

const FITGenerator = (() => {
  'use strict';

  function generate(activityData, options = {}) {
    if (!window.FitWriter) {
      throw new Error("FitWriter library is not loaded.");
    }
    
    const {
      creator = 'Garmin Forerunner 945',
      sport = 'Running'
    } = options;

    const fitWriter = new window.FitWriter();

    // Determine device spoofing parameters
    let manufacturer = "garmin"; // default garmin
    let product = 3113; // default FR 945
    
    if (creator === "None") {
      manufacturer = 0; // Unknown
      product = 0;
    } else if (creator.includes("COROS")) {
      manufacturer = 294; 
      product = 1234;
    } else if (creator.includes("HUAWEI")) {
      // Huawei often uses custom FIT IDs, but 298 is commonly used
      manufacturer = 298; 
      product = 5678;
    } else if (creator.includes("Apple")) {
      manufacturer = 326; // apple
      product = 1;
    } else if (creator.includes("Wahoo")) {
      manufacturer = 32; // wahoo_fitness
      product = 31;
    } else if (creator.includes("Edge 530")) {
      manufacturer = "garmin";
      product = 3121;
    } else if (creator.includes("Fenix 7")) {
      manufacturer = "garmin";
      product = 3906;
    } else if (creator.includes("245")) {
      manufacturer = "garmin";
      product = 3146;
    }

    // Determine sport
    let fitSport = "running";
    if (sport === 'Biking') fitSport = "cycling";
    if (sport === 'Walking') fitSport = "walking";

    // Flatten all tracks into a single list of trackpoints for FIT
    const trackpoints = [];
    let startTime = null;
    let endTime = null;
    let totalDist = 0;

    for (const activity of activityData.activities) {
      for (const lap of activity.laps) {
        for (const track of lap.tracks) {
          for (const tp of track.trackpoints) {
            trackpoints.push(tp);
            if (!startTime) startTime = new Date(tp.time);
            endTime = new Date(tp.time);
          }
        }
      }
    }
    
    if (!startTime) startTime = new Date();
    const startFitTime = fitWriter.time(startTime);

    // Write file_id message
    fitWriter.writeMessage("file_id", {
      type: "activity",
      manufacturer: manufacturer,
      product: product,
      serial_number: 1337,
      time_created: startFitTime,
    }, null, true); // define message

    // Activity message
    fitWriter.writeMessage("activity", {
      timestamp: startFitTime,
      total_timer_time: (endTime.getTime() - startTime.getTime()) / 1000,
      local_timestamp: startFitTime,
      num_sessions: 1,
      type: "manual",
      event: "activity",
      event_type: "start"
    }, null, true);

    // Device info message (crucial for non-Garmin devices on Strava)
    if (creator !== "None") {
      fitWriter.writeMessage("device_info", {
        timestamp: startFitTime,
        manufacturer: manufacturer,
        product: product,
        hardware_version: 1,
        software_version: 1.0,
        device_index: 0,
        source_type: "local",
        descriptor_string: creator // Explicitly pass the exact device name string!
      }, null, true);
    }

    // Add record messages
    trackpoints.forEach((tp) => {
      const msg = {
        timestamp: fitWriter.time(new Date(tp.time)),
      };
      
      if (tp.position) {
        msg.position_lat = fitWriter.latlng(tp.position.latitudeDegrees);
        msg.position_long = fitWriter.latlng(tp.position.longitudeDegrees);
      }
      if (tp.altitudeMeters != null) {
        msg.altitude = tp.altitudeMeters;
      }
      if (tp.distanceMeters != null) {
        msg.distance = tp.distanceMeters;
        totalDist = tp.distanceMeters;
      }
      if (tp.speed != null) {
        msg.speed = tp.speed;
      }
      if (tp.heartRateBpm != null) {
        msg.heart_rate = tp.heartRateBpm;
      }
      if (tp.cadence != null) {
        msg.cadence = tp.cadence;
      }
      if (tp.runCadence != null) {
        msg.cadence = tp.runCadence;
      }
      if (tp.power != null) {
        msg.power = tp.power;
      }

      fitWriter.writeMessage("record", msg);
    });

    // Write session message
    fitWriter.writeMessage("session", {
      timestamp: fitWriter.time(endTime),
      start_time: startFitTime,
      start_position_lat: trackpoints[0]?.position ? fitWriter.latlng(trackpoints[0].position.latitudeDegrees) : null,
      start_position_long: trackpoints[0]?.position ? fitWriter.latlng(trackpoints[0].position.longitudeDegrees) : null,
      total_elapsed_time: (endTime.getTime() - startTime.getTime()) / 1000,
      total_timer_time: (endTime.getTime() - startTime.getTime()) / 1000,
      total_distance: totalDist,
      sport: fitSport,
      sub_sport: "generic",
      first_lap_index: 0,
      num_laps: 1,
      event: "session",
      event_type: "stop"
    }, null, true);

    // Finalize
    const fitData = fitWriter.finish();
    const uint8Array = new Uint8Array(fitData.buffer, fitData.byteOffset, fitData.byteLength);
    return uint8Array;
  }

  // Public API
  return {
    generate
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FITGenerator;
}
