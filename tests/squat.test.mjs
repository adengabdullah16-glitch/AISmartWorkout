// Jalankan: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDeg, OneEuroFilter, LandmarkSmoother } from '../js/geometry.js';
import { SquatAnalyzer } from '../js/exercises/squat.js';
import { squatSequence, squatPose } from '../js/dev/synthetic-pose.js';

function run(frames, { smooth = true } = {}) {
  const a = new SquatAnalyzer();
  const sm = new LandmarkSmoother();
  const events = [];
  let last;
  for (const f of frames) {
    const lm = smooth && f.landmarks ? sm.smooth(f.landmarks, f.t) : f.landmarks;
    last = a.update({ ...f, landmarks: lm });
    events.push(...last.events);
  }
  return { a, last, events };
}

test('angleDeg: sudut siku-siku dan lurus', () => {
  assert.equal(Math.round(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })), 90);
  assert.equal(Math.round(angleDeg({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })), 180);
  assert.ok(Number.isNaN(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })));
});

test('generator sintetis menghasilkan sudut lutut yang diminta', () => {
  for (const target of [175, 140, 100, 80]) {
    const p = squatPose(target, { noise: 0 });
    const px = (i) => ({ x: p[i].x * 640, y: p[i].y * 480 });
    const knee = angleDeg(px(24), px(26), px(28)); // pinggul-lutut-pergelangan kaki, sisi kanan (dekat)
    assert.ok(Math.abs(knee - target) < 1.5, `target ${target}, dapat ${knee}`);
  }
});

test('OneEuroFilter meredam noise saat diam', () => {
  const f = new OneEuroFilter({ minCutoff: 1.2, beta: 0.6, dCutoff: 1 });
  let maxDev = 0;
  for (let i = 0; i < 300; i++) {
    const noisy = 0.5 + (i % 2 ? 0.01 : -0.01);
    const y = f.filter(noisy, i * 33);
    if (i > 30) maxDev = Math.max(maxDev, Math.abs(y - 0.5));
  }
  assert.ok(maxDev < 0.006, `deviasi ${maxDev}`);
});

test('5 squat penuh → tepat 5 repetisi', () => {
  const { a, events } = run(squatSequence({ reps: 5, minKnee: 80 }));
  assert.equal(a.reps, 5);
  assert.equal(events.filter((e) => e.type === 'rep').length, 5);
  assert.equal(a.stats.goodReps, 5);
});

test('menghadap kiri juga terhitung', () => {
  const { a } = run(squatSequence({ reps: 3, minKnee: 85, facing: 'left' }));
  assert.equal(a.reps, 3);
});

test('squat dangkal tidak dihitung dan memicu peringatan', () => {
  const { a, events } = run(squatSequence({ reps: 3, minKnee: 125 }));
  assert.equal(a.reps, 0);
  assert.equal(events.filter((e) => e.type === 'shallow').length, 3);
  assert.ok(events.some((e) => e.type === 'shallow_warning'));
});

test('campuran dalam & dangkal', () => {
  const { a } = run(squatSequence({ reps: 4, minKnee: [80, 125, 90, 130] }));
  assert.equal(a.reps, 2);
  assert.equal(a.stats.shallow, 2);
});

test('goyang di sekitar ambang bawah tidak double count', () => {
  const frames = [];
  let t = 0;
  const push = (ang) => { frames.push({ landmarks: squatPose(ang, { noise: 0 }), width: 640, height: 480, t }); t += 33; };
  for (let i = 0; i < 20; i++) push(175);
  for (let ang = 175; ang >= 95; ang -= 4) push(ang);
  // osilasi 95..125 berkali-kali tanpa berdiri
  for (let k = 0; k < 6; k++) {
    for (let ang = 95; ang <= 125; ang += 5) push(ang);
    for (let ang = 125; ang >= 95; ang -= 5) push(ang);
  }
  for (let ang = 95; ang <= 175; ang += 4) push(ang);
  for (let i = 0; i < 20; i++) push(175);
  const { a } = run(frames, { smooth: false });
  assert.equal(a.reps, 1);
});

test('noise besar tetap tidak double count', () => {
  const { a } = run(squatSequence({ reps: 6, minKnee: 85, noise: 6, seed: 42 }));
  assert.equal(a.reps, 6);
});

test('tampak depan → wrong_view, tidak menghitung', () => {
  const { a, last } = run(squatSequence({ reps: 3, minKnee: 80, frontView: true }));
  assert.equal(a.reps, 0);
  assert.equal(last.issue, 'wrong_view');
});

test('tracking hilang di tengah repetisi → dibatalkan, wajib berdiri lagi', () => {
  const frames = squatSequence({ reps: 1, minKnee: 80, restMs: 600 });
  // hapus pose ~1 detik di sekitar posisi bawah
  const mid = Math.floor(frames.length / 2);
  for (let i = mid - 15; i < mid + 15; i++) frames[i] = { ...frames[i], landmarks: null };
  const { a, events } = run(frames);
  assert.equal(a.reps, 0);
  assert.ok(events.some((e) => e.type === 'aborted'));
});

test('visibilitas rendah → body_not_visible', () => {
  const p = squatPose(175, { noise: 0 });
  p[26].visibility = 0.2; p[25].visibility = 0.2;
  const r = new SquatAnalyzer().update({ landmarks: p, width: 640, height: 480, t: 0 });
  assert.equal(r.valid, false);
  assert.equal(r.issue, 'body_not_visible');
});

test('badan terlalu condong ditandai lean', () => {
  const { a, events } = run(squatSequence({ reps: 2, minKnee: 80, lean: 30 }));
  assert.equal(a.reps, 2);
  assert.ok(events.filter((e) => e.type === 'rep').every((e) => e.flags.includes('lean')));
  assert.equal(a.stats.goodReps, 0);
});

test('squat normal tidak ditandai lean/heel/unstable', () => {
  const { events } = run(squatSequence({ reps: 3, minKnee: 80, noise: 3 }));
  for (const e of events.filter((e) => e.type === 'rep')) assert.deepEqual(e.flags, []);
});

test('repetisi terlalu cepat (<500 ms) tidak dihitung', () => {
  const { a } = run(squatSequence({ reps: 3, minKnee: 80, repMs: 350 }), { smooth: false });
  assert.equal(a.reps, 0);
});

test('rearm (pause/resume) mewajibkan berdiri sebelum menghitung', () => {
  const a = new SquatAnalyzer();
  for (const f of squatSequence({ reps: 1, minKnee: 80 })) a.update(f);
  assert.equal(a.reps, 1);
  a.rearm();
  assert.equal(a.state, 'NEED_STAND');
});
