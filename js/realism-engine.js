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
      targetSpeedKmh = null,
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

    // 3. Generate physics-based timeline with natural pace variance
    result = generatePhysicsBasedTimeline(result, sport, speedVariance, pacingStrategy, targetSpeedKmh);

    // 4. Warmup / Cooldown phase
    if (warmupCooldown) {
      result = applyWarmupCooldown(result, sport);
    }

    // 5. Natural stops with gradual slow-down/speed-up
    if (addStops) {
      result = applyNaturalStops(result, sport);
    }

    // 6. Time gaps (GPS signal drops)
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
    return trackpoints; // Handled inside generatePhysicsBasedTimeline
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

  /**
   * Generate a physics-based timeline that produces natural pace variation.
   *
   * Key improvements:
   * - Uses target speed as base instead of hardcoded 6.0 m/s
   * - Per-km pace variation (±5-15 sec/km)
   * - Micro fluctuations within each km
   * - Multi-frequency fatigue oscillation for realistic patterns
   * - Pacing strategy influences overall speed curve
   */
  function generatePhysicsBasedTimeline(trackpoints, sport = 'Biking', speedVariance = 0.5, pacingStrategy = 'even', targetSpeedKmh = null) {
    if (trackpoints.length < 2) return trackpoints;

    const result = deepCopyTrackpoints(trackpoints);
    const startTime = new Date(result[0].time).getTime();
    let accumulatedTimeMs = 0;
    let totalDist = 0;

    // Compute total distance
    let maxDist = 0;
    for (let i = 1; i < result.length; i++) {
      if (result[i].position && result[i-1].position) {
        maxDist += RouteEngine.haversineDistance(
          result[i-1].position.latitudeDegrees, result[i-1].position.longitudeDegrees,
          result[i].position.latitudeDegrees, result[i].position.longitudeDegrees
        );
      }
    }

    // Determine base speed from target, not hardcoded
    const defaultSpeeds = { Biking: 25, Running: 10, Walking: 5 };
    const baseSpeedKmh = targetSpeedKmh || defaultSpeeds[sport] || 10;
    const baseSpeedMs = baseSpeedKmh / 3.6;

    // Pre-generate per-km pace targets (natural variation between km splits)
    const totalKm = Math.ceil(maxDist / 1000);
    const kmPaceFactors = [];
    for (let km = 0; km < Math.max(totalKm, 1); km++) {
      // Each km has its own pace factor: ±5-15% variation
      const kmVariation = (gaussianRandom() * 0.04 + (Math.random() - 0.5) * 0.06) * speedVariance;
      kmPaceFactors.push(1 + kmVariation);
    }

    // Pre-generate medium-frequency "effort waves" (simulate natural effort fluctuation)
    const wavePhase1 = Math.random() * Math.PI * 2;
    const wavePhase2 = Math.random() * Math.PI * 2;
    const wavePhase3 = Math.random() * Math.PI * 2;

    const rawSpeeds = new Array(result.length).fill(0);
    rawSpeeds[0] = baseSpeedMs;

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

      // Slope factor (terrain effect on speed)
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

      // Per-km pace factor
      const currentKm = Math.min(Math.floor(totalDist / 1000), kmPaceFactors.length - 1);
      const kmFactor = kmPaceFactors[currentKm];

      // Multi-frequency effort waves (simulate how humans vary effort naturally)
      // Wave 1: long cycle (every ~4-8 km) — overall fatigue/recovery
      const wave1 = Math.sin(totalDist / 5500 * Math.PI * 2 + wavePhase1) * 0.06 * speedVariance;
      // Wave 2: medium cycle (every ~1-2 km) — effort blocks
      const wave2 = Math.sin(totalDist / 1200 * Math.PI * 2 + wavePhase2) * 0.08 * speedVariance;
      // Wave 3: short cycle (every ~200-400m) — micro-surges
      const wave3 = Math.sin(totalDist / 280 * Math.PI * 2 + wavePhase3) * 0.04 * speedVariance;

      // Random micro-noise (every trackpoint)
      const microNoise = (Math.random() - 0.5) * 0.15 * speedVariance;

      let finalSpeedFactor = slopeFactor * kmFactor * (1 + wave1 + wave2 + wave3 + microNoise);

      // Pacing strategy
      if (pacingStrategy === 'negative') {
        const progress = totalDist / (maxDist || 1);
        finalSpeedFactor *= (0.88 + (progress * 0.24));
      } else if (pacingStrategy === 'positive') {
        const progress = totalDist / (maxDist || 1);
        finalSpeedFactor *= (1.12 - (progress * 0.24));
      }

      finalSpeedFactor = Math.max(0.1, finalSpeedFactor);
      rawSpeeds[i] = baseSpeedMs * finalSpeedFactor;
    }

    // Smooth speeds with inertia (runners have less inertia than bikes)
    const smoothedSpeeds = new Array(result.length).fill(0);
    smoothedSpeeds[0] = rawSpeeds[1] || baseSpeedMs;

    const inertia = sport === 'Biking' ? 0.85 : 0.65;
    for (let i = 1; i < result.length; i++) {
      smoothedSpeeds[i] = (smoothedSpeeds[i-1] * inertia) + (rawSpeeds[i] * (1 - inertia));
    }

    // Apply smoothed speeds to timeline
    let accumDist = 0;
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
      
      // Add continuous high-frequency micro-jitter AFTER inertia smoothing.
      // Real GPS watches calculate speed from noisy positions, creating noisy speed charts.
      // Since we generate perfect speed, we must explicitly add this noise back.
      const postSmoothingJitter = (Math.random() - 0.5) * 0.08 * (speedVariance || 0.5);
      currentSpeedMs *= (1 + postSmoothingJitter);
      
      currentSpeedMs = Math.max(0.5, currentSpeedMs);

      const timeForSegmentMs = dist === 0 ? 1000 : (dist / currentSpeedMs) * 1000;
      accumulatedTimeMs += timeForSegmentMs;
      accumDist += dist;

      curr.time = new Date(startTime + accumulatedTimeMs).toISOString().replace('.000Z', 'Z');
      curr.distanceMeters = Math.round(accumDist * 100) / 100;
      // Keep 3 decimal places to avoid flat lines caused by quantization
      curr.speed = Math.round(currentSpeedMs * 1000) / 1000;
    }
    result[0].speed = result[1] ? result[1].speed : baseSpeedMs;
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

  /**
   * Natural stops with gradual slow-down before and speed-up after.
   * Instead of instant zero, the athlete decelerates over ~15 trackpoints
   * before stopping, and gradually accelerates over ~10 trackpoints after.
   */
  function applyNaturalStops(trackpoints, sport = 'Biking') {
    if (trackpoints.length < 100) return trackpoints;
    const stopConfig = {
      Biking:  { minInterval: 180, maxInterval: 600, minDuration: 5, maxDuration: 25, decelWindow: 15, accelWindow: 10 },
      Running: { minInterval: 300, maxInterval: 900, minDuration: 8, maxDuration: 45, decelWindow: 12, accelWindow: 8 },
      Walking: { minInterval: 200, maxInterval: 500, minDuration: 10, maxDuration: 60, decelWindow: 8, accelWindow: 6 },
    };
    const config = stopConfig[sport] || stopConfig.Biking;

    // Pre-determine stop positions
    const stops = [];
    let nextStop = randomInt(config.minInterval, config.maxInterval);
    while (nextStop < trackpoints.length) {
      const duration = randomInt(config.minDuration, config.maxDuration);
      stops.push({ index: nextStop, duration });
      nextStop += randomInt(config.minInterval, config.maxInterval);
    }

    let accumulatedPauseMs = 0;

    return trackpoints.map((tp, i) => {
      const originalTimeMs = new Date(tp.time).getTime();
      let newTimeMs = originalTimeMs + accumulatedPauseMs;
      let speed = tp.speed;

      for (const stop of stops) {
        const decelStart = stop.index - config.decelWindow;
        const accelEnd = stop.index + config.accelWindow;

        if (i === stop.index) {
          // At the stop point: add pause time
          const stopDurationMs = stop.duration * 1000;
          accumulatedPauseMs += stopDurationMs;
          speed = 0.0;
        } else if (i > decelStart && i < stop.index) {
          // Gradual deceleration before stop
          const decelProgress = (stop.index - i) / config.decelWindow;
          speed = speed * easeInOutQuad(decelProgress);
        } else if (i > stop.index && i < accelEnd) {
          // Gradual acceleration after stop
          const accelProgress = (i - stop.index) / config.accelWindow;
          speed = speed * easeInOutQuad(accelProgress);
        }
      }

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        time: new Date(newTimeMs).toISOString().replace('.000Z', 'Z'),
        speed: Math.max(0, speed)
      };
    });
  }

  function applyAltitudeNoise(trackpoints) {
    let baseAltitude = 0;
    for (const tp of trackpoints) {
      if (tp.altitudeMeters != null && tp.altitudeMeters !== 0) {
        baseAltitude = tp.altitudeMeters;
        break;
      }
    }
    const wavePhase = Math.random() * Math.PI * 2;
    const wave2Phase = Math.random() * Math.PI * 2;

    return trackpoints.map((tp, i) => {
      if (tp.altitudeMeters == null) return { ...tp, position: tp.position ? { ...tp.position } : null };
      
      const isFlat = Math.abs(tp.altitudeMeters - baseAltitude) < 2.0;
      let hillyDrift = 0;
      if (isFlat) {
          // Add 3-10 meters of natural elevation drift over the course of the route
          hillyDrift = Math.sin(i / 150 + wavePhase) * 6 + Math.sin(i / 35 + wave2Phase) * 2;
      }

      const noise = gaussianRandom() * 0.3;
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        altitudeMeters: Math.round((tp.altitudeMeters + hillyDrift + noise) * 10) / 10,
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
