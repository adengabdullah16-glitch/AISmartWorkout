// Analisis SQUAT. Penghitungan memakai FSM umum (rep-cycle.js) pada sudut lutut.
// Modul murni: menerima landmark, mengembalikan status. Tidak menyentuh DOM.

import { SQUAT } from '../config.js';
import {
  LM, toPx, distance, angleDeg, angleFromVertical,
  visibilityOf, allVisible, meanVisibility, inFrame,
} from '../geometry.js';
import { BaseAnalyzer, PHASE, sideViewRatio } from './rep-cycle.js';

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

const HIGHLIGHT = {
  left: [[11, 23], [23, 25], [25, 27]],
  right: [[12, 24], [24, 26], [26, 28]],
};

export class SquatAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({ ...SQUAT, ...config }, ['lean', 'unstable', 'heel'], SIDES);
  }

  onReset() { this.baseline = null; }

  update({ landmarks, width, height, t }) {
    if (!landmarks) return this._invalid('no_pose', t);
    const c = this.cfg;

    const side = this._pickSide(landmarks, ['shoulder', 'hip', 'knee', 'ankle']);
    const S = SIDES[side];
    const required = [S.shoulder, S.hip, S.knee, S.ankle];
    const quality = meanVisibility(landmarks, required);

    if (!allVisible(landmarks, required, c.minVisibility)) return this._invalid('body_not_visible', t, { quality, side });
    if (!inFrame(landmarks, required, c.frameMargin)) return this._invalid('out_of_frame', t, { quality, side });

    const P = {};
    for (const k of Object.keys(S)) P[k] = toPx(landmarks[S[k]], width, height);
    const torsoLen = distance(P.shoulder, P.hip);
    const legLen = distance(P.hip, P.knee) + distance(P.knee, P.ankle);

    // Dari samping, bahu (dan pinggul) kiri-kanan hampir menumpuk.
    const viewRatio = sideViewRatio(landmarks, width, height, torsoLen,
      [[LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_HIP, LM.RIGHT_HIP]]);
    if (viewRatio > c.maxSideViewRatio) return this._invalid('wrong_view', t, { quality, side, viewRatio });

    const knee = angleDeg(P.hip, P.knee, P.ankle);
    const hipAngle = angleDeg(P.shoulder, P.hip, P.knee);
    const torsoLean = angleFromVertical(P.hip, P.shoulder);
    const hipBelowKnee = P.hip.y >= P.knee.y;
    // Landmark tumit & ujung kaki paling sering meloncat, jadi syaratnya lebih ketat.
    const heelVisible = visibilityOf(landmarks[S.heel]) >= c.heelMinVisibility
      && visibilityOf(landmarks[S.foot]) >= c.heelMinVisibility;

    const events = this.cycle.step(knee, t, { depthReached: hipBelowKnee });

    // Baseline posisi kaki diperbarui selama berdiri diam.
    if (this.state === PHASE.TOP && knee >= c.extendAngle) {
      this.baseline = { ankleX: P.ankle.x, heelToFoot: heelVisible ? P.heel.y - P.foot.y : null };
    }

    // Analisis teknik hanya selama repetisi.
    const raw = { lean: false, unstable: false, heel: false };
    if (this.cycle.inRep) {
      raw.lean = torsoLean > c.maxTorsoLean;
      if (this.baseline) {
        raw.unstable = Math.abs(P.ankle.x - this.baseline.ankleX) / legLen > c.maxFootDrift;
        if (heelVisible && this.baseline.heelToFoot !== null) {
          // tumit naik → heel.y mengecil relatif ujung kaki → lift positif
          const lift = (this.baseline.heelToFoot - (P.heel.y - P.foot.y)) / legLen;
          raw.heel = lift > c.heelLiftRatio;
        }
      }
    }
    const cues = this.persist.update(raw, t);
    if (this.cycle.inRep) this.cycle.addFlags(cues);

    return this._result(events, cues,
      { angle: knee, kneeAngle: knee, hipAngle, torsoLean, hipBelowKnee, side, quality, viewRatio, ...this._progress(knee) },
      { side, angle: { value: knee, from: S.hip, at: S.knee, to: S.ankle }, highlight: HIGHLIGHT[side] });
  }
}
