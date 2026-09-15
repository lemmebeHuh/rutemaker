/**
 * Realism Engine Module
 * Applies realistic noise, variance, and natural patterns to trackpoint data
 * to make generated activities indistinguishable from real GPS recordings.
 * 
 * Anti-detection techniques:
 * - GPS coordinate jitter (simulates real GPS inaccuracy)
 * - Speed variance with smooth acceleration curves
 * - Natural stop simulation (traffic lights, intersections)
 * - Warm-up and cool-down speed patterns
 * - Altitude micro-variations
 * - Time gap simulation (GPS signal loss)
 */

const RealismEngine = (() => {
  'use strict';

  /**
   * Apply all realism transformations to trackpoints.
   * @param {Array} trackpoints - Input trackpoints
   * @param {Object} settings - Realism settings
   * @returns {Array} Trackpoints with realistic noise applied
   */
  function applyAll(trackpoints, settings = {}) {
    const {
      gpsJitter = 0.5,        // 0-1 intensity
      speedVariance = 0.5,    // 0-1 intensity
      addStops = true,        // Insert natural stops
      warmupCooldown = true,  // Speed ramp at start/end
      altitudeNoise = true,   // Altitude micro-variations
      timeGaps = true,        // Occasional GPS signal gaps
      sport = 'Biking',
    } = settings;

    let result = deepCopyTrackpoints(trackpoints);

    // Apply in specific order for best results
    if (warmupCooldown) {
      result = applyWarmupCooldown(result, sport);
    }

    if (speedVariance > 0) {
      result = applySpeedVariance(result, speedVariance, sport);
    }

    if (addStops) {
      result = applyNaturalStops(result, sport);
    }

    if (gpsJitter > 0) {
      result = applyGPSJitter(result, gpsJitter);
    }

    if (altitudeNoise) {
      result = applyAltitudeNoise(result);
    }

    if (timeGaps) {
      result = applyTimeGaps(result);
    }

    // Always recalculate timestamps to be 1-second intervals (with possible gaps)
    result = recalculateTimestamps(result);

    return result;
  }

  /**
   * Apply GPS coordinate jitter to simulate real GPS inaccuracy.
   * Real smartphone GPS has ~3-5m accuracy.
   * @param {Array} trackpoints
   * @param {number} intensity - 0-1 jitter intensity
   * @returns {Array} Trackpoints with GPS noise
   */
  function applyGPSJitter(trackpoints, intensity = 0.5) {
    // 0.00001° ≈ 1.1m at equator, typical GPS noise is ±3-5m
    const maxJitter = 0.00003 * intensity;

    return trackpoints.map(tp => {
      if (!tp.position) return { ...tp };

      // Gaussian-like noise using Box-Muller transform
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

  /**
   * Apply speed variance using Perlin-like noise overlay.
   * Real speed data has natural oscillation from pedaling cadence,
   * wind resistance, terrain micro-changes, etc.
   * @param {Array} trackpoints
   * @param {number} intensity - 0-1 variance intensity
   * @param {string} sport
   * @returns {Array} Trackpoints with speed variance
   */
  function applySpeedVariance(trackpoints, intensity = 0.5, sport = 'Biking') {
    // Different sports have different speed variance characteristics
    const varianceConfig = {
      Biking: { baseVariance: 0.12, oscillationPeriod: 15, microPeriod: 3 },
      Running: { baseVariance: 0.08, oscillationPeriod: 20, microPeriod: 5 },
      Walking: { baseVariance: 0.10, oscillationPeriod: 10, microPeriod: 4 },
    };

    const config = varianceConfig[sport] || varianceConfig.Biking;
    const variance = config.baseVariance * intensity;

    return trackpoints.map((tp, i) => {
      if (tp.speed === null || tp.speed === undefined || tp.speed === 0) {
        return { ...tp, position: tp.position ? { ...tp.position } : null };
      }

      // Multi-frequency oscillation (natural cadence-like pattern)
      const slowOsc = Math.sin(i / config.oscillationPeriod * Math.PI * 2) * variance * 0.6;
      const fastOsc = Math.sin(i / config.microPeriod * Math.PI * 2) * variance * 0.3;
      const randomNoise = (Math.random() - 0.5) * variance * 0.2;

      const totalVariance = 1 + slowOsc + fastOsc + randomNoise;
      const newSpeed = Math.max(0.1, tp.speed * totalVariance);

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        speed: Math.round(newSpeed * 10) / 10,
      };
    });
  }

  /**
   * Apply warm-up and cool-down speed patterns.
   * Real activities start slow, build up, and wind down at the end.
   * @param {Array} trackpoints
   * @param {string} sport
   * @returns {Array} Trackpoints with warm-up/cool-down pattern
   */

  /**
   * Generates a completely new timeline for trackpoints based on elevation gradients
   * and continuous global fatigue noise. This ignores original timestamps entirely.
   */

  /**
   * Calculate smoothed slope by looking ahead and behind (windowing).
   * Reduces extreme gradient spikes from GPS altitude noise.
   */
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

  /**
   * Generates a completely new timeline for trackpoints based on elevation gradients
   * and continuous global fatigue noise. This ignores original timestamps entirely.
   */
  function generatePhysicsBasedTimeline(trackpoints, sport = 'Biking', speedVariance = 0.5, pacingStrategy = 'even') {
    if (trackpoints.length < 2) return trackpoints;

    const result = deepCopyTrackpoints(trackpoints);
    const startTime = new Date(result[0].time).getTime();
    let accumulatedTimeMs = 0;
    let totalDist = 0;
    
    // Pre-calculate total distance for pacing
    let maxDist = 0;
    for(let i = 1; i < result.length; i++) {
      if(result[i].position && result[i-1].position) {
        maxDist += RouteEngine.haversineDistance(result[i-1].position.latitudeDegrees, result[i-1].position.longitudeDegrees, result[i].position.latitudeDegrees, result[i].position.longitudeDegrees);
      }
    }
    
    // Array to hold intermediate speeds before time accumulation
    const rawSpeeds = new Array(result.length).fill(0);
    rawSpeeds[0] = 5.0; // dummy base speed

    // 1. Calculate raw physics speed for every point based on smoothed slope
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
      
      // Use smoothed slope
      const slope = calculateSmoothedSlope(result, i, 4); // look 4 points ahead/behind
      
      let slopeFactor = 1.0;
      if (sport === 'Biking') {
        if (slope > 0.01) { 
          slopeFactor = 1.0 / (1 + slope * 30);
        } else if (slope < -0.01) { 
          slopeFactor = 1.0 + Math.abs(slope * 30);
        }
        slopeFactor = Math.max(0.25, Math.min(3.5, slopeFactor)); 
      } else if (sport === 'Running') {
        if (slope > 0.01) { 
          slopeFactor = 1.0 / (1 + slope * 15);
        } else if (slope < -0.01) { 
          slopeFactor = 1.0 + Math.abs(slope * 10);
        }
        slopeFactor = Math.max(0.5, Math.min(1.25, slopeFactor)); // Max 25% faster on downhills
      } else { 
        // Walking
        if (slope > 0.01) { 
          slopeFactor = 1.0 / (1 + slope * 10);
        } else if (slope < -0.01) { 
          slopeFactor = 1.0 + Math.abs(slope * 5);
        }
        slopeFactor = Math.max(0.6, Math.min(1.10, slopeFactor)); // Max 10% faster on downhills
      }

      const fatigueWave1 = Math.sin(totalDist / 6000 * Math.PI * 2) * 0.12 * speedVariance; 
      const fatigueWave2 = Math.sin(totalDist / 1500 * Math.PI * 2) * 0.18 * speedVariance; 
      const localNoise = (Math.random() - 0.5) * 0.25 * speedVariance;
      
      let finalSpeedFactor = slopeFactor * (1 + fatigueWave1 + fatigueWave2 + localNoise);
      
      if (pacingStrategy === 'negative') {
        const progress = totalDist / (maxDist || 1);
        const pacingMultiplier = 0.85 + (progress * 0.3); // Starts at 85% speed, ends at 115% speed
        finalSpeedFactor *= pacingMultiplier;
      } else if (pacingStrategy === 'positive') {
        const progress = totalDist / (maxDist || 1);
        const pacingMultiplier = 1.15 - (progress * 0.3); // Starts fast, slows down
        finalSpeedFactor *= pacingMultiplier;
      }
      finalSpeedFactor = Math.max(0.1, finalSpeedFactor);

      // We assume a base abstract speed of 6 m/s (~21 km/h) which will later be scaled by TargetSpeed anyway
      rawSpeeds[i] = 6.0 * finalSpeedFactor;
    }
    
    // 2. Smooth the speeds (acceleration inertia)
    const smoothedSpeeds = new Array(result.length).fill(0);
    smoothedSpeeds[0] = rawSpeeds[1];
    
    // Exponential moving average for physics inertia
    // Biking has higher inertia than running
    const inertia = sport === 'Biking' ? 0.85 : 0.6;
    for (let i = 1; i < result.length; i++) {
      smoothedSpeeds[i] = (smoothedSpeeds[i-1] * inertia) + (rawSpeeds[i] * (1 - inertia));
    }

    // 3. Accumulate Time
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
      // Hard limits to prevent insane time jumps
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
      
      // If speed decreases, the time taken for this segment should INCREASE.
      // So we need to calculate how much extra time it took.
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

  /**
   * Insert natural stops to simulate traffic lights, intersections, breaks.
   * @param {Array} trackpoints
   * @param {string} sport
   * @returns {Array} Trackpoints with inserted stops
   */
  function applyNaturalStops(trackpoints, sport = 'Biking') {
    if (trackpoints.length < 100) return trackpoints;

    const stopConfig = {
      Biking: { minInterval: 180, maxInterval: 600, minDuration: 5, maxDuration: 25 },
      Running: { minInterval: 300, maxInterval: 900, minDuration: 8, maxDuration: 45 },
      Walking: { minInterval: 200, maxInterval: 500, minDuration: 10, maxDuration: 60 },
    };
    const config = stopConfig[sport] || stopConfig.Biking;
    
    // We must shift timestamps to simulate a stop, because points are spatially continuous.
    let nextStop = randomInt(config.minInterval, config.maxInterval);
    let accumulatedPauseMs = 0;

    return trackpoints.map((tp, i) => {
      // Apply accumulated pause to timestamp
      const originalTimeMs = new Date(tp.time).getTime();
      let newTimeMs = originalTimeMs + accumulatedPauseMs;
      
      let speed = tp.speed;

      if (i === nextStop) {
        const stopDurationMs = randomInt(config.minDuration, config.maxDuration) * 1000;
        accumulatedPauseMs += stopDurationMs;
        speed = 0.0;
        nextStop = i + randomInt(config.minInterval, config.maxInterval);
      } else if (i > nextStop - 10 && i < nextStop) {
        // Decelerating
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

  /**
   * Apply altitude micro-variations.
   * Real GPS altitude readings have ±0.1-0.5m jitter.
   * @param {Array} trackpoints
   * @returns {Array} Trackpoints with altitude noise
   */
  function applyAltitudeNoise(trackpoints) {
    return trackpoints.map(tp => {
      if (tp.altitudeMeters === null || tp.altitudeMeters === undefined) {
        return { ...tp, position: tp.position ? { ...tp.position } : null };
      }

      const noise = gaussianRandom() * 0.2; // ±0.2m typical
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        altitudeMeters: Math.round((tp.altitudeMeters + noise) * 10) / 10,
      };
    });
  }

  /**
   * Apply occasional time gaps to simulate GPS signal loss.
   * ~2-3% of trackpoints will have 2-5 second gaps instead of 1 second.
   * @param {Array} trackpoints
   * @returns {Array} Trackpoints with marked time gaps
   */
  function applyTimeGaps(trackpoints) {
    return trackpoints.map(tp => {
      // ~3% chance of a gap
      const hasGap = Math.random() < 0.03;
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        _timeGap: hasGap ? randomInt(2, 5) : 0, // internal marker for timestamp recalc
      };
    });
  }

  /**
   * Recalculate timestamps based on speed and gaps.
   * Ensures all timestamps are coherent.
   */
  function recalculateTimestamps(trackpoints) {
    if (trackpoints.length === 0) return [];

    const startTime = new Date(trackpoints[0].time).getTime();
    let currentTime = startTime;

    return trackpoints.map((tp, i) => {
      if (i === 0) {
        const result = { ...tp, position: tp.position ? { ...tp.position } : null };
        delete result._timeGap;
        return result;
      }

      const gap = tp._timeGap || 0;
      currentTime += (1 + gap) * 1000; // 1 second base + gap

      const result = {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        time: new Date(currentTime).toISOString().replace('.000Z', 'Z'),
      };
      delete result._timeGap;
      return result;
    });
  }

  // --- Helper functions ---

  /**
   * Gaussian random using Box-Muller transform.
   * Returns values centered at 0 with stdev ~1.
   */
  function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Easing function for natural acceleration/deceleration.
   */
  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /**
   * Random integer in range [min, max].
   */
  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Deep copy trackpoints array.
   */
  function deepCopyTrackpoints(trackpoints) {
    return trackpoints.map(tp => ({
      ...tp,
      position: tp.position ? { ...tp.position } : null,
    }));
  }

  // Public API
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








