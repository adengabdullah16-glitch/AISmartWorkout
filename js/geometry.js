// Modul geometri & filter: murni (tanpa DOM) agar bisa diuji di Node.

import { SMOOTHING } from './config.js';

/** Index landmark MediaPipe Pose (33 titik). */
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT: 31, RIGHT_FOOT: 32,
};

/** Ubah landmark ternormalisasi (0..1) ke piksel. Penting: tanpa ini sudut
 *  menjadi salah karena lebar dan tinggi frame tidak sama. */
export function toPx(lm, width, height) {
  return { x: lm.x * width, y: lm.y * height };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Sudut di titik b (derajat, 0..180) yang dibentuk a-b-c. */
export function angleDeg(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return NaN;
  let cos = (v1x * v2x + v1y * v2y) / (n1 * n2);
  cos = Math.max(-1, Math.min(1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Sudut vektor from→to terhadap arah vertikal ke atas (derajat, 0..180). */
export function angleFromVertical(from, to) {
  return angleDeg({ x: from.x, y: from.y - 1 }, from, to);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function visibilityOf(lm) {
  return lm && typeof lm.visibility === 'number' ? lm.visibility : 0;
}

export function allVisible(landmarks, indices, threshold) {
  return indices.every((i) => visibilityOf(landmarks[i]) >= threshold);
}

export function meanVisibility(landmarks, indices) {
  if (!indices.length) return 0;
  return indices.reduce((s, i) => s + visibilityOf(landmarks[i]), 0) / indices.length;
}

export function inFrame(landmarks, indices, margin = 0) {
  return indices.every((i) => {
    const p = landmarks[i];
    return p && p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin;
  });
}

// ---------------------------------------------------------------------------
// One Euro Filter (Casiez dkk., 2012): halus saat diam, responsif saat bergerak.
// ---------------------------------------------------------------------------
function smoothingAlpha(cutoff, dtSec) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dtSec);
}

export class OneEuroFilter {
  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
  filter(x, tMs) {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    const dx = (x - this.xPrev) / dt;
    const aD = smoothingAlpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingAlpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}

/** Menghaluskan seluruh 33 landmark (x, y, z) dan visibilitas. */
export class LandmarkSmoother {
  constructor(opts = SMOOTHING) {
    this.opts = opts;
    this.filters = null;
    this.lastT = null;
  }
  reset() {
    this.filters = null;
    this.lastT = null;
  }
  smooth(landmarks, tMs) {
    if (!landmarks) return null;
    if (this.lastT !== null && tMs - this.lastT > this.opts.resetGapMs) this.reset();
    if (!this.filters) {
      this.filters = landmarks.map(() => ({
        x: new OneEuroFilter(this.opts),
        y: new OneEuroFilter(this.opts),
        z: new OneEuroFilter(this.opts),
        v: null,
      }));
    }
    this.lastT = tMs;
    return landmarks.map((p, i) => {
      const f = this.filters[i];
      const vis = visibilityOf(p);
      // Visibilitas di-EMA ringan supaya status tidak berkedip.
      f.v = f.v === null ? vis : f.v * 0.6 + vis * 0.4;
      return {
        x: f.x.filter(p.x, tMs),
        y: f.y.filter(p.y, tMs),
        z: f.z.filter(p.z ?? 0, tMs),
        visibility: f.v,
      };
    });
  }
}
