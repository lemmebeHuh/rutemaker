/**
 * Power Engine Module
 * Generates realistic cycling/running power data (Watts) correlated with
 * speed, gradient, cadence, and rider weight.
 *
 * Cycling power model (simplified):
 *   P = F_aero + F_rolling + F_gravity
 *   F_aero = 0.5 * CdA * rho * v^2 * v
 *   F_rolling = Crr * m * g * v
 *   F_gravity = m * g * slope * v
 *
 * Running power model (simplified, Stryd-like):
 *   P ≈ k * mass * speed (with terrain and efficiency factors)
 */

const PowerEngine = (() => {
  'use strict';

  const DEFAULTS = {
    Biking: {
      riderMassKg: 72,
      bikeMassKg: 9,
      CdA: 0.32,           // drag coefficient * frontal area (road bike, hoods)
      Crr: 0.004,          // rolling resistance (road tire)
      rho: 1.2,            // air density kg/m³
      drivetrainLoss: 0.03, // 3% drivetrain loss
      minWatts: 30,
      maxWatts: 500,
    },
    Running: {
      massKg: 72,
      runningEconomy: 1.04, // kcal/kg/km (typical recreational)
      efficiencyFactor: 0.25,
      minWatts: 100,
      maxWatts: 600,
    },
  };

  /**
   * Generate power for every trackpoint.
   * @param {Array} trackpoints
   * @param {Object} options
   * @returns {Array} trackpoints with power populated
   */
  function generatePower(trackpoints, options = {}) {
    const {
      sport = 'Biking',
      targetAvgPower = null,
      riderMassKg = 72,
    } = options;

    if (trackpoints.length === 0) return [];

    const generator = sport === 'Biking' ? generateCyclingPower : generateRunningPower;
    const result = generator(trackpoints, { ...options, riderMassKg });

    if (targetAvgPower && targetAvgPower > 0) {
      return scaleToTargetPower(result, targetAvgPower, sport);
    }

    return result;
  }

  function generateCyclingPower(trackpoints, options = {}) {
    const cfg = { ...DEFAULTS.Biking, ...options };
    const totalMass = cfg.riderMassKg + (cfg.bikeMassKg || 9);
    const g = 9.81;
    let smoothedPower = 100;

    return trackpoints.map((tp, i) => {
      const speed = tp.speed || 0; // m/s

      if (speed < 0.5) {
        smoothedPower *= 0.6;
        if (smoothedPower < 5) smoothedPower = 0;
        return { ...tp, position: tp.position ? { ...tp.position } : null, power: 0 };
      }

      // Estimate slope from altitude changes
      let slope = 0;
      if (i > 0 && tp.altitudeMeters != null && trackpoints[i - 1].altitudeMeters != null) {
        const altDiff = tp.altitudeMeters - trackpoints[i - 1].altitudeMeters;
        const timeDiff = (new Date(tp.time).getTime() - new Date(trackpoints[i - 1].time).getTime()) / 1000;
        const dist = speed * timeDiff;
        if (dist > 0.5) slope = altDiff / dist;
        slope = Math.max(-0.2, Math.min(0.2, slope));
      }

      // Physics-based power
      const P_aero = 0.5 * cfg.CdA * cfg.rho * Math.pow(speed, 3);
      const P_rolling = cfg.Crr * totalMass * g * speed;
      const P_gravity = totalMass * g * slope * speed;
      let rawPower = (P_aero + P_rolling + P_gravity) / (1 - cfg.drivetrainLoss);

      // Clamp negative (downhill freewheeling) to near-zero with some pedaling
      if (rawPower < 0) rawPower = 20 + Math.random() * 30;

      // Natural variance
      const noise = (Math.random() - 0.5) * rawPower * 0.12;
      const pedalStroke = Math.sin(i * 0.8) * rawPower * 0.04;
      rawPower += noise + pedalStroke;

      // Smooth transition
      smoothedPower = smoothedPower * 0.6 + rawPower * 0.4;
      const clamped = Math.round(Math.max(cfg.minWatts, Math.min(cfg.maxWatts, smoothedPower)));

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        power: clamped,
      };
    });
  }

  function generateRunningPower(trackpoints, options = {}) {
    const cfg = { ...DEFAULTS.Running, ...options };
    const g = 9.81;
    let smoothedPower = 200;

    return trackpoints.map((tp, i) => {
      const speed = tp.speed || 0;

      if (speed < 0.3) {
        smoothedPower *= 0.5;
        if (smoothedPower < 10) smoothedPower = 0;
        return { ...tp, position: tp.position ? { ...tp.position } : null, power: 0 };
      }

      let slope = 0;
      if (i > 0 && tp.altitudeMeters != null && trackpoints[i - 1].altitudeMeters != null) {
        const altDiff = tp.altitudeMeters - trackpoints[i - 1].altitudeMeters;
        const timeDiff = (new Date(tp.time).getTime() - new Date(trackpoints[i - 1].time).getTime()) / 1000;
        const dist = speed * timeDiff;
        if (dist > 0.5) slope = altDiff / dist;
        slope = Math.max(-0.15, Math.min(0.15, slope));
      }

      // Stryd-like running power model
      // Horizontal: P_h = mass * speed * cost_of_transport
      const costOfTransport = 0.98 + 0.052 * speed; // J/(kg*m) increases with speed
      let rawPower = cfg.massKg * speed * costOfTransport;

      // Vertical component
      if (slope > 0.005) {
        rawPower += cfg.massKg * g * slope * speed * 0.5;
      } else if (slope < -0.005) {
        rawPower += cfg.massKg * g * slope * speed * 0.15; // downhill reduces power less
      }

      // Variance
      const noise = (Math.random() - 0.5) * rawPower * 0.08;
      const footStrike = Math.sin(i * 1.2) * rawPower * 0.03;
      rawPower += noise + footStrike;

      smoothedPower = smoothedPower * 0.55 + rawPower * 0.45;
      const clamped = Math.round(Math.max(cfg.minWatts, Math.min(cfg.maxWatts, smoothedPower)));

      return {
        ...tp,
        position: tp.position ? { ...tp.position } : null,
        power: clamped,
      };
    });
  }

  function scaleToTargetPower(trackpoints, targetAvg, sport) {
    const moving = trackpoints.filter(tp => tp.power > 0);
    if (moving.length === 0) return trackpoints;

    let sum = 0;
    for (const tp of moving) sum += tp.power;
    const currentAvg = sum / moving.length;
    if (currentAvg === 0) return trackpoints;

    const ratio = targetAvg / currentAvg;
    const limits = sport === 'Biking' ? DEFAULTS.Biking : DEFAULTS.Running;

    return trackpoints.map(tp => {
      if (tp.power === 0) return { ...tp, position: tp.position ? { ...tp.position } : null };
      const scaled = Math.round(Math.max(limits.minWatts, Math.min(limits.maxWatts, tp.power * ratio)));
      return { ...tp, position: tp.position ? { ...tp.position } : null, power: scaled };
    });
  }

  return {
    generatePower,
    DEFAULTS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PowerEngine;
}
