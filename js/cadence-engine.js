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
    base: 174,
    min: 155,
    max: 195,

    // Pace hanya memberi pengaruh kecil terhadap cadence.
    speedBreakpoints: [1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.5],
    cadenceInfluence: [-8, -4, -2, 0, 2, 5, 8],

    // Natural variation
    noise: 1.5,

    // Seberapa cepat cadence mengikuti perubahan target.
    inertia: 0.88,
  },

  Walking: {
    base: 110,
    min: 85,
    max: 135,

    speedBreakpoints: [0.6, 1.0, 1.3, 1.6, 1.8, 2.0, 2.4],
    cadenceInfluence: [-8, -4, -2, 0, 2, 4, 6],

    noise: 1.5,
    inertia: 0.88,
  },

  Biking: {
    base: 82,
    min: 55,
    max: 115,

    speedBreakpoints: [2, 4, 6, 8, 10, 12, 15],
    cadenceInfluence: [-8, -4, -2, 0, 2, 5, 8],

    noise: 2,
    inertia: 0.88,
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

    // Stop / very slow movement
    if (speed < 0.3) {
      smoothedCadence *= 0.65;

      if (smoothedCadence < 5) {
        smoothedCadence = 0;
      }

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        cadence: 0,
      };
    }

    // Pace has only a small influence on cadence.
    const influence = interpolateCadenceInfluence(speed, profile);

    const targetCadence =
      profile.base + influence;

    // Strong inertia keeps cadence physiologically stable.
    smoothedCadence =
      smoothedCadence * profile.inertia +
      targetCadence * (1 - profile.inertia);

    // Small natural variation.
    const noise =
      (Math.random() - 0.5) *
      profile.noise *
      2;

    // Very subtle breathing / rhythm variation.
    const rhythm =
      Math.sin(i / 12) *
      0.6;

    const raw =
      smoothedCadence +
      noise +
      rhythm;

    const clamped =
      Math.round(
        Math.max(
          profile.min,
          Math.min(profile.max, raw)
        )
      );

    return {
      ...tp,
      position: tp.position ? { ...tp.position } : null,
      cadence: clamped,
    };
  });

  if (targetAvgCadence && targetAvgCadence > 0) {
    return scaleToTargetCadence(
      result,
      targetAvgCadence,
      profile
    );
  }

  return result;
}

  function interpolateCadenceInfluence(speed, profile) {
  const {
    speedBreakpoints,
    cadenceInfluence
  } = profile;

  if (speed <= speedBreakpoints[0]) {
    return cadenceInfluence[0];
  }

  const last =
    speedBreakpoints.length - 1;

  if (speed >= speedBreakpoints[last]) {
    return cadenceInfluence[last];
  }

  for (let i = 1; i < speedBreakpoints.length; i++) {
    if (speed <= speedBreakpoints[i]) {
      const frac =
        (speed - speedBreakpoints[i - 1]) /
        (speedBreakpoints[i] - speedBreakpoints[i - 1]);

      return (
        cadenceInfluence[i - 1] +
        frac *
        (cadenceInfluence[i] - cadenceInfluence[i - 1])
      );
    }
  }

  return cadenceInfluence[last];
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
