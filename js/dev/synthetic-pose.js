// Generator pose sintetis (tampak samping) untuk pengujian otomatis dan mode demo (?mock=1).
// BUKAN pengganti uji nyata dengan kamera; hanya menguji logika hitung & tampilan.

const W = 640, H = 480;

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Buat 33 landmark ternormalisasi untuk squat tampak samping.
 * @param {number} kneeAngle sudut lutut (derajat), 175 = berdiri
 * @param {object} o opsi: facing ('right'|'left'), noise (px), rand, frontView, lean (tambahan derajat), heelLift (px), footShift (px)
 */
export function squatPose(kneeAngle, o = {}) {
  const dir = o.facing === 'left' ? -1 : 1;
  const rand = o.rand || Math.random;
  const noise = o.noise ?? 0;
  const n = () => (rand() - 0.5) * 2 * noise;
  const rad = (d) => (d * Math.PI) / 180;

  const bend = Math.max(0, 180 - kneeAngle);
  const shin = 100, thigh = 105, torso = 120;
  const s = rad(bend * 0.4); // tibia condong ke depan
  const phi = rad(bend * 0.6); // paha condong ke belakang
  const lean = rad(bend * 0.35 + (o.lean || 0));

  const ankle = { x: 300 + (o.footShift || 0), y: 420 };
  const knee = { x: ankle.x + dir * shin * Math.sin(s), y: ankle.y - shin * Math.cos(s) };
  const hip = { x: knee.x - dir * thigh * Math.sin(phi), y: knee.y - thigh * Math.cos(phi) };
  const shoulder = { x: hip.x + dir * torso * Math.sin(lean), y: hip.y - torso * Math.cos(lean) };
  const head = { x: shoulder.x + dir * 12, y: shoulder.y - 45 };
  const elbow = { x: shoulder.x + dir * 50, y: shoulder.y + 30 };
  const wrist = { x: elbow.x + dir * 55, y: elbow.y - 5 };
  const heel = { x: ankle.x - dir * 15, y: ankle.y + 12 - (o.heelLift || 0) };
  const foot = { x: ankle.x + dir * 45, y: ankle.y + 15 };

  // Sisi dekat (terlihat jelas) dan sisi jauh (sedikit bergeser, visibilitas rendah).
  const near = dir === 1 ? 'right' : 'left';
  const spread = o.frontView ? 110 : 6; // frontView: bahu/pinggul melebar seperti menghadap kamera
  const pts = new Array(33);
  const put = (i, p, vis, dx = 0) => {
    pts[i] = { x: (p.x + dx + n()) / W, y: (p.y + n()) / H, z: 0, visibility: vis };
  };
  for (let i = 0; i <= 10; i++) put(i, { x: head.x + ((i % 3) - 1) * 6, y: head.y + (i > 8 ? 18 : 0) }, 0.95);
  const pairs = [
    [11, 12, shoulder], [13, 14, elbow], [15, 16, wrist], [17, 18, wrist], [19, 20, wrist], [21, 22, wrist],
    [23, 24, hip], [25, 26, knee], [27, 28, ankle], [29, 30, heel], [31, 32, foot],
  ];
  for (const [l, r, p] of pairs) {
    const nearIdx = near === 'left' ? l : r;
    const farIdx = near === 'left' ? r : l;
    put(nearIdx, p, 0.97);
    put(farIdx, p, o.frontView ? 0.95 : 0.6, -dir * spread * (o.frontView ? 0.5 : 1));
    if (o.frontView) put(nearIdx, p, 0.97, dir * spread * 0.5);
  }
  return pts;
}

/**
 * Lintasan sudut lutut untuk satu repetisi: berdiri → turun → bawah → naik → berdiri.
 * @param {number} u fase 0..1
 * @param {number} minKnee sudut terdalam
 */
export function repKneeAngle(u, minKnee, standKnee = 175) {
  const k = (1 - Math.cos(2 * Math.PI * u)) / 2; // 0→1→0, halus
  return standKnee - (standKnee - minKnee) * k;
}

/** Hasilkan urutan frame {landmarks,width,height,t} untuk serangkaian repetisi. */
export function squatSequence({ reps = 5, minKnee = 80, repMs = 2000, restMs = 600, fps = 30, noise = 2, seed = 1, ...o } = {}) {
  const rand = seededRandom(seed);
  const frames = [];
  const dt = 1000 / fps;
  let t = 0;
  const pushStand = (ms) => {
    for (let x = 0; x < ms; x += dt) {
      frames.push({ landmarks: squatPose(175, { ...o, noise, rand }), width: W, height: H, t });
      t += dt;
    }
  };
  pushStand(restMs);
  for (let r = 0; r < reps; r++) {
    const mk = Array.isArray(minKnee) ? minKnee[r] : minKnee;
    for (let x = 0; x < repMs; x += dt) {
      const ang = repKneeAngle(x / repMs, mk);
      frames.push({ landmarks: squatPose(ang, { ...o, noise, rand }), width: W, height: H, t });
      t += dt;
    }
    pushStand(restMs);
  }
  return frames;
}

/** Detektor palsu untuk mode demo di browser: meniru antarmuka PoseDetector. */
export class MockPoseDetector {
  constructor() {
    this.delegate = 'MOCK';
    this.start = null;
  }
  async init() {}
  detect(_source, tMs) {
    if (this.start === null) this.start = tMs;
    const el = tMs - this.start;
    const cycle = 2600;
    const u = (el % cycle) / cycle;
    const repIdx = Math.floor(el / cycle);
    // tiap repetisi ke-4 sengaja dangkal untuk memperlihatkan peringatan
    const minKnee = repIdx % 4 === 3 ? 128 : 82;
    const ang = u < 0.8 ? repKneeAngle(u / 0.8, minKnee) : 175;
    return { landmarks: squatPose(ang, { noise: 1.5 }) };
  }
  close() {}
}

export const MOCK_SIZE = { width: W, height: H };
