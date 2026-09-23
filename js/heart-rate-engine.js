/**
 * Heart Rate Engine Module
 * Generates realistic heart rate data correlated with activity speed, effort, and sport type.
 *
 * Physiology model:
 * - HR responds to effort with a delay (15-30s up, 30-60s down)
 * - HR drifts upward over time (cardiac drift 5-8%)
 * - HR drops during stops but not instantly
 * - HR has natural beat-to-beat variability (HRV) that decreases at high effort
 * - Micro-spikes simulate sudden efforts (hills, surges)
 * - Different zones correlate with speed/effort levels
 */

const HeartRateEngine = (() => {
  'use strict';

  const HR_ZONES = {
    rest: { min: 0.50, max: 0.60 },
    warmup: { min: 0.55, max: 0.65 },
    easy: { min: 0.60, max: 0.70 },
    aerobic: { min: 0.70, max: 0.80 },
    threshold: { min: 0.80, max: 0.90 },
    max: { min: 0.90, max: 1.00 },
  };

  const EFFORT_PROFILES = {
    Biking: {
      speedBreakpoints: [0, 2, 4, 6, 8, 10, 12, 15],
      effortLevels:     [0.0, 0.15, 0.30, 0.50, 0.65, 0.80, 0.90, 1.0],
    },
    Running: {
      speedBreakpoints: [0, 1.5, 2.5, 3.0, 3.5, 4.0, 4.5, 5.5],
      effortLevels:     [0.0, 0.20, 0.40, 0.55, 0.70, 0.82, 0.92, 1.0],
    },
    Walking: {
      speedBreakpoints: [0, 0.8, 1.2, 1.5, 1.8, 2.0, 2.2, 2.5],
      effortLevels:     [0.0, 0.15, 0.30, 0.45, 0.55, 0.65, 0.75, 0.85],
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
      maxHR = 190,
      restingHR = 70,
      hrResponseDelay = 20,  // seconds for HR to respond to effort increase
      hrRecoveryDelay = 45,  // seconds for HR to respond to effort decrease (slower)
      cardiacDrift = 0.06,   // 6% HR increase over duration
      hrvAmount = 0.6,
    } = options;

    if (trackpoints.length === 0) return [];

    const hrRange = maxHR - restingHR;
    const effortProfile = EFFORT_PROFILES[sport] || EFFORT_PROFILES.Biking;

    // State for realistic simulation
    let currentHR = restingHR + hrRange * 0.08;
    let smoothedEffort = 0;
    const totalDuration = trackpoints.length;

    // Pre-compute effort array for lookahead smoothing
    const efforts = trackpoints.map((tp, i) => {
      let speed = tp.speed || 0;
      let slope = 0;
      if (i > 0 && tp.altitudeMeters != null && trackpoints[i - 1].altitudeMeters != null) {
        const altDiff = tp.altitudeMeters - trackpoints[i - 1].altitudeMeters;
        const timeDiff = (new Date(tp.time).getTime() - new Date(trackpoints[i - 1].time).getTime()) / 1000;
        if (timeDiff > 0) {
          const dist = speed * timeDiff;
          if (dist > 0.5) slope = altDiff / dist;
        }
      }
      slope = Math.max(-0.15, Math.min(0.15, slope));
      
      let equivalentSpeed = speed;
      if (sport === 'Biking') {
        if (slope > 0) equivalentSpeed = speed * (1 + slope * 15);
        else if (slope < 0) equivalentSpeed = speed * (1 + slope * 8);
      } else if (sport === 'Running') {
        if (slope > 0) equivalentSpeed = speed * (1 + slope * 8);
        else if (slope < 0) equivalentSpeed = speed * (1 + slope * 4);
      } else {
        if (slope > 0) equivalentSpeed = speed * (1 + slope * 5);
        else if (slope < 0) equivalentSpeed = speed * (1 + slope * 3);
      }
      return speedToEffort(equivalentSpeed, effortProfile);
    });

    // Generate random micro-spike positions (2-5% of trackpoints get a spike)
    const spikePositions = new Set();
    const spikeCount = Math.floor(totalDuration * (0.02 + Math.random() * 0.03));
    for (let s = 0; s < spikeCount; s++) {
      spikePositions.add(Math.floor(Math.random() * totalDuration));
    }

    // Gaussian random state (for correlated noise)
    let prevNoise = 0;

    return trackpoints.map((tp, i) => {
      const speed = tp.speed || 0;
      const effort = efforts[i];

      // Smooth the effort with a moving window to prevent jagged HR
      let windowEffort = effort;
      const windowSize = 8;
      let wSum = effort;
      let wCount = 1;
      for (let w = Math.max(0, i - windowSize); w < i; w++) {
        wSum += efforts[w];
        wCount++;
      }
      windowEffort = wSum / wCount;

      // Smooth effort transition (effort itself has inertia)
      const effortInertia = 0.85;
      smoothedEffort = smoothedEffort * effortInertia + windowEffort * (1 - effortInertia);

      // Target HR from smoothed effort
      const baseTargetHR = restingHR + hrRange * effortToHRFraction(smoothedEffort);

      // Cardiac drift: HR gradually increases (5-8% over the full duration)
      const progress = i / totalDuration;
      const driftMultiplier = 1 + (cardiacDrift * progress);
      const targetHR = baseTargetHR * driftMultiplier;

      // HR response with asymmetric delay (rises faster than it falls)
      if (targetHR > currentHR) {
        const riseRate = 1 / hrResponseDelay;
        const effortBoost = 0.6 + smoothedEffort * 0.6;
        currentHR += (targetHR - currentHR) * riseRate * effortBoost;
      } else {
        const fallRate = 1 / hrRecoveryDelay;
        const recoverySpeed = 0.3 + (1 - smoothedEffort) * 0.4;
        currentHR += (targetHR - currentHR) * fallRate * recoverySpeed;
      }

      // HRV (decreases at high effort, as per physiology)
      const hrv = generateHRV(i, hrvAmount, smoothedEffort, prevNoise);
      prevNoise = hrv * 0.3;

      // Micro-spikes (sudden 5-12 bpm jumps simulating surges/hills)
      let spike = 0;
      if (spikePositions.has(i) && speed > 0.5) {
        spike = 5 + Math.random() * 7;
        // Spread the spike over a few trackpoints
        for (let s = 1; s <= 3 && i + s < totalDuration; s++) {
          spikePositions.add(i + s);
        }
      }
      // Spike decay
      if (spikePositions.has(i) && !spikePositions.has(i - 4)) {
        spike *= 0.3;
      }

      // Add a continuous micro-jitter to prevent perfect integer quantization flatlines
      const microJitter = (Math.random() - 0.5) * 1.5;

      const rawHR = currentHR + hrv + spike + microJitter;
      let finalHR = Math.round(
        Math.min(maxHR, Math.max(restingHR - 5, rawHR))
      );
      
      // If clamped to maxHR, occasionally dip by 1 bpm so it's not a perfectly flat line
      if (finalHR >= maxHR && Math.random() < 0.3) {
        finalHR -= 1;
      }

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        heartRateBpm: finalHR,
      };
    });
  }

  /**
   * Scale heart rate data to achieve a specific average BPM.
   */
  function scaleToTargetHR(trackpoints, targetAvgBpm, targetMaxBpm) {
    if (trackpoints.length === 0 || !targetAvgBpm) return trackpoints;

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
   * Convert effort (0-1) to HR fraction.
   * Non-linear: low effort produces proportionally lower HR.
   */
  function effortToHRFraction(effort) {
    return 0.08 + 0.92 * Math.pow(effort, 1.2);
  }

  /**
   * Generate HRV with correlated noise and respiratory sinus arrhythmia.
   * At rest, HRV is 3-8 bpm. At max effort, HRV drops to 1-2 bpm.
   */
  function generateHRV(index, amount, effort, prevNoise) {
    // HRV amplitude decreases with effort
    const baseAmplitude = amount * (2.0 - effort * 1.3);

    // Respiratory sinus arrhythmia (~15 breaths/min at rest, ~30 at max effort)
    const breathRate = 15 + effort * 20;
    const breathPeriod = 60 / breathRate; // seconds per breath
    const respiratory = Math.sin(index / breathPeriod * Math.PI * 2) * baseAmplitude * 0.6;

    // Random component with temporal correlation
    const random = (Math.random() - 0.5) * baseAmplitude * 0.8;
    const correlated = random * 0.6 + prevNoise * 0.4;

    // Very occasional larger fluctuation (autonomic nervous system)
    let autonomic = 0;
    if (Math.random() < 0.02) {
      autonomic = (Math.random() - 0.5) * baseAmplitude * 2.5;
    }

    return respiratory + correlated + autonomic;
  }

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
