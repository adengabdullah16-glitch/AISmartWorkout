// Mesin hitung repetisi umum (finite state machine) untuk semua latihan.
//
// Semua latihan MVP punya pola yang sama pada satu sudut sendi utama:
//   lurus (sudut besar) → menekuk → cukup dalam (sudut kecil) → lurus lagi = 1 repetisi
//   squat: sudut lutut   | push-up: sudut siku | bicep curl: sudut siku
//
// State:
//   NEED_READY → TOP → DOWN → BOTTOM → UP → (TOP, +1)
//                        ↑______________|   (menekuk lagi sebelum lurus: repetisi yang sama)
// Repetisi hanya dihitung saat kembali LURUS setelah mencapai kedalaman,
// sehingga osilasi di sekitar ambang tidak menyebabkan double counting.

import { visibilityOf, distance, toPx } from '../geometry.js';

export const PHASE = {
  NEED_READY: 'NEED_READY',
  TOP: 'TOP',
  DOWN: 'DOWN',
  BOTTOM: 'BOTTOM',
  UP: 'UP',
};

export class RepCycle {
  /**
   * cfg: extendAngle, startAngle, depthAngle, bottomExitMargin, shallowReportAngle,
   *      directionMargin, minRepMs, readyFrames, lostGraceMs, fastRepMs (opsional)
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.reps = 0;
    this.rearm();
  }

  rearm() {
    this.state = PHASE.NEED_READY;
    this.readyFrames = 0;
    this.rep = null;
    this.lostSince = null;
  }

  get inRep() {
    return !!this.rep && (this.state === PHASE.DOWN || this.state === PHASE.BOTTOM || this.state === PHASE.UP);
  }

  addFlags(flags) {
    if (this.rep) for (const f of flags) this.rep.flags.add(f);
  }

  /**
   * @param {number} angle sudut sendi utama (derajat)
   * @param {number} t waktu (ms)
   * @param {{readyOk?:boolean, depthReached?:boolean}} o
   *   readyOk: syarat posisi awal terpenuhi (mis. posisi plank)
   *   depthReached: syarat kedalaman alternatif (mis. pinggul sejajar lutut)
   * @returns {Array} events
   */
  step(angle, t, { readyOk = true, depthReached = false } = {}) {
    const c = this.cfg;
    const ev = [];
    this.lostSince = null;
    const deep = angle <= c.depthAngle || depthReached;

    switch (this.state) {
      case PHASE.NEED_READY:
        if (readyOk && angle >= c.extendAngle) {
          if (++this.readyFrames >= c.readyFrames) {
            this.state = PHASE.TOP;
            ev.push({ type: 'ready' });
          }
        } else {
          this.readyFrames = 0;
        }
        break;

      case PHASE.TOP:
        if (angle < c.startAngle) {
          this.state = PHASE.DOWN;
          this.rep = { start: t, minAngle: angle, maxSinceUp: angle, reachedDepth: false, flags: new Set() };
        }
        break;

      case PHASE.DOWN:
        this.rep.minAngle = Math.min(this.rep.minAngle, angle);
        if (deep) {
          this.state = PHASE.BOTTOM;
          this.rep.reachedDepth = true;
          ev.push({ type: 'bottom' });
        } else if (angle >= c.extendAngle) {
          this._finish(t, ev); // kembali lurus tanpa kedalaman cukup
        } else if (angle > this.rep.minAngle + c.directionMargin) {
          this.state = PHASE.UP; // berbalik sebelum cukup dalam
          this.rep.maxSinceUp = angle;
          if (this.rep.minAngle <= c.shallowReportAngle) ev.push({ type: 'shallow_warning' });
        }
        break;

      case PHASE.BOTTOM:
        this.rep.minAngle = Math.min(this.rep.minAngle, angle);
        if (!deep && angle > c.depthAngle + c.bottomExitMargin) {
          this.state = PHASE.UP;
          this.rep.maxSinceUp = angle;
        }
        break;

      case PHASE.UP:
        this.rep.maxSinceUp = Math.max(this.rep.maxSinceUp, angle);
        if (angle >= c.extendAngle) {
          this._finish(t, ev);
        } else if (deep) {
          this.state = PHASE.BOTTOM; // menekuk lagi: repetisi yang sama
          this.rep.reachedDepth = true;
        } else if (angle < this.rep.maxSinceUp - c.directionMargin) {
          this.state = PHASE.DOWN; // menekuk lagi sebelum lurus: repetisi yang sama
          this.rep.minAngle = Math.min(this.rep.minAngle, angle);
        }
        break;
    }
    return ev;
  }

  /** Dipanggil saat frame tidak valid. Toleransi singkat, lalu repetisi dibatalkan. */
  invalid(t) {
    const ev = [];
    if (this.lostSince === null) this.lostSince = t;
    if (t - this.lostSince > this.cfg.lostGraceMs && this.state !== PHASE.NEED_READY) {
      if (this.rep) ev.push({ type: 'aborted' });
      this.rearm();
      this.lostSince = t;
    }
    return ev;
  }

  _finish(t, ev) {
    const rep = this.rep;
    this.state = PHASE.TOP;
    this.rep = null;
    if (!rep) return;
    const duration = t - rep.start;
    if (rep.reachedDepth && duration >= this.cfg.minRepMs) {
      this.reps++;
      if (this.cfg.fastRepMs && duration < this.cfg.fastRepMs) rep.flags.add('fast');
      ev.push({ type: 'rep', count: this.reps, flags: [...rep.flags], duration, minAngle: rep.minAngle });
    } else if (!rep.reachedDepth && rep.minAngle <= this.cfg.shallowReportAngle) {
      ev.push({ type: 'shallow', minAngle: rep.minAngle });
    } else if (rep.reachedDepth) {
      ev.push({ type: 'too_fast', duration });
    }
  }
}

/** Masalah teknik baru dianggap nyata bila bertahan minimal `ms` (menyaring noise landmark). */
export class PersistentFlags {
  constructor(ms, keys) {
    this.ms = ms;
    this.keys = keys;
    this.reset();
  }
  reset() {
    this.since = Object.fromEntries(this.keys.map((k) => [k, null]));
  }
  update(raw, t) {
    const active = [];
    for (const k of this.keys) {
      if (!raw[k]) { this.since[k] = null; continue; }
      if (this.since[k] === null) this.since[k] = t;
      if (t - this.since[k] >= this.ms) active.push(k);
    }
    return active;
  }
}

/** Kerangka bersama analyzer latihan: statistik, sisi tubuh, cek sudut kamera, hasil. */
export class BaseAnalyzer {
  constructor(cfg, flagKeys, sides) {
    this.cfg = cfg;
    this.flagKeys = flagKeys;
    this.sides = sides;
    this.reset();
  }

  reset() {
    this.cycle = new RepCycle(this.cfg);
    this.persist = new PersistentFlags(this.cfg.cuePersistMs, this.flagKeys);
    this.stats = {
      goodReps: 0, shallow: 0, aborted: 0,
      flags: Object.fromEntries(this.flagKeys.map((k) => [k, 0])),
    };
    this._side = null;
    this.onReset?.();
  }

  get reps() { return this.cycle.reps; }
  get state() { return this.cycle.state; }

  /** Pause/resume: wajib kembali ke posisi awal sebelum menghitung lagi. */
  rearm() {
    this.cycle.rearm();
    this.persist.reset();
    this.onRearm?.();
  }

  _tally(events) {
    for (const ev of events) {
      if (ev.type === 'rep') {
        ev.flags.forEach((f) => { if (f in this.stats.flags) this.stats.flags[f]++; });
        if (ev.flags.length === 0) this.stats.goodReps++;
      } else if (ev.type === 'shallow') this.stats.shallow++;
      else if (ev.type === 'aborted') this.stats.aborted++;
    }
  }

  _invalid(issue, t, metrics = {}) {
    const events = this.cycle.invalid(t);
    if (events.length) this.persist.reset();
    this._tally(events);
    return {
      valid: false, issue, state: this.state, reps: this.reps, events, cues: [],
      metrics, viz: null, stats: this.stats,
    };
  }

  _result(events, cues, metrics, viz) {
    this._tally(events);
    return {
      valid: true, issue: null, state: this.state, reps: this.reps, events, cues,
      metrics, viz, stats: this.stats,
    };
  }

  /** Pilih sisi tubuh yang paling terlihat; dengan histeresis agar tidak berganti tiap frame. */
  _pickSide(lms, keys) {
    const score = (s) => keys.reduce((a, k) => a + visibilityOf(lms[s[k]]), 0);
    const l = score(this.sides.left), r = score(this.sides.right);
    if (this._side && Math.abs(l - r) < 0.4) return this._side;
    this._side = l >= r ? 'left' : 'right';
    return this._side;
  }

  /** Progres 0..1 dari sudut lurus ke sudut kedalaman, dan posisi garis targetnya. */
  _progress(angle) {
    const top = this.cfg.extendAngle + 10;
    const bottom = this.cfg.depthAngle - 10;
    const p = (top - angle) / (top - bottom);
    return {
      progress: Math.max(0, Math.min(1, p)),
      progressMark: (top - this.cfg.depthAngle) / (top - bottom),
    };
  }
}

/** Lebar bahu/pinggul kiri-kanan dibagi panjang torso. Kecil = tampak samping. */
export function sideViewRatio(lms, w, h, torsoLen, pairs, useFullDistance = false) {
  let ratio = 0;
  for (const [a, b] of pairs) {
    // Sisi jauh sering tertutup tubuh (visibilitas rendah): itu justru tanda tampak samping.
    if (visibilityOf(lms[a]) < 0.3 || visibilityOf(lms[b]) < 0.3) continue;
    const d = useFullDistance
      ? distance(toPx(lms[a], w, h), toPx(lms[b], w, h))
      : Math.abs(lms[a].x - lms[b].x) * w;
    ratio = Math.max(ratio, d / Math.max(torsoLen, 1));
  }
  return ratio;
}
