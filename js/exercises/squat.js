// Analisis SQUAT berbasis finite state machine (FSM).
// Modul murni: menerima landmark, mengembalikan status. Tidak menyentuh DOM.
//
// Alur state:
//   NEED_STAND → STAND → DOWN → BOTTOM → UP → (STAND, +1 rep)
//                         ↑______________|   (turun lagi sebelum berdiri: tidak dihitung dua kali)
// Repetisi hanya dihitung saat kembali BERDIRI setelah mencapai kedalaman cukup,
// sehingga osilasi di sekitar ambang tidak menyebabkan double counting.

import { SQUAT } from '../config.js';
import {
  LM, toPx, distance, angleDeg, angleFromVertical, clamp,
  visibilityOf, allVisible, meanVisibility, inFrame,
} from '../geometry.js';

const SIDES = {
  left: {
    shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE,
    ankle: LM.LEFT_ANKLE, heel: LM.LEFT_HEEL, foot: LM.LEFT_FOOT,
  },
  right: {
    shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE,
    ankle: LM.RIGHT_ANKLE, heel: LM.RIGHT_HEEL, foot: LM.RIGHT_FOOT,
  },
};

export const SQUAT_STATES = {
  NEED_STAND: 'NEED_STAND',
  STAND: 'STAND',
  DOWN: 'DOWN',
  BOTTOM: 'BOTTOM',
  UP: 'UP',
};

export class SquatAnalyzer {
  constructor(config = {}) {
    this.cfg = { ...SQUAT, ...config };
    this.reset();
  }

  reset() {
    this.state = SQUAT_STATES.NEED_STAND;
    this.reps = 0;
    this.standFrames = 0;
    this.lostSince = null;
    this.rep = null; // data repetisi yang sedang berjalan
    this.baseline = null; // posisi kaki/tumit saat berdiri
    this.stats = { goodReps: 0, shallow: 0, aborted: 0, flags: { lean: 0, unstable: 0, heel: 0 } };
  }

  /** Dipakai saat pause/resume: wajib berdiri lagi sebelum menghitung. */
  rearm() {
    this.state = SQUAT_STATES.NEED_STAND;
    this.standFrames = 0;
    this.rep = null;
    this.lostSince = null;
  }

  /**
   * @param {{landmarks: Array|null, width:number, height:number, t:number}} frame
   */
  update({ landmarks, width, height, t }) {
    const events = [];
    const base = { reps: this.reps, state: this.state, events, cues: [], stats: this.stats };

    if (!landmarks) return this._invalid(base, 'no_pose', t);

    const sideName = this._pickSide(landmarks);
    const S = SIDES[sideName];
    const required = [S.shoulder, S.hip, S.knee, S.ankle];
    const quality = meanVisibility(landmarks, required);

    if (!allVisible(landmarks, required, this.cfg.minVisibility)) {
      return this._invalid({ ...base, metrics: { quality, side: sideName } }, 'body_not_visible', t);
    }
    if (!inFrame(landmarks, required, this.cfg.frameMargin)) {
      return this._invalid({ ...base, metrics: { quality, side: sideName } }, 'out_of_frame', t);
    }

    const P = {};
    for (const k of Object.keys(S)) P[k] = toPx(landmarks[S[k]], width, height);
    const torsoLen = distance(P.shoulder, P.hip);
    const legLen = distance(P.hip, P.knee) + distance(P.knee, P.ankle);

    // Cek sudut kamera: dari samping, bahu kiri-kanan (dan pinggul) hampir menumpuk.
    const viewRatio = this._viewRatio(landmarks, width, height, torsoLen);
    if (viewRatio > this.cfg.maxSideViewRatio) {
      return this._invalid({ ...base, metrics: { quality, side: sideName, viewRatio } }, 'wrong_view', t);
    }

    this.lostSince = null;

    const knee = angleDeg(P.hip, P.knee, P.ankle);
    const hipAngle = angleDeg(P.shoulder, P.hip, P.knee);
    const torsoLean = angleFromVertical(P.hip, P.shoulder);
    const hipBelowKnee = P.hip.y >= P.knee.y;
    const depthReachedNow = knee <= this.cfg.depthAngle || hipBelowKnee;
    const depth = clamp((this.cfg.standAngle + 10 - knee) / (this.cfg.standAngle + 10 - (this.cfg.depthAngle - 10)), 0, 1);

    const heelVisible = visibilityOf(landmarks[S.heel]) >= 0.5 && visibilityOf(landmarks[S.foot]) >= 0.5;

    // ------------------------------- FSM -------------------------------
    const c = this.cfg;
    switch (this.state) {
      case SQUAT_STATES.NEED_STAND:
        if (knee >= c.standAngle) {
          this.standFrames++;
          if (this.standFrames >= c.standConfirmFrames) {
            this.state = SQUAT_STATES.STAND;
            this._setBaseline(P, heelVisible);
            events.push({ type: 'ready' });
          }
        } else {
          this.standFrames = 0;
        }
        break;

      case SQUAT_STATES.STAND:
        if (knee >= c.standAngle) this._setBaseline(P, heelVisible); // perbarui baseline saat diam berdiri
        if (knee < c.startDescentAngle) {
          this.state = SQUAT_STATES.DOWN;
          this.rep = { start: t, minKnee: knee, reachedDepth: false, maxSinceUp: knee, flags: new Set() };
        }
        break;

      case SQUAT_STATES.DOWN:
        this.rep.minKnee = Math.min(this.rep.minKnee, knee);
        if (depthReachedNow) {
          this.state = SQUAT_STATES.BOTTOM;
          this.rep.reachedDepth = true;
          events.push({ type: 'bottom' });
        } else if (knee >= c.standAngle) {
          this._finishRep(t, events); // kembali berdiri tanpa kedalaman cukup
        } else if (knee > this.rep.minKnee + c.directionMargin) {
          this.state = SQUAT_STATES.UP; // berbalik naik sebelum cukup dalam
          this.rep.maxSinceUp = knee;
          if (this.rep.minKnee <= c.shallowReportAngle) events.push({ type: 'shallow_warning' });
        }
        break;

      case SQUAT_STATES.BOTTOM:
        this.rep.minKnee = Math.min(this.rep.minKnee, knee);
        if (!depthReachedNow && knee > c.depthAngle + c.bottomExitMargin) {
          this.state = SQUAT_STATES.UP;
          this.rep.maxSinceUp = knee;
        }
        break;

      case SQUAT_STATES.UP:
        this.rep.maxSinceUp = Math.max(this.rep.maxSinceUp, knee);
        if (knee >= c.standAngle) {
          this._finishRep(t, events);
        } else if (depthReachedNow) {
          this.state = SQUAT_STATES.BOTTOM; // turun lagi: masih repetisi yang sama
          this.rep.reachedDepth = true;
        } else if (knee < this.rep.maxSinceUp - c.directionMargin) {
          this.state = SQUAT_STATES.DOWN; // turun lagi sebelum berdiri: repetisi yang sama
          this.rep.minKnee = Math.min(this.rep.minKnee, knee);
        }
        break;
    }

    // --------------------- Analisis teknik (hanya saat repetisi) ---------------------
    const cues = [];
    const inRep = this.rep && [SQUAT_STATES.DOWN, SQUAT_STATES.BOTTOM, SQUAT_STATES.UP].includes(this.state);
    if (inRep) {
      if (torsoLean > c.maxTorsoLean) cues.push('lean');
      if (this.baseline) {
        const drift = Math.abs(P.ankle.x - this.baseline.ankleX) / legLen;
        if (drift > c.maxFootDrift) cues.push('unstable');
        if (heelVisible && this.baseline.heelToFoot !== null) {
          const lift = (this.baseline.heelToFoot - (P.heel.y - P.foot.y)) / legLen;
          // tumit naik → heel.y mengecil relatif ujung kaki → lift positif
          if (lift > c.heelLiftRatio) cues.push('heel');
        }
      }
      cues.forEach((f) => this.rep.flags.add(f));
    }

    return {
      ...base,
      valid: true,
      issue: null,
      reps: this.reps,
      state: this.state,
      cues,
      metrics: { kneeAngle: knee, hipAngle, torsoLean, depth, hipBelowKnee, side: sideName, quality, viewRatio },
    };
  }

  // ---------------------------------------------------------------------------
  _finishRep(t, events) {
    const rep = this.rep;
    this.state = SQUAT_STATES.STAND;
    this.rep = null;
    if (!rep) return;
    const duration = t - rep.start;
    if (rep.reachedDepth && duration >= this.cfg.minRepMs) {
      this.reps++;
      const flags = [...rep.flags];
      flags.forEach((f) => this.stats.flags[f]++);
      if (flags.length === 0) this.stats.goodReps++;
      events.push({ type: 'rep', count: this.reps, flags, duration, minKnee: rep.minKnee });
    } else if (!rep.reachedDepth && rep.minKnee <= this.cfg.shallowReportAngle) {
      this.stats.shallow++;
      events.push({ type: 'shallow', minKnee: rep.minKnee });
    } else if (rep.reachedDepth) {
      events.push({ type: 'too_fast', duration });
    }
  }

  _invalid(base, issue, t) {
    // Toleransi singkat; setelah itu repetisi berjalan dibatalkan dan wajib berdiri lagi.
    if (this.lostSince === null) this.lostSince = t;
    if (t - this.lostSince > this.cfg.lostGraceMs && this.state !== SQUAT_STATES.NEED_STAND) {
      if (this.rep) {
        this.stats.aborted++;
        base.events.push({ type: 'aborted' });
      }
      this.rearm();
      this.lostSince = t;
    }
    return { ...base, valid: false, issue, reps: this.reps, state: this.state, cues: [], metrics: base.metrics || {} };
  }

  _pickSide(lms) {
    const score = (s) => [s.shoulder, s.hip, s.knee, s.ankle].reduce((a, i) => a + visibilityOf(lms[i]), 0);
    const l = score(SIDES.left), r = score(SIDES.right);
    // Histeresis agar sisi tidak berganti-ganti tiap frame.
    if (this._side && Math.abs(l - r) < 0.4) return this._side;
    this._side = l >= r ? 'left' : 'right';
    return this._side;
  }

  _viewRatio(lms, w, h, torsoLen) {
    const pairs = [[LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_HIP, LM.RIGHT_HIP]];
    let ratio = 0;
    for (const [a, b] of pairs) {
      // Sisi jauh sering tertutup tubuh (visibilitas rendah) — itu justru tanda tampak samping.
      if (visibilityOf(lms[a]) < 0.3 || visibilityOf(lms[b]) < 0.3) continue;
      const dx = Math.abs(lms[a].x - lms[b].x) * w;
      ratio = Math.max(ratio, dx / Math.max(torsoLen, 1));
    }
    return ratio;
  }

  _setBaseline(P, heelVisible) {
    this.baseline = {
      ankleX: P.ankle.x,
      heelToFoot: heelVisible ? P.heel.y - P.foot.y : null,
    };
  }
}
