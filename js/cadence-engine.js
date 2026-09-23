/**
 * Cadence Engine Module
 * Generates realistic cadence data correlated with speed, sport type, and stops.
 *
 * Running: 155-195 spm (steps per minute), faster pace = higher cadence
 * Walking: 90-130 spm
 * Cycling: 60-110 rpm, correlated with speed and gradient
 */

const CadenceEngine = (() => {
  'use strict';

  const PROFILES = {
    Running: {
      base: 170,
      min: 150,
      max: 200,
      speedBreakpoints: [0, 1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.5],
      cadenceLevels:    [0, 155, 162, 168, 175, 182, 188, 198],
    },
    Walking: {
      base: 110,
      min: 85,
      max: 135,
      speedBreakpoints: [0, 0.6, 1.0, 1.3, 1.6, 1.8, 2.0, 2.4],
      cadenceLevels:    [0, 90,  98, 105, 112, 118, 124, 132],
    },
    Biking: {
      base: 82,
      min: 55,
      max: 115,
      speedBreakpoints: [0, 2, 4, 6, 8, 10, 12, 15],
      cadenceLevels:    [0, 60, 70, 78, 85, 90, 95, 105],
    },
  };

  /**
   * Generate cadence for every trackpoint.
   * @param {Array} trackpoints
   * @param {Object} options
   * @returns {Array} trackpoints with cadence populated
   */
  function generateCadence(trackpoints, options = {}) {
    const {
      sport = 'Running',
      targetAvgCadence = null,
    } = options;

    if (trackpoints.length === 0) return [];

    const profile = PROFILES[sport] || PROFILES.Running;
    let smoothedCadence = profile.base;

    const result = trackpoints.map((tp, i) => {
      const speed = tp.speed || 0;

      if (speed < 0.3) {
        // Stopped or nearly stopped: cadence drops toward zero gradually
        smoothedCadence = smoothedCadence * 0.7;
        if (smoothedCadence < 5) smoothedCadence = 0;
        return { ...tp, position: tp.position ? { ...tp.position } : null, cadence: 0 };
      }

      const targetCadence = interpolateCadence(speed, profile);

      // Smooth transition (cadence doesn't jump instantly)
      const inertia = 0.75;
      smoothedCadence = smoothedCadence * inertia + targetCadence * (1 - inertia);

      // Natural variance: ±2-4 depending on sport
      const variance = sport === 'Biking' ? 3.5 : 2.5;
      const noise = (Math.random() - 0.5) * variance * 2;

      // Breathing-linked oscillation (~0.25 Hz for running, ~0.15 Hz for cycling)
      const breathCycle = sport === 'Biking' ? 7 : 4;
      const breathOsc = Math.sin(i / breathCycle * Math.PI * 2) * (variance * 0.4);

      const raw = smoothedCadence + noise + breathOsc;
      const clamped = Math.round(Math.max(profile.min, Math.min(profile.max, raw)));

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        cadence: clamped,
      };
    });

    if (targetAvgCadence && targetAvgCadence > 0) {
      return scaleToTargetCadence(result, targetAvgCadence, profile);
    }

    return result;
  }

  function interpolateCadence(speed, profile) {
    const { speedBreakpoints, cadenceLevels } = profile;

    if (speed <= speedBreakpoints[0]) return cadenceLevels[0];
    if (speed >= speedBreakpoints[speedBreakpoints.length - 1]) {
      return cadenceLevels[cadenceLevels.length - 1];
    }

    for (let i = 1; i < speedBreakpoints.length; i++) {
      if (speed <= speedBreakpoints[i]) {
        const frac = (speed - speedBreakpoints[i - 1]) /
          (speedBreakpoints[i] - speedBreakpoints[i - 1]);
        return cadenceLevels[i - 1] + frac * (cadenceLevels[i] - cadenceLevels[i - 1]);
      }
    }
    return cadenceLevels[cadenceLevels.length - 1];
  }

  function scaleToTargetCadence(trackpoints, targetAvg, profile) {
    const moving = trackpoints.filter(tp => tp.cadence > 0);
    if (moving.length === 0) return trackpoints;

    let sum = 0;
    for (const tp of moving) sum += tp.cadence;
    const currentAvg = sum / moving.length;

    if (currentAvg === 0) return trackpoints;
    const diff = targetAvg - currentAvg;

    return trackpoints.map(tp => {
      if (tp.cadence === 0) return { ...tp, position: tp.position ? { ...tp.position } : null };
      const scaled = Math.round(Math.max(profile.min, Math.min(profile.max, tp.cadence + diff)));
      return { ...tp, position: tp.position ? { ...tp.position } : null, cadence: scaled };
    });
  }

  return {
    generateCadence,
    PROFILES,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CadenceEngine;
}
