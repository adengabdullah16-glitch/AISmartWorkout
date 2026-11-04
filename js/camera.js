// Akses kamera via getUserMedia (WebRTC). Mendukung kamera depan/belakang.

import { CAMERA } from './config.js';

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function explain(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new CameraError('denied', 'Izin kamera ditolak. Buka pengaturan situs di browser, izinkan kamera, lalu coba lagi.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return new CameraError('notfound', 'Kamera tidak ditemukan di perangkat ini.');
  if (name === 'NotReadableError' || name === 'AbortError')
    return new CameraError('busy', 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.');
  return new CameraError('unknown', `Kamera gagal dibuka (${name || err?.message || 'tidak diketahui'}).`);
}

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.facingMode = 'user';
    // Safari iOS: wajib inline & muted agar tidak membuka fullscreen dan bisa autoplay.
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.muted = true;
    videoEl.autoplay = true;
  }

  get mirrored() {
    return this.facingMode === 'user';
  }

  get width() { return this.video.videoWidth; }
  get height() { return this.video.videoHeight; }

  async start(facingMode = this.facingMode) {
    if (!window.isSecureContext) {
      throw new CameraError('insecure', 'Kamera hanya bisa dipakai lewat HTTPS (misalnya GitHub Pages) atau localhost.');
    }
    if (!cameraSupported()) {
      throw new CameraError('unsupported', 'Browser ini tidak mendukung akses kamera.');
    }
    this.stop();
    this.facingMode = facingMode;
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: CAMERA.idealWidth },
        height: { ideal: CAMERA.idealHeight },
        frameRate: { ideal: 30, max: 30 },
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Coba sekali lagi dengan constraint paling longgar.
      if (err?.name === 'OverconstrainedError') {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          throw explain(err2);
        }
      } else {
        throw explain(err);
      }
    }
    this.video.srcObject = this.stream;
    await new Promise((resolve, reject) => {
      if (this.video.readyState >= 1 && this.video.videoWidth) return resolve();
      const to = setTimeout(() => reject(new CameraError('timeout', 'Kamera tidak merespons. Coba muat ulang halaman.')), 10000);
      this.video.onloadedmetadata = () => { clearTimeout(to); resolve(); };
    });
    try {
      await this.video.play();
    } catch (err) {
      if (err?.name !== 'AbortError') throw explain(err);
    }
    // Deteksi kamera aktual (facingMode bisa diabaikan perangkat).
    const settings = this.stream.getVideoTracks()[0]?.getSettings?.() || {};
    if (settings.facingMode) this.facingMode = settings.facingMode === 'environment' ? 'environment' : 'user';
    return { width: this.width, height: this.height };
  }

  async switch() {
    return this.start(this.facingMode === 'user' ? 'environment' : 'user');
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }

  get active() {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }
}
