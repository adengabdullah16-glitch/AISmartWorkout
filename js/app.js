// Titik masuk aplikasi: navigasi antar-tampilan dan pengikatan UI.

import { EXERCISES, getExercise } from './exercise-engine.js';
import { WorkoutSession } from './workout-session.js';
import { storage } from './storage.js';
import { computeStats, formatDuration, formatClock, formatDate, last7Days, renderChart } from './dashboard.js';
import { getForceCpu, setForceCpu } from './pose-detection.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEMO_URL = params.get('mock') === '1';

const ICONS = {
  squat: '<svg viewBox="0 0 32 32"><circle cx="18" cy="6" r="3"/><path d="M17 10l-4 8 7 3-2 8M13 18l7 3M17 12l7 3M18 29h4"/></svg>',
  pushup: '<svg viewBox="0 0 32 32"><circle cx="7" cy="12" r="3"/><path d="M10 14l18 5M12 15v8M28 19v4M4 24h26"/></svg>',
  curl: '<svg viewBox="0 0 32 32"><circle cx="16" cy="5" r="3"/><path d="M16 9v11M16 12l-5 6 4 3M16 20l-3 9M16 20l3 9"/><path d="M13 19h4M13 17v4M17 17v4"/></svg>',
};
const ARROW = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';

const ISSUE_SHORT = {
  no_pose: 'Tubuh tidak terdeteksi',
  body_not_visible: 'Tubuh tidak utuh',
  out_of_frame: 'Tubuh terpotong',
  wrong_view: 'Belum menyamping',
};

const state = {
  exercise: EXERCISES.squat,
  target: EXERCISES.squat.defaultTarget,
  sound: true,
  mock: DEMO_URL,
  session: null,
  lastSummary: null,
  ui: {},
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function show(viewId) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === viewId));
  window.scrollTo(0, 0);
}

// ============================== DASHBOARD ==============================
async function renderHome() {
  const history = await storage.list();
  const s = computeStats(history);
  $('stat-workouts').textContent = s.totalWorkouts;
  $('stat-reps').textContent = s.totalReps;
  $('stat-duration').textContent = formatDuration(s.totalSec);
  $('stat-last').textContent = s.last ? `${s.last.exerciseName} · ${formatDate(s.last.date)}` : '—';
  renderChart($('chart'), last7Days(history));

  const h = new Date().getHours();
  $('greeting').textContent = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
  $('demo-chip').hidden = !DEMO_URL;

  $('exercise-list').innerHTML = Object.values(EXERCISES).map((ex) => `
    <button class="exercise" data-exercise="${ex.id}" ${ex.available ? '' : 'disabled'}>
      <span class="exercise-ico">${ICONS[ex.id] || ''}</span>
      <span class="exercise-body">
        <span class="exercise-name">${esc(ex.name)}</span>
        <span class="exercise-meta">${esc(ex.muscles)}</span>
      </span>
      ${ex.available ? `<span class="exercise-go">${ARROW}</span>` : '<span class="exercise-soon">SEGERA</span>'}
    </button>`).join('');

  const list = $('history-list');
  if (!history.length) {
    list.innerHTML = '<li class="h-empty">Belum ada riwayat. Mulai latihan pertamamu!</li>';
  } else {
    list.innerHTML = history.slice(0, 10).map((x) => `
      <li>
        <div class="h-main">
          <div class="h-title">${esc(x.exerciseName)}${x.mock ? '<span class="badge">DEMO</span>' : ''}</div>
          <div class="h-sub">${esc(formatDate(x.date))} · ${esc(formatDuration(x.durationSec))}</div>
        </div>
        <div class="h-reps">${x.reps}</div>
      </li>`).join('');
  }
  $('btn-clear-history').hidden = !history.length;
}

// ============================== SETUP ==============================
function openSetup(id) {
  const ex = getExercise(id);
  if (!ex || !ex.available) return;
  state.exercise = ex;
  state.target = ex.defaultTarget;
  $('setup-title').textContent = ex.name;
  $('guide-title').textContent = ex.guide.title;
  $('guide-steps').innerHTML = ex.guide.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  $('guide-note').textContent = ex.guide.note;
  $('target-value').textContent = state.target;
  $('opt-sound').checked = state.sound;
  $('opt-cpu').checked = getForceCpu();
  show('view-setup');
}

function changeTarget(d) {
  state.target = Math.max(1, Math.min(100, state.target + d));
  $('target-value').textContent = state.target;
}

// ============================== WORKOUT ==============================
function resetWorkoutUi() {
  state.ui = {};
  $('hud-exercise').textContent = state.exercise.name + (state.mock ? ' · Demo' : '');
  $('hud-timer').textContent = '00:00';
  $('rep-count').textContent = '0';
  $('rep-target').textContent = `/${state.target}`;
  $('rep-phase').textContent = 'Bersiap';
  $('progress-fill').style.width = '0%';
  $('depth-fill').style.height = '0%';
  $('depth-angle').textContent = '—';
  $('coach-text').textContent = 'Berdiri tegak menyamping untuk memulai.';
  $('coach').dataset.tone = 'info';
  $('pill-track').dataset.state = '';
  $('track-text').textContent = 'Mencari tubuh…';
  $('pill-fps').textContent = '— FPS';
  $('pill-quality').textContent = 'Kualitas —';
  $('btn-pause').textContent = 'Jeda';
  $('btn-sound').setAttribute('aria-pressed', String(state.sound));
  $('btn-flip').hidden = state.mock;
  $('error-panel').hidden = true;
  $('stage').classList.toggle('mirrored', false);
}

function setText(key, el, value) {
  if (state.ui[key] !== value) {
    state.ui[key] = value;
    el.textContent = value;
  }
}

function onFrame(u) {
  const ui = state.ui;

  if (ui.reps !== u.reps) {
    const el = $('rep-count');
    el.textContent = u.reps;
    if (ui.reps !== undefined) {
      el.classList.remove('bump');
      void el.offsetWidth; // restart animasi
      el.classList.add('bump');
      if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* abaikan */ }
    }
    ui.reps = u.reps;
    $('progress-fill').style.width = `${Math.min(100, (u.reps / u.target) * 100)}%`;
  }

  setText('phase', $('rep-phase'), u.targetReached ? 'Target tercapai 🎉' : u.stateLabel);
  setText('timer', $('hud-timer'), formatClock(u.elapsedMs));
  setText('coach', $('coach-text'), u.message.text);
  if (ui.tone !== u.message.tone) { ui.tone = u.message.tone; $('coach').dataset.tone = u.message.tone; }

  const trackState = !u.detected ? 'bad' : u.valid ? 'ok' : 'warn';
  if (ui.track !== trackState || ui.issue !== u.issue) {
    ui.track = trackState;
    ui.issue = u.issue;
    $('pill-track').dataset.state = trackState;
    $('track-text').textContent = u.valid ? 'Tubuh terdeteksi' : (ISSUE_SHORT[u.issue] || 'Tubuh tidak terdeteksi');
  }

  // FPS & kualitas: cukup diperbarui ~4x per detik
  const now = performance.now();
  if (!ui.slowT || now - ui.slowT > 250) {
    ui.slowT = now;
    $('pill-fps').textContent = `${Math.round(u.fps || 0)} FPS · ${u.delegate || ''}`;
    const q = Math.round((u.quality || 0) * 100);
    const label = !u.detected ? '—' : q >= 80 ? 'Baik' : q >= 60 ? 'Sedang' : 'Buruk';
    $('pill-quality').textContent = `Kualitas ${label}${u.detected ? ` ${q}%` : ''}`;
  }

  const m = u.metrics;
  if (u.valid && Number.isFinite(m.kneeAngle)) {
    const d = Math.round((m.depth || 0) * 100);
    if (ui.depth !== d) {
      ui.depth = d;
      const fill = $('depth-fill');
      fill.style.height = `${d}%`;
      fill.classList.toggle('short', d < 87 && ['DOWN', 'UP'].includes(u.state));
    }
    setText('angle', $('depth-angle'), `${Math.round(m.kneeAngle)}°`);
  } else {
    setText('angle', $('depth-angle'), '—');
  }
}

async function startWorkout() {
  setForceCpu($('opt-cpu').checked);
  state.sound = $('opt-sound').checked;
  resetWorkoutUi();
  show('view-workout');
  $('loading').hidden = false;
  $('loading-text').textContent = 'Menyiapkan…';

  const session = new WorkoutSession({
    exercise: state.exercise,
    target: state.target,
    video: $('video'),
    canvas: $('overlay'),
    mock: state.mock,
    speech: state.sound,
    onFrame,
    onStatus: (text) => {
      $('loading').hidden = !text;
      $('loading-text').textContent = text;
    },
    onError: (err) => showError(err.message),
  });
  state.session = session;

  try {
    await session.start();
    if (state.session !== session) { session.destroy(); return; } // pengguna sudah keluar
    $('stage').classList.toggle('mirrored', session.mirrored);
    $('loading').hidden = true;
  } catch (err) {
    console.error(err);
    session.destroy();
    if (state.session === session) showError(err.message || String(err));
  }
}

function showError(message) {
  $('loading').hidden = true;
  $('error-text').textContent = message;
  $('error-panel').hidden = false;
}

function togglePause() {
  const s = state.session;
  if (!s || !s.running) return;
  if (s.paused) {
    s.resume();
    $('btn-pause').textContent = 'Jeda';
    toast('Lanjut. Berdiri tegak dulu sebelum mulai lagi.');
  } else {
    s.pause();
    $('btn-pause').textContent = 'Lanjutkan';
    $('coach-text').textContent = 'Dijeda. Tekan Lanjutkan bila siap.';
    $('coach').dataset.tone = 'info';
    state.ui.coach = null;
  }
}

function buildNotes(sum) {
  const q = sum.quality;
  const notes = [];
  if (sum.reps === 0) {
    notes.push('Belum ada repetisi terhitung. Pastikan tubuh terlihat utuh dari samping dan turun sampai pinggul kira-kira sejajar lutut.');
  } else if (q.goodReps === sum.reps) {
    notes.push('Semua repetisi terhitung tanpa peringatan teknik. Pertahankan!');
  } else {
    notes.push(`${q.goodReps} dari ${sum.reps} repetisi tanpa peringatan teknik.`);
  }
  if (q.flags.lean) notes.push(`Badan terlalu condong ke depan pada ${q.flags.lean} repetisi — jaga dada tetap tegak.`);
  if (q.flags.unstable) notes.push(`Kaki bergeser pada ${q.flags.unstable} repetisi — jaga posisi kaki tetap.`);
  if (q.flags.heel) notes.push(`Tumit terangkat pada ${q.flags.heel} repetisi — tekan tumit ke lantai.`);
  if (q.shallow) notes.push(`${q.shallow} gerakan terlalu dangkal sehingga tidak dihitung.`);
  if (q.aborted) notes.push(`${q.aborted} repetisi dibatalkan karena tubuh sempat tidak terlihat.`);
  notes.push('Catatan ini berasal dari estimasi kamera, bukan penilaian medis.');
  return notes;
}

async function finishWorkout() {
  const s = state.session;
  if (!s) return;
  state.session = null;
  const sum = s.finish();
  sum.notes = buildNotes(sum);
  state.lastSummary = sum;

  if (sum.durationSec >= 3 || sum.reps > 0) {
    try {
      await storage.add(sum);
    } catch (err) {
      toast(err.message, 4000);
    }
  }

  $('sum-exercise').textContent = sum.exerciseName + (sum.mock ? ' · Demo' : '');
  $('sum-reps').textContent = sum.reps;
  $('sum-sub').textContent = sum.reps >= sum.target ? 'Target tercapai. Kerja bagus!' : `Target ${sum.target} repetisi.`;
  $('sum-duration').textContent = formatDuration(sum.durationSec);
  $('sum-good').textContent = sum.quality.goodReps;
  $('sum-shallow').textContent = sum.quality.shallow;
  $('sum-target').textContent = sum.target;
  $('sum-notes').innerHTML = sum.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  show('view-summary');
}

function exitWorkout() {
  const s = state.session;
  if (s && s.running && s.analyzer.reps > 0) {
    finishWorkout();
    return;
  }
  if (s) { state.session = null; s.destroy(); }
  goHome();
}

function goHome() {
  if (state.session) { state.session.destroy(); state.session = null; }
  state.mock = DEMO_URL;
  renderHome();
  show('view-home');
}

// ============================== EVENTS ==============================
function bind() {
  document.addEventListener('click', (e) => {
    const exBtn = e.target.closest('[data-exercise]');
    if (exBtn && !exBtn.disabled) return openSetup(exBtn.dataset.exercise);
    const act = e.target.closest('[data-action]');
    if (act?.dataset.action === 'home') return goHome();
  });

  $('target-minus').addEventListener('click', () => changeTarget(-1));
  $('target-plus').addEventListener('click', () => changeTarget(1));
  $('btn-start').addEventListener('click', () => { state.mock = DEMO_URL; startWorkout(); });
  $('btn-demo').addEventListener('click', () => { state.mock = true; startWorkout(); });
  $('btn-retry').addEventListener('click', () => startWorkout());
  $('btn-pause').addEventListener('click', togglePause);
  $('btn-finish').addEventListener('click', () => (state.session ? finishWorkout() : goHome()));
  $('btn-close').addEventListener('click', exitWorkout);
  $('btn-again').addEventListener('click', () => openSetup(state.exercise.id));

  $('btn-sound').addEventListener('click', () => {
    state.sound = !state.sound;
    $('btn-sound').setAttribute('aria-pressed', String(state.sound));
    state.session?.setSpeech(state.sound);
    if (state.sound) state.session?.coach.unlockSpeech();
  });

  $('btn-flip').addEventListener('click', async () => {
    const s = state.session;
    if (!s) return;
    try {
      await s.switchCamera();
      $('stage').classList.toggle('mirrored', s.mirrored);
      $('btn-pause').textContent = s.paused ? 'Lanjutkan' : 'Jeda';
    } catch (err) {
      showError(err.message);
    }
  });

  $('btn-clear-history').addEventListener('click', async () => {
    if (!confirm('Hapus semua riwayat latihan di perangkat ini?')) return;
    await storage.clear();
    renderHome();
    toast('Riwayat dihapus.');
  });

  window.addEventListener('pagehide', () => state.session?.destroy());
}

bind();
renderHome();

// Untuk pengujian otomatis.
window.__smartfit = { state, storage };
