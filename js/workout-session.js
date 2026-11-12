// Mengatur satu sesi latihan: kamera → MediaPipe → smoothing → analyzer → coach → UI.

import { Camera } from './camera.js';
import { PoseDetector } from './pose-detection.js';
import { LandmarkSmoother } from './geometry.js';
import { SkeletonRenderer } from './skeleton-renderer.js';
import { Coach } from './coach.js';

export class WorkoutSession {
  /**
   * @param {object} o
   * @param {object} o.exercise definisi dari exercise-engine
   * @param {number} o.target target repetisi
   * @param {HTMLVideoElement} o.video
   * @param {HTMLCanvasElement} o.canvas
   * @param {boolean} [o.mock] mode demo tanpa kamera
   * @param {boolean} [o.speech]
   * @param {(ui:object)=>void} o.onFrame
   * @param {(text:string)=>void} o.onStatus
   */
  constructor(o) {
    this.o = o;
    this.exercise = o.exercise;
    this.target = o.target;
    this.analyzer = o.exercise.create();
    this.smoother = new LandmarkSmoother();
    this.renderer = new SkeletonRenderer(o.canvas);
    this.coach = new Coach({ messages: o.exercise.messages, speech: o.speech !== false });
    this.camera = o.mock ? null : new Camera(o.video);
    this.detector = null;
    this.running = false;
    this.paused = false;
    this.rafId = null;
    this.lastVideoTime = -1;
    this.fps = 0;
    this.lastFrameT = null;
    this.activeMs = 0;
    this.segmentStart = null;
    this.startedAt = null;
    this.targetAnnounced = false;
    this.gpuFailed = false;
    this.wakeLock = null;
    this._onVisibility = () => { if (document.hidden && this.running && !this.paused) this.pause(); };
  }

  get mirrored() {
    return this.camera ? this.camera.mirrored : false;
  }

  async start() {
    const { onStatus } = this.o;
    this.coach.unlockSpeech();

    if (this.camera) {
      onStatus('Meminta izin kamera…');
      await this.camera.start('user');
    }

    if (this.o.mock) {
      const { MockPoseDetector, MOCK_SIZE } = await import('./dev/synthetic-pose.js');
      this.detector = new MockPoseDetector(this.exercise.id);
      this.size = MOCK_SIZE;
    } else {
      this.detector = new PoseDetector();
      await this.detector.init(onStatus);
    }

    this.startedAt = new Date();
    this.running = true;
    this.paused = false;
    this.segmentStart = performance.now();
    document.addEventListener('visibilitychange', this._onVisibility);
    this._requestWakeLock();
    onStatus('');
    this._loop();
  }

  _sourceSize() {
    if (this.camera) return { width: this.camera.width, height: this.camera.height };
    return this.size;
  }

  _loop = () => {
    if (!this.running || this.paused) return;
    this.rafId = requestAnimationFrame(this._loop);

    const video = this.o.video;
    if (this.camera) {
      if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return; // belum ada frame baru
      this.lastVideoTime = video.currentTime;
    }

    const now = performance.now();
    const { width, height } = this._sourceSize();
    if (!width || !height) return;
    this.renderer.resize(width, height);

    let raw;
    try {
      raw = this.detector.detect(this.camera ? video : null, now);
    } catch (err) {
      this._handleDetectError(err);
      return;
    }

    if (this.lastFrameT !== null) {
      const inst = 1000 / Math.max(now - this.lastFrameT, 1);
      this.fps = this.fps ? this.fps * 0.9 + inst * 0.1 : inst;
    }
    this.lastFrameT = now;

    const landmarks = raw.landmarks ? this.smoother.smooth(raw.landmarks, now) : null;
    if (!raw.landmarks) this.smoother.reset();

    const result = this.analyzer.update({ landmarks, width, height, t: now });
    const message = this.coach.process(result, now);

    if (result.reps >= this.target && !this.targetAnnounced) {
      this.targetAnnounced = true;
      this.coach.say('Target tercapai', now, true);
    }

    const viz = result.valid ? result.viz : null;
    this.renderer.draw(landmarks, {
      side: viz?.side,
      valid: result.valid,
      warn: result.valid && result.cues.length > 0,
      highlight: viz?.highlight,
      mirrored: this.mirrored,
      background: !this.camera,
      angle: viz?.angle || null,
    });

    this.o.onFrame({
      reps: result.reps,
      target: this.target,
      state: result.state,
      stateLabel: this.exercise.stateLabels?.[result.state] || result.state,
      valid: result.valid,
      issue: result.issue,
      message,
      metrics: result.metrics || {},
      fps: this.fps,
      quality: result.metrics?.quality ?? 0,
      detected: !!landmarks,
      elapsedMs: this.elapsedMs,
      delegate: this.detector.delegate,
      model: this.detector.model,
      targetReached: result.reps >= this.target,
    });
  };

  async _handleDetectError(err) {
    console.error('[session] deteksi gagal:', err);
    if (!this.gpuFailed && this.detector.fallbackToCpu) {
      this.gpuFailed = true;
      this.running = false;
      cancelAnimationFrame(this.rafId);
      this.o.onStatus('GPU bermasalah, beralih ke mode CPU…');
      try {
        await this.detector.fallbackToCpu();
        this.o.onStatus('');
        this.running = true;
        this._loop();
        return;
      } catch (e2) {
        err = e2;
      }
    }
    this.running = false;
    this.o.onError?.(new Error(`Deteksi pose berhenti: ${err.message}`));
  }

  get elapsedMs() {
    return this.activeMs + (this.running && !this.paused && this.segmentStart ? performance.now() - this.segmentStart : 0);
  }

  pause() {
    if (!this.running || this.paused) return;
    this.activeMs += performance.now() - this.segmentStart;
    this.segmentStart = null;
    this.paused = true;
    cancelAnimationFrame(this.rafId);
    this.coach.cancelSpeech();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.segmentStart = performance.now();
    this.analyzer.rearm(); // wajib berdiri lagi → tidak ada hitungan tak sengaja
    this.smoother.reset();
    this.lastFrameT = null;
    this._requestWakeLock();
    this._loop();
  }

  async switchCamera() {
    if (!this.camera) return;
    const wasPaused = this.paused;
    this.pause();
    await this.camera.switch();
    this.lastVideoTime = -1;
    if (!wasPaused) this.resume();
  }

  setSpeech(on) {
    this.coach.setSpeech(on);
  }

  /** Mengakhiri sesi dan mengembalikan ringkasan untuk disimpan. */
  finish() {
    const durationMs = this.elapsedMs;
    const stats = this.analyzer.stats;
    this.destroy();
    return {
      exercise: this.exercise.id,
      exerciseName: this.exercise.name,
      date: (this.startedAt || new Date()).toISOString(),
      reps: this.analyzer.reps,
      target: this.target,
      durationSec: Math.round(durationMs / 1000),
      quality: {
        goodReps: stats.goodReps,
        shallow: stats.shallow,
        aborted: stats.aborted,
        flags: { ...stats.flags },
      },
      mock: !!this.o.mock,
    };
  }

  destroy() {
    if (this.running && !this.paused && this.segmentStart) this.activeMs += performance.now() - this.segmentStart;
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.coach.cancelSpeech();
    this.camera?.stop();
    this.detector?.close();
    this.renderer.clear();
    try { this.wakeLock?.release(); } catch { /* abaikan */ }
    this.wakeLock = null;
  }

  async _requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => { this.wakeLock = null; });
      }
    } catch { /* tidak didukung / ditolak: abaikan */ }
  }
}
