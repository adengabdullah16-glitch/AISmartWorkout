// Integrasi MediaPipe Pose Landmarker (tasks-vision), mode VIDEO, 1 orang.
// Mencoba GPU dulu, otomatis turun ke CPU bila GPU gagal (sering terjadi di Safari iOS).

import { MEDIAPIPE } from './config.js';

const CPU_PREF_KEY = 'smartfit.forceCpu';
const MODEL_PREF_KEY = 'smartfit.model';

export function getModelVariant() {
  try { return localStorage.getItem(MODEL_PREF_KEY) === 'full' ? 'full' : 'lite'; } catch { return 'lite'; }
}
export function setModelVariant(v) {
  try { localStorage.setItem(MODEL_PREF_KEY, v === 'full' ? 'full' : 'lite'); } catch { /* abaikan */ }
}

export function getForceCpu() {
  try { return localStorage.getItem(CPU_PREF_KEY) === '1'; } catch { return false; }
}
export function setForceCpu(on) {
  try { localStorage.setItem(CPU_PREF_KEY, on ? '1' : '0'); } catch { /* abaikan */ }
}

function withTimeout(promise, ms, message) {
  let to;
  return Promise.race([
    promise,
    new Promise((_, reject) => { to = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(to));
}

export class PoseDetector {
  constructor() {
    this.landmarker = null;
    this.vision = null;
    this.lib = null;
    this.delegate = null;
    this.lastTs = 0;
  }

  /** @param {(msg:string)=>void} onStatus */
  async init(onStatus = () => {}) {
    onStatus('Memuat pustaka MediaPipe…');
    try {
      this.lib = await withTimeout(import(/* @vite-ignore */ MEDIAPIPE.bundleUrl), MEDIAPIPE.loadTimeoutMs,
        'Waktu habis saat memuat MediaPipe.');
      this.vision = await withTimeout(this.lib.FilesetResolver.forVisionTasks(MEDIAPIPE.wasmBase),
        MEDIAPIPE.loadTimeoutMs, 'Waktu habis saat memuat WASM MediaPipe.');
    } catch (err) {
      throw new Error(`MediaPipe gagal dimuat. Periksa koneksi internet. (${err.message})`);
    }

    const order = getForceCpu() ? ['CPU'] : ['GPU', 'CPU'];
    let lastErr = null;
    for (const delegate of order) {
      const size = getModelVariant() === 'full' ? '± 9 MB' : '± 5 MB';
      onStatus(delegate === 'GPU' ? `Mengunduh model pose (${size})…` : 'Menyiapkan mode CPU…');
      try {
        await this._create(delegate);
        return this.delegate;
      } catch (err) {
        lastErr = err;
        console.warn(`[pose] delegate ${delegate} gagal:`, err);
      }
    }
    throw new Error(`Model pose gagal disiapkan. (${lastErr?.message || 'tidak diketahui'})`);
  }

  async _create(delegate) {
    this.close();
    this.landmarker = await withTimeout(
      this.lib.PoseLandmarker.createFromOptions(this.vision, {
        baseOptions: { modelAssetPath: MEDIAPIPE.models[getModelVariant()], delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: MEDIAPIPE.minPoseDetectionConfidence,
        minPosePresenceConfidence: MEDIAPIPE.minPosePresenceConfidence,
        minTrackingConfidence: MEDIAPIPE.minTrackingConfidence,
        outputSegmentationMasks: false,
      }),
      MEDIAPIPE.loadTimeoutMs,
      'Waktu habis saat mengunduh model.'
    );
    this.delegate = delegate;
    this.model = getModelVariant();
    this.lastTs = 0;
  }

  /** Jika GPU gagal saat berjalan, pindah ke CPU. */
  async fallbackToCpu() {
    if (this.delegate === 'CPU') return false;
    await this._create('CPU');
    return true;
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} tMs timestamp monoton
   * @returns {{landmarks: Array|null}}
   */
  detect(video, tMs) {
    if (!this.landmarker) return { landmarks: null };
    // MediaPipe mewajibkan timestamp naik terus.
    const ts = tMs <= this.lastTs ? this.lastTs + 1 : tMs;
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(video, ts);
    return { landmarks: res?.landmarks?.[0] || null };
  }

  close() {
    try { this.landmarker?.close(); } catch { /* abaikan */ }
    this.landmarker = null;
  }
}
