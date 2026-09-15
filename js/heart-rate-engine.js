/**
 * Heart Rate Engine Module
 * Generates realistic heart rate data correlated with activity speed, effort, and sport type.
 * 
 * Physiology model:
 * - HR responds to effort with a delay (~10-15 seconds)
 * - HR drifts upward over time (cardiac drift)
 * - HR drops during stops but not instantly
 * - HR has natural beat-to-beat variability (HRV)
 * - Different zones correlate with speed/effort levels
 */

const HeartRateEngine = (() => {
  'use strict';

  /**
   * Heart rate zone definitions based on max HR.
   */
  const HR_ZONES = {
    rest: { min: 0.50, max: 0.60 },
    warmup: { min: 0.55, max: 0.65 },
    easy: { min: 0.60, max: 0.70 },
    aerobic: { min: 0.70, max: 0.80 },
    threshold: { min: 0.80, max: 0.90 },
    max: { min: 0.90, max: 1.00 },
  };

  /**
   * Default speed-to-effort profiles per sport (m/s → effort 0-1).
   */
  const EFFORT_PROFILES = {
    Biking: {
      // Cycling: 0 m/s = rest, 4 m/s = easy, 7 m/s = moderate, 10+ m/s = hard
      speedBreakpoints: [0, 2, 4, 6, 8, 10, 12, 15],
      effortLevels: [0.0, 0.15, 0.30, 0.50, 0.65, 0.80, 0.90, 1.0],
    },
    Running: {
      // Running: 0 = rest, 2.5 m/s = easy jog, 3.5 = moderate, 4.5+ = fast
      speedBreakpoints: [0, 1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.5],
      effortLevels: [0.0, 0.20, 0.40, 0.55, 0.70, 0.82, 0.92, 1.0],
    },
    Walking: {
      // Walking: 0 = rest, 1.2 m/s = easy, 1.8 = brisk, 2.2+ = power walking
      speedBreakpoints: [0, 0.8, 1.2, 1.5, 1.8, 2.0, 2.2, 2.5],
      effortLevels: [0.0, 0.15, 0.30, 0.45, 0.55, 0.65, 0.75, 0.85],
    },
  };

  /**
   * Generate realistic heart rate data for trackpoints.
   * @param {Array} trackpoints - Input trackpoints (with speed data)
   * @param {Object} options - HR generation options
   * @returns {Array} Trackpoints with heartRateBpm populated
   */
  function generateHeartRate(trackpoints, options = {}) {
    const {
      sport = 'Biking',
      maxHR = 190,           // User's estimated max HR
      restingHR = 70,        // User's resting HR
      hrResponseDelay = 12,  // Seconds for HR to respond to effort change
      cardiacDrift = 0.03,   // 3% HR increase over duration (cardiac drift)
      hrvAmount = 0.5,       // Heart rate variability intensity (0-1)
    } = options;

    if (trackpoints.length === 0) return [];

    const hrRange = maxHR - restingHR;
    const effortProfile = EFFORT_PROFILES[sport] || EFFORT_PROFILES.Biking;

    // State variables for realistic HR simulation
    let currentHR = restingHR + hrRange * 0.1; // Start slightly above resting
    let targetHR = currentHR;
    const totalDuration = trackpoints.length; // rough seconds

    return trackpoints.map((tp, i) => {
      const speed = tp.speed || 0;

      // 1. Calculate target HR from current speed/effort
      const effort = speedToEffort(speed, effortProfile);
      const baseTargetHR = restingHR + hrRange * effortToHRFraction(effort);

      // 2. Apply cardiac drift (HR gradually increases over time)
      const driftFactor = 1 + (cardiacDrift * (i / totalDuration));
      targetHR = baseTargetHR * driftFactor;

      // 3. Smooth HR transition (HR doesn't change instantly)
      const responseRate = 1 / hrResponseDelay; // How fast HR approaches target
      if (targetHR > currentHR) {
        // HR increases faster with high effort
        currentHR += (targetHR - currentHR) * responseRate * (0.8 + effort * 0.4);
      } else {
        // HR decreases slower (recovery is gradual)
        currentHR += (targetHR - currentHR) * responseRate * 0.5;
      }

      // 4. Apply HRV (beat-to-beat variability)
      const hrv = generateHRV(i, hrvAmount, effort);

      // 5. Clamp and round
      const finalHR = Math.round(
        Math.min(maxHR, Math.max(restingHR - 5, currentHR + hrv))
      );

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        heartRateBpm: finalHR,
      };
    });
  }

  /**
   * Convert speed to effort level (0-1) using sport-specific profile.
   */
    /**
   * Scale heart rate data to achieve a specific average BPM while maintaining realistic variability.
   * @param {Array} trackpoints
   * @param {number} targetAvgBpm
   */
  function scaleToTargetHR(trackpoints, targetAvgBpm, targetMaxBpm) {
    if (trackpoints.length === 0 || !targetAvgBpm) return trackpoints;
    
    // Calculate current average
    const hrPoints = trackpoints.filter(tp => tp.heartRateBpm !== null && tp.heartRateBpm !== undefined);
    if (hrPoints.length === 0) return trackpoints;
    
    let sum = 0;
    for (const tp of hrPoints) sum += tp.heartRateBpm;
    const currentAvg = sum / hrPoints.length;
    
    if (currentAvg === 0) return trackpoints;
    
    const diff = targetAvgBpm - currentAvg;
    
    return trackpoints.map(tp => {
      if (tp.heartRateBpm === null || tp.heartRateBpm === undefined) {
        return { ...tp, position: tp.position ? { ...tp.position } : null };
      }
      
      // We apply the difference but keep it within realistic bounds (40 - 220)
      const maxAllowed = targetMaxBpm || 220;
        const scaled = Math.round(Math.max(40, Math.min(maxAllowed, tp.heartRateBpm + diff)));
      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        heartRateBpm: scaled
      };
    });
  }

  function speedToEffort(speed, profile) {
    const { speedBreakpoints, effortLevels } = profile;

    if (speed <= speedBreakpoints[0]) return effortLevels[0];
    if (speed >= speedBreakpoints[speedBreakpoints.length - 1]) {
      return effortLevels[effortLevels.length - 1];
    }

    // Linear interpolation between breakpoints
    for (let i = 1; i < speedBreakpoints.length; i++) {
      if (speed <= speedBreakpoints[i]) {
        const fraction = (speed - speedBreakpoints[i - 1]) /
          (speedBreakpoints[i] - speedBreakpoints[i - 1]);
        return effortLevels[i - 1] + fraction * (effortLevels[i] - effortLevels[i - 1]);
      }
    }

    return effortLevels[effortLevels.length - 1];
  }

  /**
   * Convert effort (0-1) to HR fraction (0-1 of HR range).
   * Uses a slight exponential curve because HR response isn't perfectly linear.
   */
  function effortToHRFraction(effort) {
    // Slightly exponential: low effort = lower HR than linear, high effort = higher
    return 0.1 + 0.9 * Math.pow(effort, 1.15);
  }

  /**
   * Generate heart rate variability component.
   * At rest, HRV is higher. During intense effort, HRV decreases.
   * @param {number} index - Trackpoint index
   * @param {number} amount - HRV intensity (0-1)
   * @param {number} effort - Current effort level (0-1)
   * @returns {number} HR deviation in BPM
   */
  function generateHRV(index, amount, effort) {
    // HRV decreases with higher effort (physiologically accurate)
    const hrvScale = amount * (1.5 - effort) * 2; // Max ~3 BPM at rest, ~1 BPM at max effort

    // Multi-frequency oscillation (respiratory sinus arrhythmia + random)
    const respiratory = Math.sin(index / 4 * Math.PI * 2) * hrvScale * 0.5; // ~4 sec breathing cycle
    const randomBeat = (Math.random() - 0.5) * hrvScale * 0.8;

    return respiratory + randomBeat;
  }

  // Public API
  return {
    generateHeartRate,
    scaleToTargetHR,
    HR_ZONES,
    EFFORT_PROFILES,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HeartRateEngine;
}

