// Konfigurasi global SmartFit AI.
// Semua angka ambang (threshold) dikumpulkan di sini supaya mudah dikalibrasi.

export const MEDIAPIPE = {
  // Versi dipin agar perilaku tidak berubah diam-diam saat ada rilis baru.
  version: '1.2.2',
  get bundleUrl() {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${this.version}/vision_bundle.mjs`;
  },
  get wasmBase() {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${this.version}/wasm`;
  },
  // Model "lite": paling ringan, cocok untuk HP.
  modelUrl:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  loadTimeoutMs: 45000,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

export const CAMERA = {
  // Resolusi sedang: cukup untuk pose, ringan untuk HP.
  idealWidth: 640,
  idealHeight: 480,
};

export const SMOOTHING = {
  // Parameter One Euro Filter (koordinat ternormalisasi 0..1).
  minCutoff: 1.2, // makin kecil = makin halus tapi makin lambat
  beta: 0.6, // makin besar = makin responsif saat gerak cepat
  dCutoff: 1.0,
  resetGapMs: 500, // filter di-reset bila tidak ada pose selama ini
};

export const SQUAT = {
  minVisibility: 0.55, // ambang visibilitas landmark kunci
  standAngle: 160, // lutut >= ini dianggap berdiri
  startDescentAngle: 150, // lutut < ini dianggap mulai turun
  depthAngle: 100, // lutut <= ini dianggap kedalaman cukup
  bottomExitMargin: 15, // histeresis keluar dari posisi bawah
  shallowReportAngle: 140, // turun sampai di bawah ini tapi belum cukup dalam = "terlalu dangkal"
  directionMargin: 10, // perubahan sudut minimal untuk dianggap berbalik arah
  minRepMs: 500, // satu repetisi tidak mungkin lebih cepat dari ini
  standConfirmFrames: 3,
  lostGraceMs: 700, // toleransi kehilangan tracking sebelum repetisi dibatalkan
  maxSideViewRatio: 0.45, // lebar bahu/pinggul dibagi panjang torso; di atas ini = menghadap kamera
  maxTorsoLean: 50, // derajat dari vertikal
  maxFootDrift: 0.15, // geser pergelangan kaki, relatif panjang tungkai
  heelLiftRatio: 0.06, // kenaikan tumit relatif panjang tungkai
  frameMargin: 0.01, // landmark harus di dalam frame
};
