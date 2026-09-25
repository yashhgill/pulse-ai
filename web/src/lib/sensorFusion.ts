/**
 * PULSE SAFETY ENGINE — Sensor Fusion (prototype / sandbox)
 *
 * Production inputs: phone IMU (accelerometer + gyroscope), GPS speed,
 * wearable HR / SpO2 / motion via HealthKit or Health Connect.
 * Here the frames are synthesised so each scenario can be demoed on stage.
 * Nothing in this module contacts any emergency service.
 */
import type { FusionResult, ScenarioId, SensorFrame, SensorKey } from './types';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function baselineFrame(t: number, prev?: SensorFrame): SensorFrame {
  const hr = prev ? clamp(prev.hr + rnd(-1.2, 1.2), 64, 84) : 72;
  return {
    t,
    accel: 1 + rnd(-0.08, 0.08),
    gyro: rnd(0.02, 0.15),
    speed: prev ? clamp(prev.speed + rnd(-0.3, 0.3), 3, 5.5) : 4.2,
    hr,
    spo2: clamp((prev?.spo2 ?? 98) + rnd(-0.3, 0.3), 96.5, 99.5),
    motion: rnd(0.45, 0.65),
  };
}

export interface Scenario {
  id: ScenarioId;
  label: string;
  blurb: string;
  expect: string;
  /** mutate a frame given ms since incident start */
  shape: (f: SensorFrame, ms: number) => SensorFrame;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'fall',
    label: 'Fall at home',
    blurb: 'Free-fall dip, 4.8g impact, orientation flips, then no movement.',
    expect: 'High confidence → Nova check-in',
    shape: (f, ms) => {
      if (ms < 300) return { ...f, accel: 0.2, gyro: 3.5, motion: 0.9 };
      if (ms < 500) return { ...f, accel: 4.8, gyro: 6.2, motion: 1 };
      return { ...f, accel: 1 + rnd(-0.02, 0.02), gyro: 0.02, speed: 0, motion: 0.02, hr: Math.min(f.hr + 1.5, 112) };
    },
  },
  {
    id: 'crash',
    label: 'Vehicle collision',
    blurb: 'Travelling at 68 km/h, 9.4g deceleration, speed drops to zero.',
    expect: 'Very high confidence → Nova check-in',
    shape: (f, ms) => {
      if (ms < 0) return f;
      if (ms < 250) return { ...f, speed: 68, accel: 9.4, gyro: 7.8, motion: 1 };
      return { ...f, speed: 0, accel: 1, gyro: 0.03, motion: 0.03, hr: Math.min(f.hr + 2, 128) };
    },
  },
  {
    id: 'faint',
    label: 'Fainting (syncope)',
    blurb: 'Heart rate collapses to 41, SpO2 dips to 89%, soft 2.6g slump.',
    expect: 'High confidence (cardiac signal)',
    shape: (f, ms) => {
      if (ms < 400) return { ...f, hr: 48, spo2: 92, accel: 2.6, gyro: 2.4, motion: 0.6 };
      return { ...f, hr: 41, spo2: 89, accel: 1, gyro: 0.02, speed: 0, motion: 0.02 };
    },
  },
  {
    id: 'drop',
    label: 'Phone dropped',
    blurb: 'Sharp 5.2g spike on the phone, but the watch keeps moving and HR is flat.',
    expect: 'Low confidence → ignored (false alarm)',
    shape: (f, ms) => {
      if (ms < 200) return { ...f, accel: 5.2, gyro: 5.5 };
      return { ...f };
    },
  },
  {
    id: 'still',
    label: 'Long inactivity',
    blurb: 'No motion for an unusual period, vitals normal.',
    expect: 'Moderate → gentle check-in',
    shape: (f, ms) => ({ ...f, motion: 0.01, speed: 0, gyro: 0.01, accel: 1, hr: ms > 0 ? 66 : f.hr }),
  },
];

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)); }

/** Score a window of frames. Weights mirror the architecture doc. */
export function fuse(window: SensorFrame[]): FusionResult {
  if (window.length === 0) return { confidence: 0, incident: 'none', contributions: [] };
  const peakAccel = Math.max(...window.map(f => f.accel));
  const minAccel = Math.min(...window.map(f => f.accel));
  const peakGyro = Math.max(...window.map(f => f.gyro));
  const maxSpeed = Math.max(...window.map(f => f.speed));
  const tail = window.slice(-8);
  const stillAfter = tail.every(f => f.motion < 0.08);
  const endSpeed = tail[tail.length - 1].speed;
  const minHr = Math.min(...window.map(f => f.hr));
  const maxHr = Math.max(...window.map(f => f.hr));
  const minSpo2 = Math.min(...window.map(f => f.spo2));

  const c: FusionResult['contributions'] = [];
  const add = (key: SensorKey, label: string, weight: number) => c.push({ key, label, weight });

  if (peakAccel > 3.5) add('accel', `Impact ${peakAccel.toFixed(1)}g`, peakAccel > 8 ? 0.32 : 0.26);
  if (minAccel < 0.4) add('accel', 'Free-fall phase', 0.1);
  if (peakGyro > 4) add('gyro', `Rotation ${peakGyro.toFixed(1)} rad/s`, 0.12);
  if (stillAfter) add('motion', 'No movement after event', 0.24);
  if (stillAfter && peakAccel < 2) add('motion', 'Unusual inactivity for this time', 0.14);
  if (maxSpeed > 30 && endSpeed < 2) add('speed', `${Math.round(maxSpeed)}→0 km/h`, 0.22);
  if (minHr < 50) add('hr', `Bradycardia ${Math.round(minHr)} bpm`, 0.2);
  if (maxHr > 105) add('hr', `Tachycardia ${Math.round(maxHr)} bpm`, 0.08);
  if (minSpo2 < 91) add('spo2', `SpO₂ ${minSpo2.toFixed(0)}%`, 0.16);

  // Watch still moving while phone spikes = likely phone drop: veto
  const vetoed = peakAccel > 3.5 && !stillAfter && minHr > 55;
  let confidence = c.reduce((s, x) => s + x.weight, 0);
  if (vetoed) confidence *= 0.3;
  confidence = clamp(confidence, 0, 0.99);

  let incident: FusionResult['incident'] = 'none';
  if (confidence >= 0.3) {
    if (maxSpeed > 30 && endSpeed < 2) incident = 'crash';
    else if (minHr < 50 || minSpo2 < 91) incident = 'syncope';
    else if (peakAccel > 3.5) incident = 'fall';
    else if (stillAfter) incident = 'inactivity';
  }
  return { confidence, incident, contributions: c };
}

export const THRESHOLD_HIGH = 0.6;
export const THRESHOLD_LOW = 0.3;
