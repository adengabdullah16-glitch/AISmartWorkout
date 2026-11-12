// Generator pose sintetis (tampak samping) untuk pengujian otomatis dan mode demo (?mock=1).
// BUKAN pengganti uji nyata dengan kamera; hanya menguji logika hitung & tampilan.

const W = 640, H = 480;
const rad = (d) => (d * Math.PI) / 180;

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ubah titik-titik kerangka (piksel) menjadi 33 landmark MediaPipe ternormalisasi. */
function assemble(pt, o, dir) {
  const rand = o.rand || Math.random;
  const noise = o.noise ?? 0;
  const n = () => (rand() - 0.5) * 2 * noise;
  const near = dir === 1 ? 'right' : 'left';
  const spread = o.frontView ? 110 : 6; // frontView: kiri-kanan melebar seperti menghadap kamera
  const out = new Array(33);
  const put = (i, p, vis, dx = 0) => {
    out[i] = { x: (p.x + dx + n()) / W, y: (p.y + n()) / H, z: 0, visibility: vis };
  };
  for (let i = 0; i <= 10; i++) put(i, { x: pt.head.x + ((i % 3) - 1) * 6, y: pt.head.y + (i > 8 ? 18 : 0) }, 0.95);
  const pairs = [
    [11, 12, pt.shoulder], [13, 14, pt.elbow], [15, 16, pt.wrist], [17, 18, pt.wrist], [19, 20, pt.wrist],
    [21, 22, pt.wrist], [23, 24, pt.hip], [25, 26, pt.knee], [27, 28, pt.ankle], [29, 30, pt.heel], [31, 32, pt.foot],
  ];
  for (const [l, r, p] of pairs) {
    const nearIdx = near === 'left' ? l : r;
    const farIdx = near === 'left' ? r : l;
    put(nearIdx, p, 0.97);
    put(farIdx, p, o.frontView ? 0.95 : 0.6, -dir * spread * (o.frontView ? 0.5 : 1));
    if (o.frontView) put(nearIdx, p, 0.97, dir * spread * 0.5);
  }
  return out;
}

/**
 * Squat tampak samping.
 * @param {number} kneeAngle sudut lutut (derajat), 175 = berdiri
 * @param {object} o facing ('right'|'left'), noise (px), rand, frontView, lean (derajat tambahan), heelLift (px), footShift (px)
 */
export function squatPose(kneeAngle, o = {}) {
  const dir = o.facing === 'left' ? -1 : 1;
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
  return assemble({ head, shoulder, elbow, wrist, hip, knee, ankle, heel, foot }, o, dir);
}

/**
 * Push-up tampak samping (kepala ke arah `facing`).
 * @param {number} elbowAngle sudut siku, ~170 = lengan lurus
 * @param {object} o facing, noise, rand, frontView, hipOffset (px; + = pinggul turun, − = terlalu tinggi), handShift (px; tangan maju)
 */
export function pushupPose(elbowAngle, o = {}) {
  const dir = o.facing === 'left' ? -1 : 1;
  const a = 75, b = 70; // lengan atas, lengan bawah
  const floorY = 400, xs = dir === 1 ? 420 : 220; // seluruh tubuh tetap di dalam frame 640 px
  const hs = o.handShift || 0;
  const d = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(rad(elbowAngle)));
  const h = Math.sqrt(Math.max(d * d - hs * hs, 1));
  const wrist = { x: xs + dir * hs, y: floorY };
  const shoulder = { x: xs, y: floorY - h };
  // Siku = perpotongan lingkaran (bahu, a) dan (pergelangan, b), dipilih yang mengarah ke kaki.
  const dx = wrist.x - shoulder.x, dy = wrist.y - shoulder.y;
  const L = Math.hypot(dx, dy);
  const along = (a * a - b * b + L * L) / (2 * L);
  const off = Math.sqrt(Math.max(a * a - along * along, 0));
  const mx = shoulder.x + (dx * along) / L, my = shoulder.y + (dy * along) / L;
  const c1 = { x: mx + (-dy * off) / L, y: my + (dx * off) / L };
  const c2 = { x: mx - (-dy * off) / L, y: my - (dx * off) / L };
  const elbow = dir * c1.x < dir * c2.x ? c1 : c2;

  const ankle = { x: xs - dir * 300, y: floorY - 15 };
  const vx = ankle.x - shoulder.x, vy = ankle.y - shoulder.y;
  const vl = Math.hypot(vx, vy);
  let px = -vy / vl, py = vx / vl; // tegak lurus garis tubuh
  if (py < 0) { px = -px; py = -py; } // arahkan ke bawah (lantai)
  const off2 = o.hipOffset || 0;
  const hip = { x: shoulder.x + vx * 0.45 + px * off2, y: shoulder.y + vy * 0.45 + py * off2 };
  const knee = { x: shoulder.x + vx * 0.75 + px * off2 * 0.5, y: shoulder.y + vy * 0.75 + py * off2 * 0.5 };
  const head = { x: shoulder.x + dir * 38, y: shoulder.y + 4 };
  const heel = { x: ankle.x - dir * 12, y: ankle.y - 8 };
  const foot = { x: ankle.x - dir * 4, y: floorY + 5 };
  return assemble({ head, shoulder, elbow, wrist, hip, knee, ankle, heel, foot }, o, dir);
}

/**
 * Bicep curl tampak samping, berdiri.
 * @param {number} elbowAngle sudut siku, ~170 = lengan lurus ke bawah
 * @param {object} o facing, noise, rand, frontView, lean (derajat; badan berayun), elbowFwd (derajat; lengan atas maju)
 */
export function curlPose(elbowAngle, o = {}) {
  const dir = o.facing === 'left' ? -1 : 1;
  const lean = rad(o.lean || 0);
  const ef = rad(o.elbowFwd ?? 5);
  const hip = { x: 300, y: 285 };
  const knee = { x: 303, y: 370 };
  const ankle = { x: 300, y: 455 };
  const shoulder = { x: hip.x + dir * 120 * Math.sin(lean), y: hip.y - 120 * Math.cos(lean) };
  const elbow = { x: shoulder.x + dir * 80 * Math.sin(ef), y: shoulder.y + 80 * Math.cos(ef) };
  const alpha = ef + rad(180 - elbowAngle); // lengan bawah berputar ke depan lalu ke atas
  const wrist = { x: elbow.x + dir * 75 * Math.sin(alpha), y: elbow.y + 75 * Math.cos(alpha) };
  const head = { x: shoulder.x + dir * 12, y: shoulder.y - 50 };
  const heel = { x: ankle.x - dir * 12, y: ankle.y + 10 };
  const foot = { x: ankle.x + dir * 40, y: ankle.y + 12 };
  return assemble({ head, shoulder, elbow, wrist, hip, knee, ankle, heel, foot }, o, dir);
}

/**
 * Lintasan sudut untuk satu repetisi: lurus → menekuk → terdalam → lurus.
 * @param {number} u fase 0..1
 */
export function repAngle(u, minAngle, maxAngle = 175) {
  const k = (1 - Math.cos(2 * Math.PI * u)) / 2; // 0→1→0, halus
  return maxAngle - (maxAngle - minAngle) * k;
}
export const repKneeAngle = repAngle;

/**
 * Urutan frame {landmarks,width,height,t} untuk serangkaian repetisi.
 * poseFn(angle, opts, u) — u = fase dalam repetisi (−1 saat istirahat).
 */
export function sequence(poseFn, { reps = 5, minAngle = 80, maxAngle = 175, repMs = 2000, restMs = 600, fps = 30, noise = 2, seed = 1, perRep, ...o } = {}) {
  const rand = seededRandom(seed);
  const frames = [];
  const dt = 1000 / fps;
  let t = 0;
  const rest = (ms) => {
    for (let x = 0; x < ms; x += dt) {
      frames.push({ landmarks: poseFn(maxAngle, { ...o, noise, rand }, -1), width: W, height: H, t });
      t += dt;
    }
  };
  rest(restMs);
  for (let r = 0; r < reps; r++) {
    const mn = Array.isArray(minAngle) ? minAngle[r] : minAngle;
    const extra = perRep ? perRep(r) : {};
    for (let x = 0; x < repMs; x += dt) {
      const u = x / repMs;
      frames.push({ landmarks: poseFn(repAngle(u, mn, maxAngle), { ...o, ...extra, noise, rand }, u), width: W, height: H, t });
      t += dt;
    }
    rest(restMs);
  }
  return frames;
}

export function squatSequence({ minKnee = 80, ...o } = {}) {
  return sequence(squatPose, { minAngle: minKnee, maxAngle: 175, ...o });
}
export function pushupSequence(o = {}) {
  return sequence(pushupPose, { minAngle: 85, maxAngle: 170, ...o });
}
export function curlSequence(o = {}) {
  return sequence(curlPose, { minAngle: 45, maxAngle: 168, ...o });
}

const MOCK = {
  squat: { pose: squatPose, max: 175, deep: 82, shallow: 128 },
  pushup: { pose: pushupPose, max: 170, deep: 85, shallow: 122 },
  curl: { pose: curlPose, max: 168, deep: 45, shallow: 95 },
};

/** Detektor palsu untuk mode demo di browser: meniru antarmuka PoseDetector. */
export class MockPoseDetector {
  constructor(exerciseId = 'squat') {
    this.delegate = 'MOCK';
    this.model = null;
    this.m = MOCK[exerciseId] || MOCK.squat;
    this.start = null;
  }
  async init() {}
  detect(_source, tMs) {
    if (this.start === null) this.start = tMs;
    const el = tMs - this.start;
    const cycle = 2600;
    const u = (el % cycle) / cycle;
    const repIdx = Math.floor(el / cycle);
    // tiap repetisi ke-4 sengaja tidak penuh untuk memperlihatkan peringatan
    const minA = repIdx % 4 === 3 ? this.m.shallow : this.m.deep;
    const ang = u < 0.8 ? repAngle(u / 0.8, minA, this.m.max) : this.m.max;
    return { landmarks: this.m.pose(ang, { noise: 1.5 }) };
  }
  close() {}
}

export const MOCK_SIZE = { width: W, height: H };
