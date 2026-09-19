/**
 * Realism Engine Module
 * Applies realistic noise, variance, and natural patterns to trackpoint data
 * to make generated activities indistinguishable from real GPS recordings.
 */

const RealismEngine = (() => {
  'use strict';

  function applyAll(trackpoints, settings = {}) {
    const {
      gpsJitter = 0.5,
      speedVariance = 0.5,
      addStops = true,
      warmupCooldown = true,
      altitudeNoise = true,
      timeGaps = true,
      sport = 'Biking',
      pacingStrategy = 'even',
    } = settings;

    let result = deepCopyTrackpoints(trackpoints);

    // 1. Spatial Jitter
    if (gpsJitter > 0) {
      result = applyGPSJitter(result, gpsJitter);
    }

    // 2. Altitude Noise
    if (altitudeNoise) {
      result = applyAltitudeNoise(result);
    }

    // 3. Generate physics-based timeline (modifies time and speed based on NEW SPATIAL distance)
    result = generatePhysicsBasedTimeline(result, sport, speedVariance, pacingStrategy);

    // 4. Apply Warmup Cooldown (modifies time and speed based on fatigue profile)
    if (warmupCooldown) {
      result = applyWarmupCooldown(result, sport);
    }

    // 5. Apply Natural Stops (modifies time by adding delays)
    if (addStops) {
      result = applyNaturalStops(result, sport);
    }

    // 6. Time gaps
    if (timeGaps) {
      result = applyTimeGaps(result);
    }

    return result;
  }

  function applyGPSJitter(trackpoints, intensity = 0.5) {
    const maxJitter = 0.00003 * intensity;
    return trackpoints.map(tp => {
      if (!tp.position) return { ...tp };
      const latNoise = gaussianRandom() * maxJitter;
      const lonNoise = gaussianRandom() * maxJitter;
      return {
        ...tp,
        position: {
          latitudeDegrees: Math.round((tp.position.latitudeDegrees + latNoise) * 10000000) / 10000000,
          longitudeDegrees: Math.round((tp.position.longitudeDegrees + lonNoise) * 10000000) / 10000000,
        },
      };
    });
  }

  function applySpeedVariance(trackpoints, intensity = 0.5, sport = 'Biking') {
    return trackpoints; // Deprecated as standalone, handled inside generatePhysicsBasedTimeline
  }

  function calculateSmoothedSlope(trackpoints, index, windowSize = 3) {
    const startIdx = Math.max(0, index - windowSize);
    const endIdx = Math.min(trackpoints.length - 1, index + windowSize);
    const startTp = trackpoints[startIdx];
    const endTp = trackpoints[endIdx];

    if (startTp.altitudeMeters == null || endTp.altitudeMeters == null || isNaN(startTp.altitudeMeters) || isNaN(endTp.altitudeMeters)) {
      return 0;
    }

    let dist = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      if (trackpoints[i-1].position && trackpoints[i].position) {
        dist += RouteEngine.haversineDistance(
          trackpoints[i-1].position.latitudeDegrees, trackpoints[i-1].position.longitudeDegrees,
          trackpoints[i].position.latitudeDegrees, trackpoints[i].position.longitudeDegrees
        );
      }
    }
    if (dist < 1) return 0;
    return (endTp.altitudeMeters - startTp.altitudeMeters) / dist;
  }

  function generatePhysicsBasedTimeline(trackpoints, sport = 'Biking', speedVariance = 0.5, pacingStrategy = 'even') {
    if (trackpoints.length < 2) return trackpoints;

    const result = deepCopyTrackpoints(trackpoints);
    const startTime = new Date(result[0].time).getTime();
    let accumulatedTimeMs = 0;
    let totalDist = 0;
    
    let maxDist = 0;
    for(let i = 1; i < result.length; i++) {
      if(result[i].position && result[i-1].position) {
        maxDist += RouteEngine.haversineDistance(result[i-1].position.latitudeDegrees, result[i-1].position.longitudeDegrees, result[i].position.latitudeDegrees, result[i].position.longitudeDegrees);
      }
    }
    
    const rawSpeeds = new Array(result.length).fill(0);
    rawSpeeds[0] = 5.0;

    for (let i = 1; i < result.length; i++) {
      const prev = result[i-1];
      const curr = result[i];
      
      let dist = 0;
      if (prev.position && curr.position) {
        dist = RouteEngine.haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          curr.position.latitudeDegrees, curr.position.longitudeDegrees
        );
      }
      
      if (dist === 0) {
        rawSpeeds[i] = rawSpeeds[i-1];
        continue;
      }

      totalDist += dist;
      const slope = calculateSmoothedSlope(result, i, 4);
      
      let slopeFactor = 1.0;
      if (sport === 'Biking') {
        if (slope > 0.01) slopeFactor = 1.0 / (1 + slope * 30);
        else if (slope < -0.01) slopeFactor = 1.0 + Math.abs(slope * 30);
        slopeFactor = Math.max(0.25, Math.min(3.5, slopeFactor)); 
      } else if (sport === 'Running') {
        if (slope > 0.01) slopeFactor = 1.0 / (1 + slope * 15);
        else if (slope < -0.01) slopeFactor = 1.0 + Math.abs(slope * 10);
        slopeFactor = Math.max(0.5, Math.min(1.25, slopeFactor));
      } else { 
        if (slope > 0.01) slopeFactor = 1.0 / (1 + slope * 10);
        else if (slope < -0.01) slopeFactor = 1.0 + Math.abs(slope * 5);
        slopeFactor = Math.max(0.6, Math.min(1.10, slopeFactor));
      }

      const fatigueWave1 = Math.sin(totalDist / 6000 * Math.PI * 2) * 0.12 * speedVariance; 
      const fatigueWave2 = Math.sin(totalDist / 1500 * Math.PI * 2) * 0.18 * speedVariance; 
      const localNoise = (Math.random() - 0.5) * 0.25 * speedVariance;
      
      let finalSpeedFactor = slopeFactor * (1 + fatigueWave1 + fatigueWave2 + localNoise);
      
      if (pacingStrategy === 'negative') {
        const progress = totalDist / (maxDist || 1);
        finalSpeedFactor *= (0.85 + (progress * 0.3));
      } else if (pacingStrategy === 'positive') {
        const progress = totalDist / (maxDist || 1);
        finalSpeedFactor *= (1.15 - (progress * 0.3));
      }
      finalSpeedFactor = Math.max(0.1, finalSpeedFactor);
      rawSpeeds[i] = 6.0 * finalSpeedFactor;
    }
    
    const smoothedSpeeds = new Array(result.length).fill(0);
    smoothedSpeeds[0] = rawSpeeds[1];
    
    const inertia = sport === 'Biking' ? 0.85 : 0.6;
    for (let i = 1; i < result.length; i++) {
      smoothedSpeeds[i] = (smoothedSpeeds[i-1] * inertia) + (rawSpeeds[i] * (1 - inertia));
    }

    for (let i = 1; i < result.length; i++) {
      const prev = result[i-1];
      const curr = result[i];
      
      let dist = 0;
      if (prev.position && curr.position) {
        dist = RouteEngine.haversineDistance(
          prev.position.latitudeDegrees, prev.position.longitudeDegrees,
          curr.position.latitudeDegrees, curr.position.longitudeDegrees
        );
      }
      
      let currentSpeedMs = smoothedSpeeds[i];
      currentSpeedMs = Math.max(1.0, currentSpeedMs);
      
      const timeForSegmentMs = dist === 0 ? 1000 : (dist / currentSpeedMs) * 1000;
      accumulatedTimeMs += timeForSegmentMs;
      
      curr.time = new Date(startTime + accumulatedTimeMs).toISOString().replace('.000Z', 'Z');
      curr.speed = Math.round(currentSpeedMs * 10) / 10;
    }
    result[0].speed = result[1].speed;
    return result;
  }

  function applyWarmupCooldown(trackpoints, sport = 'Biking') {
    if (trackpoints.length < 60) return trackpoints;
    const warmupDuration = Math.min(45, Math.floor(trackpoints.length * 0.02)); 
    const cooldownDuration = Math.min(30, Math.floor(trackpoints.length * 0.015)); 
    let accumulatedDelayMs = 0;

    return trackpoints.map((tp, i) => {
      const originalTimeMs = new Date(tp.time).getTime();
      let newTimeMs = originalTimeMs + accumulatedDelayMs;
      let speedMultiplier = 1;

      if (i < warmupDuration) {
        const progress = i / warmupDuration;
        speedMultiplier = 0.2 + 0.8 * easeInOutQuad(progress);
      }

      const distFromEnd = trackpoints.length - 1 - i;
      if (distFromEnd < cooldownDuration) {
        const progress = distFromEnd / cooldownDuration;
        speedMultiplier = 0.15 + 0.85 * easeInOutQuad(progress);
      }
      
      let speed = tp.speed;
      if (speedMultiplier < 1.0 && i > 0 && tp.position && trackpoints[i-1].position) {
        const dist = RouteEngine.haversineDistance(
          trackpoints[i-1].position.latitudeDegrees, trackpoints[i-1].position.longitudeDegrees,
          tp.position.latitudeDegrees, tp.position.longitudeDegrees
        );
        const originalSpeedMs = speed / 3.6;
        if (originalSpeedMs > 0) {
          const originalSegmentTime = dist / originalSpeedMs;
          const newSegmentTime = dist / (originalSpeedMs * speedMultiplier);
          const extraTimeMs = (newSegmentTime - originalSegmentTime) * 1000;
          accumulatedDelayMs += extraTimeMs;
          newTimeMs += extraTimeMs;
        }
        speed = speed * speedMultiplier;
      }
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        time: new Date(newTimeMs).toISOString().replace('.000Z', 'Z'),
        speed: speed
      };
    });
  }

  function applyNaturalStops(trackpoints, sport = 'Biking') {
    if (trackpoints.length < 100) return trackpoints;
    const stopConfig = {
      Biking: { minInterval: 180, maxInterval: 600, minDuration: 5, maxDuration: 25 },
      Running: { minInterval: 300, maxInterval: 900, minDuration: 8, maxDuration: 45 },
      Walking: { minInterval: 200, maxInterval: 500, minDuration: 10, maxDuration: 60 },
    };
    const config = stopConfig[sport] || stopConfig.Biking;
    let nextStop = randomInt(config.minInterval, config.maxInterval);
    let accumulatedPauseMs = 0;

    return trackpoints.map((tp, i) => {
      const originalTimeMs = new Date(tp.time).getTime();
      let newTimeMs = originalTimeMs + accumulatedPauseMs;
      let speed = tp.speed;

      if (i === nextStop) {
        const stopDurationMs = randomInt(config.minDuration, config.maxDuration) * 1000;
        accumulatedPauseMs += stopDurationMs;
        speed = 0.0;
        nextStop = i + randomInt(config.minInterval, config.maxInterval);
      } else if (i > nextStop - 10 && i < nextStop) {
        speed = speed * (nextStop - i) / 10.0;
      }
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        time: new Date(newTimeMs).toISOString().replace('.000Z', 'Z'),
        speed: speed
      };
    });
  }

  function applyAltitudeNoise(trackpoints) {
    return trackpoints.map(tp => {
      if (tp.altitudeMeters == null) return { ...tp, position: tp.position ? { ...tp.position } : null };
      const noise = gaussianRandom() * 0.2;
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        altitudeMeters: Math.round((tp.altitudeMeters + noise) * 10) / 10,
      };
    });
  }

  function applyTimeGaps(trackpoints) {
    let accumulatedGapMs = 0;
    return trackpoints.map(tp => {
      const hasGap = Math.random() < 0.03;
      if (hasGap) {
        accumulatedGapMs += randomInt(2, 5) * 1000;
      }
      const originalTimeMs = new Date(tp.time).getTime();
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        time: new Date(originalTimeMs + accumulatedGapMs).toISOString().replace('.000Z', 'Z'),
      };
    });
  }

  function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function deepCopyTrackpoints(trackpoints) {
    return trackpoints.map(tp => ({
      ...tp,
      position: tp.position ? { ...tp.position } : null,
    }));
  }

  return {
    applyAll,
    applyGPSJitter,
    applySpeedVariance,
    generatePhysicsBasedTimeline,
    applyWarmupCooldown,
    applyNaturalStops,
    applyAltitudeNoise,
    applyTimeGaps,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealismEngine;
}
