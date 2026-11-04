// Menggambar skeleton di atas video. Canvas berukuran sama dengan frame video;
// mirroring kamera depan dilakukan via CSS pada video & canvas sekaligus.

import { LM, toPx, visibilityOf } from './geometry.js';

// Koneksi tubuh (tanpa detail wajah agar tampilan bersih).
const CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

const ACTIVE = {
  left: new Set(['11-23', '23-25', '25-27']),
  right: new Set(['12-24', '24-26', '26-28']),
};

export class SkeletonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = { accent: '#C8FF3D', warn: '#FFB23D', base: 'rgba(255,255,255,0.75)', dim: 'rgba(255,255,255,0.25)' };
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * @param {Array|null} landmarks ternormalisasi
   * @param {{side?:string, valid?:boolean, warn?:boolean, angle?:{value:number, at:number, from:number, to:number}, mirrored?:boolean, background?:boolean}} o
   */
  draw(landmarks, o = {}) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    this.clear();
    if (o.background) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, w, h);
    }
    if (!landmarks) return;

    const s = Math.max(w, h) / 640;
    const P = (i) => toPx(landmarks[i], w, h);
    const active = o.valid && o.side ? ACTIVE[o.side] : null;
    const hi = o.warn ? this.colors.warn : this.colors.accent;

    ctx.lineCap = 'round';
    for (const [a, b] of CONNECTIONS) {
      const va = visibilityOf(landmarks[a]), vb = visibilityOf(landmarks[b]);
      if (va < 0.3 || vb < 0.3) continue;
      const key = `${a}-${b}`;
      const isActive = active?.has(key);
      ctx.strokeStyle = isActive ? hi : (Math.min(va, vb) > 0.6 ? this.colors.base : this.colors.dim);
      ctx.lineWidth = (isActive ? 6 : 3.5) * s;
      const pa = P(a), pb = P(b);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    for (const i of JOINTS) {
      const v = visibilityOf(landmarks[i]);
      if (v < 0.3) continue;
      const p = P(i);
      ctx.fillStyle = v > 0.6 ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, (i === LM.NOSE ? 5 : 4.5) * s, 0, Math.PI * 2);
      ctx.fill();
    }

    if (o.angle && Number.isFinite(o.angle.value)) this._drawAngle(landmarks, o.angle, hi, s, o.mirrored);
  }

  _drawAngle(landmarks, { value, at, from, to }, color, s, mirrored) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    const c = toPx(landmarks[at], w, h);
    const a = toPx(landmarks[from], w, h);
    const b = toPx(landmarks[to], w, h);
    const a1 = Math.atan2(a.y - c.y, a.x - c.x);
    const a2 = Math.atan2(b.y - c.y, b.x - c.x);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 26 * s, a1, a1 + diff, diff < 0);
    ctx.stroke();

    // Label sudut; dibalik ulang saat mirror supaya teks tetap terbaca.
    const label = `${Math.round(value)}°`;
    const mid = a1 + diff / 2;
    const lx = c.x - Math.cos(mid) * 48 * s;
    const ly = c.y - Math.sin(mid) * 48 * s;
    ctx.save();
    ctx.translate(lx, ly);
    if (mirrored) ctx.scale(-1, 1);
    ctx.font = `700 ${18 * s}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 14 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-tw / 2, -14 * s, tw, 28 * s, 8 * s) : ctx.rect(-tw / 2, -14 * s, tw, 28 * s);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 1 * s);
    ctx.restore();
  }
}
