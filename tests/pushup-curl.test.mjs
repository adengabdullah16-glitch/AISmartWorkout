// Jalankan: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDeg, LandmarkSmoother } from '../js/geometry.js';
import { PushupAnalyzer } from '../js/exercises/pushup.js';
import { CurlAnalyzer } from '../js/exercises/curl.js';
import { pushupPose, curlPose, pushupSequence, curlSequence, squatPose } from '../js/dev/synthetic-pose.js';

function run(Analyzer, frames, { smooth = true } = {}) {
  const a = new Analyzer();
  const sm = new LandmarkSmoother();
  const events = [];
  let last;
  const issues = new Set();
  for (const f of frames) {
    const lm = smooth && f.landmarks ? sm.smooth(f.landmarks, f.t) : f.landmarks;
    last = a.update({ ...f, landmarks: lm });
    events.push(...last.events);
    if (last.issue) issues.add(last.issue);
  }
  return { a, last, events, issues, reps: events.filter((e) => e.type === 'rep') };
}
const px = (p, i) => ({ x: p[i].x * 640, y: p[i].y * 480 });

// ------------------------------- generator -------------------------------
test('generator push-up & curl menghasilkan sudut siku yang diminta', () => {
  for (const target of [170, 130, 100, 85]) {
    const p = pushupPose(target, { noise: 0 });
    const e = angleDeg(px(p, 12), px(p, 14), px(p, 16));
    assert.ok(Math.abs(e - target) < 1.5, `push-up target ${target}, dapat ${e}`);
  }
  for (const target of [168, 120, 65, 45]) {
    const p = curlPose(target, { noise: 0 });
    const e = angleDeg(px(p, 12), px(p, 14), px(p, 16));
    assert.ok(Math.abs(e - target) < 1.5, `curl target ${target}, dapat ${e}`);
  }
});

// ------------------------------- PUSH-UP -------------------------------
test('push-up: 5 repetisi penuh → tepat 5, tanpa peringatan', () => {
  const { a, reps } = run(PushupAnalyzer, pushupSequence({ reps: 5 }));
  assert.equal(a.reps, 5);
  for (const r of reps) assert.deepEqual(r.flags, []);
  assert.equal(a.stats.goodReps, 5);
});

test('push-up: menghadap kiri juga terhitung', () => {
  const { a } = run(PushupAnalyzer, pushupSequence({ reps: 3, facing: 'left' }));
  assert.equal(a.reps, 3);
});

test('push-up: setengah turun tidak dihitung', () => {
  const { a, events } = run(PushupAnalyzer, pushupSequence({ reps: 3, minAngle: 122 }));
  assert.equal(a.reps, 0);
  assert.equal(events.filter((e) => e.type === 'shallow').length, 3);
});

test('push-up: noise besar tidak double count', () => {
  const { a } = run(PushupAnalyzer, pushupSequence({ reps: 6, noise: 6, seed: 7 }));
  assert.equal(a.reps, 6);
});

test('push-up: pinggul turun ditandai hip_sag', () => {
  const { a, reps } = run(PushupAnalyzer, pushupSequence({ reps: 2, hipOffset: 45 }));
  assert.equal(a.reps, 2);
  assert.ok(reps.every((r) => r.flags.includes('hip_sag') && !r.flags.includes('hip_pike')), JSON.stringify(reps.map((r) => r.flags)));
});

test('push-up: pinggul terlalu tinggi ditandai hip_pike', () => {
  const { a, reps } = run(PushupAnalyzer, pushupSequence({ reps: 2, hipOffset: -45 }));
  assert.equal(a.reps, 2);
  assert.ok(reps.every((r) => r.flags.includes('hip_pike') && !r.flags.includes('hip_sag')), JSON.stringify(reps.map((r) => r.flags)));
});

test('push-up: tangan terlalu maju ditandai hands', () => {
  const { reps } = run(PushupAnalyzer, pushupSequence({ reps: 2, handShift: 75, minAngle: 80 }));
  assert.ok(reps.length === 2);
  assert.ok(reps.every((r) => r.flags.includes('hands')), JSON.stringify(reps.map((r) => r.flags)));
});

test('push-up: berdiri (bukan plank) → not_plank, tidak menghitung', () => {
  const frames = [];
  for (let i = 0; i < 90; i++) frames.push({ landmarks: squatPose(175 - (i % 30) * 3, { noise: 0 }), width: 640, height: 480, t: i * 33 });
  const { a, last } = run(PushupAnalyzer, frames);
  assert.equal(a.reps, 0);
  assert.equal(last.issue, 'not_plank');
});

test('push-up: tampak depan → wrong_view', () => {
  const { a, issues } = run(PushupAnalyzer, pushupSequence({ reps: 2, frontView: true }));
  assert.equal(a.reps, 0);
  assert.ok(issues.has('wrong_view'));
});

// ------------------------------- BICEP CURL -------------------------------
test('curl: 5 repetisi terkontrol → tepat 5, tanpa peringatan', () => {
  const { a, reps } = run(CurlAnalyzer, curlSequence({ reps: 5 }));
  assert.equal(a.reps, 5);
  for (const r of reps) assert.deepEqual(r.flags, []);
});

test('curl: menghadap kiri juga terhitung', () => {
  const { a } = run(CurlAnalyzer, curlSequence({ reps: 3, facing: 'left' }));
  assert.equal(a.reps, 3);
});

test('curl: setengah angkat tidak dihitung', () => {
  const { a, events } = run(CurlAnalyzer, curlSequence({ reps: 3, minAngle: 95 }));
  assert.equal(a.reps, 0);
  assert.equal(events.filter((e) => e.type === 'shallow').length, 3);
});

test('curl: terlalu cepat tetap dihitung tapi ditandai fast', () => {
  const { a, reps } = run(CurlAnalyzer, curlSequence({ reps: 3, repMs: 900 }), { smooth: false });
  assert.equal(a.reps, 3);
  assert.ok(reps.every((r) => r.flags.includes('fast')));
});

test('curl: badan berayun (momentum) ditandai swing', () => {
  // condong ke belakang sampai 20° mengikuti fase angkat
  const frames = curlSequence({ reps: 2 });
  const { a: a0 } = run(CurlAnalyzer, frames);
  assert.equal(a0.reps, 2);
  const swingFrames = [];
  const base = curlSequence({ reps: 2, noise: 0 });
  // bangun ulang dengan lean mengikuti sudut siku
  for (const f of base) {
    const e = angleDeg(px(f.landmarks, 12), px(f.landmarks, 14), px(f.landmarks, 16));
    const k = Math.max(0, (168 - e) / (168 - 45));
    swingFrames.push({ ...f, landmarks: curlPose(e, { noise: 0, lean: -20 * k }) });
  }
  const { a, reps } = run(CurlAnalyzer, swingFrames);
  assert.equal(a.reps, 2);
  assert.ok(reps.every((r) => r.flags.includes('swing')), JSON.stringify(reps.map((r) => r.flags)));
});

test('curl: siku maju ditandai elbow', () => {
  const base = curlSequence({ reps: 2, noise: 0 });
  const frames = base.map((f) => {
    const e = angleDeg(px(f.landmarks, 12), px(f.landmarks, 14), px(f.landmarks, 16));
    const k = Math.max(0, (168 - e) / (168 - 45));
    return { ...f, landmarks: curlPose(e, { noise: 0, elbowFwd: 5 + 45 * k }) };
  });
  const { a, reps } = run(CurlAnalyzer, frames);
  assert.equal(a.reps, 2);
  assert.ok(reps.every((r) => r.flags.includes('elbow')), JSON.stringify(reps.map((r) => r.flags)));
});

test('curl: tampak depan → wrong_view', () => {
  const { a, issues } = run(CurlAnalyzer, curlSequence({ reps: 2, frontView: true }));
  assert.equal(a.reps, 0);
  assert.ok(issues.has('wrong_view'));
});

test('curl: pose push-up (badan horizontal) tidak dihitung', () => {
  const { a } = run(CurlAnalyzer, pushupSequence({ reps: 2 }));
  assert.equal(a.reps, 0);
});
