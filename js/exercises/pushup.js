// Analisis PUSH-UP. FSM umum pada sudut siku (bahu–siku–pergelangan tangan).
// Kamera dari samping, setinggi lantai. Juga memeriksa garis tubuh (pinggul turun/naik)
// dan posisi tangan terhadap bahu.

import { PUSHUP } from '../config.js';
import {
  LM, toPx, distance, angleDeg, visibilityOf, allVisible, meanVisibility, inFrame,
} from '../geometry.js';
import { BaseAnalyzer, PHASE, sideViewRatio } from './rep-cycle.js';

const SIDES = {
  left: {
    shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST,
    hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE,
  },
  right: {
    shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST,
    hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE,
  },
};

const HIGHLIGHT = {
  left: [[11, 13], [13, 15], [11, 23], [23, 25], [25, 27]],
  right: [[12, 14], [14, 16], [12, 24], [24, 26], [26, 28]],
};

export class PushupAnalyzer extends BaseAnalyzer {
  constructor(config = {}) {
    super({ ...PUSHUP, ...config }, ['hip_sag', 'hip_pike', 'hands'], SIDES);
  }

  onReset() { this.topFlags = new Set(); }
  onRearm() { this.topFlags = new Set(); }

  update({ landmarks, width, height, t }) {
    if (!landmarks) return this._invalid('no_pose', t);
    const c = this.cfg;

    const side = this._pickSide(landmarks, ['shoulder', 'elbow', 'wrist', 'hip']);
    const S = SIDES[side];
    // Ujung garis tubuh: pergelangan kaki; kalau tidak terlihat, pakai lutut.
    const footIdx = visibilityOf(landmarks[S.ankle]) >= c.minVisibility ? S.ankle : S.knee;
    const required = [S.shoulder, S.elbow, S.wrist, S.hip, footIdx];
    const quality = meanVisibility(landmarks, required);

    if (!allVisible(landmarks, required, c.minVisibility)) return this._invalid('body_not_visible', t, { quality, side });
    if (!inFrame(landmarks, required, c.frameMargin)) return this._invalid('out_of_frame', t, { quality, side });

    const P = {};
    for (const k of Object.keys(S)) P[k] = toPx(landmarks[S[k]], width, height);
    const F = toPx(landmarks[footIdx], width, height);
    const torsoLen = distance(P.shoulder, P.hip);

    // Posisi plank: garis bahu–kaki mendekati horizontal.
    const bodyTilt = Math.abs(Math.atan2(F.y - P.shoulder.y, Math.abs(F.x - P.shoulder.x)) * 180 / Math.PI);
    if (bodyTilt > c.maxBodyTilt) return this._invalid('not_plank', t, { quality, side, bodyTilt });

    // Tampak depan (kepala menghadap kamera) membuat torso memendek dan bahu melebar.
    const viewRatio = sideViewRatio(landmarks, width, height, torsoLen,
      [[LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER]], true);
    if (viewRatio > c.maxSideViewRatio) return this._invalid('wrong_view', t, { quality, side, viewRatio });

    const elbow = angleDeg(P.shoulder, P.elbow, P.wrist);
    const hipAngle = angleDeg(P.shoulder, P.hip, F);
    const hipBend = 180 - hipAngle;
    // Pinggul di bawah garis bahu–kaki (y lebih besar) = turun; di atasnya = terlalu tinggi.
    const u = (P.hip.x - P.shoulder.x) / ((F.x - P.shoulder.x) || 1);
    const lineY = P.shoulder.y + u * (F.y - P.shoulder.y);
    const hipBelowLine = P.hip.y > lineY;
    const armLen = distance(P.shoulder, P.elbow) + distance(P.elbow, P.wrist);
    const handOffset = Math.abs(P.wrist.x - P.shoulder.x) / armLen;

    const events = this.cycle.step(elbow, t);

    // Garis tubuh diperiksa sepanjang set (posisi atas dan selama repetisi).
    // Posisi tangan hanya bermakna saat lengan lurus.
    const active = this.state !== PHASE.NEED_READY;
    const raw = {
      hip_sag: active && hipBend > c.maxHipBend && hipBelowLine,
      hip_pike: active && hipBend > c.maxHipBend && !hipBelowLine,
      hands: active && elbow >= c.startAngle && handOffset > c.maxHandOffset,
    };
    const cues = this.persist.update(raw, t);

    // Masalah yang terlihat di posisi atas ikut dicatat pada repetisi berikutnya.
    if (this.state === PHASE.TOP) cues.forEach((f) => this.topFlags.add(f));
    if (this.cycle.inRep) {
      this.cycle.addFlags(this.topFlags);
      this.topFlags.clear();
      this.cycle.addFlags(cues);
    }
    if (events.some((e) => e.type === 'rep' || e.type === 'shallow')) this.topFlags.clear();

    return this._result(events, cues,
      { angle: elbow, elbowAngle: elbow, hipBend, bodyTilt, handOffset, side, quality, viewRatio, ...this._progress(elbow) },
      { side, angle: { value: elbow, from: S.shoulder, at: S.elbow, to: S.wrist }, highlight: HIGHLIGHT[side] });
  }
}
