// Analisis DUMBBELL BICEP CURL. FSM umum pada sudut siku lengan yang menghadap kamera.
// Kamera dari samping. Deteksi momentum bersifat heuristik:
//   - badan berayun (condong badan berubah dibanding saat berdiri diam)
//   - siku maju (lengan atas tidak lagi di samping badan)
//   - repetisi terlalu cepat (durasi < fastRepMs)

import { CURL } from '../config.js';
import {
  LM, toPx, distance, angleDeg, angleFromVertical, allVisible, meanVisibility, inFrame,
} from '../geometry.js';
import { BaseAnalyzer, PHASE, sideViewRatio } from './rep-cycle.js';

const SIDES = {
  left: { shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST, hip: LM.LEFT_HIP },
  right: { shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST, hip: LM.RIGHT_HIP },
};

const HIGHLIGHT = {
  left: [[11, 13], [13, 15], [11, 23]],
  right: [[12, 14], [14, 16], [12, 24]],
};

/** Condong badan bertanda (derajat): positif = ke depan (arah wajah), negatif = ke belakang. */
function signedLean(hip, shoulder, facing) {
  return Math.atan2((shoulder.x - hip.x) * facing, hip.y - shoulder.y) * 180 / Math.PI;
}

export class CurlAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({ ...CURL, ...config }, ['swing', 'elbow', 'fast'], SIDES);
  }

  onReset() { this.baseLean = null; }

  update({ landmarks, width, height, t }) {
    if (!landmarks) return this._invalid('no_pose', t);
    const c = this.cfg;

    const side = this._pickSide(landmarks, ['shoulder', 'elbow', 'wrist', 'hip']);
    const S = SIDES[side];
    const required = [S.shoulder, S.elbow, S.wrist, S.hip];
    const quality = meanVisibility(landmarks, required);

    if (!allVisible(landmarks, required, c.minVisibility)) return this._invalid('body_not_visible', t, { quality, side });
    if (!inFrame(landmarks, required, c.frameMargin)) return this._invalid('out_of_frame', t, { quality, side });

    const P = {};
    for (const k of Object.keys(S)) P[k] = toPx(landmarks[S[k]], width, height);
    const torsoLen = distance(P.shoulder, P.hip);

    const viewRatio = sideViewRatio(landmarks, width, height, torsoLen,
      [[LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_HIP, LM.RIGHT_HIP]]);
    if (viewRatio > c.maxSideViewRatio) return this._invalid('wrong_view', t, { quality, side, viewRatio });

    const torsoTilt = angleFromVertical(P.hip, P.shoulder);
    if (torsoTilt > c.maxStandLean + 20) return this._invalid('not_standing', t, { quality, side });

    // Arah hadap: hidung di depan bahu.
    const nose = toPx(landmarks[LM.NOSE], width, height);
    const facing = nose.x >= P.shoulder.x ? 1 : -1;

    const elbow = angleDeg(P.shoulder, P.elbow, P.wrist);
    const lean = signedLean(P.hip, P.shoulder, facing);
    const elbowDrift = 180 - angleFromVertical(P.shoulder, P.elbow); // 0 = lengan atas lurus ke bawah

    const events = this.cycle.step(elbow, t, { readyOk: torsoTilt <= c.maxStandLean });

    // Baseline condong badan saat berdiri diam dengan lengan lurus.
    if (this.state === PHASE.TOP && elbow >= c.extendAngle) {
      this.baseLean = this.baseLean === null ? lean : this.baseLean * 0.8 + lean * 0.2;
    }

    const raw = { swing: false, elbow: false, fast: false };
    let swing = 0;
    if (this.cycle.inRep) {
      if (this.baseLean !== null) {
        swing = Math.abs(lean - this.baseLean);
        raw.swing = swing > c.maxSwing;
      }
      raw.elbow = elbowDrift > c.maxElbowDrift;
    }
    const cues = this.persist.update(raw, t);
    if (this.cycle.inRep) this.cycle.addFlags(cues);

    return this._result(events, cues,
      { angle: elbow, elbowAngle: elbow, lean, swing, elbowDrift, side, quality, viewRatio, ...this._progress(elbow) },
      { side, angle: { value: elbow, from: S.shoulder, at: S.elbow, to: S.wrist }, highlight: HIGHLIGHT[side] });
  }
}
