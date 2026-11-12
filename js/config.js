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
  // "lite" paling ringan (default). "full" lebih akurat & stabil, tapi lebih berat (± 9 MB).
  models: {
    lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
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

// Nama parameter FSM sama untuk semua latihan (lihat js/exercises/rep-cycle.js):
//   extendAngle  : sudut >= ini = posisi lurus/awal
//   startAngle   : sudut < ini = mulai menekuk (repetisi dimulai)
//   depthAngle   : sudut <= ini = kedalaman cukup
//   shallowReportAngle : menekuk sampai di bawah ini tapi belum cukup dalam = "tidak penuh"
// Semua angka di bawah adalah NILAI AWAL dan perlu dikalibrasi dengan uji nyata.

const COMMON = {
  minVisibility: 0.55, // ambang visibilitas landmark kunci
  bottomExitMargin: 15, // histeresis keluar dari posisi bawah
  directionMargin: 10, // perubahan sudut minimal untuk dianggap berbalik arah
  minRepMs: 500, // satu repetisi tidak mungkin lebih cepat dari ini
  readyFrames: 3, // frame berturut-turut di posisi awal sebelum mulai menghitung
  lostGraceMs: 700, // toleransi kehilangan tracking sebelum repetisi dibatalkan
  cuePersistMs: 300, // masalah teknik harus bertahan selama ini sebelum dianggap nyata
  frameMargin: 0.01, // landmark harus di dalam frame
};

export const SQUAT = {
  ...COMMON,
  extendAngle: 160, // lutut >= ini = berdiri
  startAngle: 150,
  depthAngle: 100, // atau pinggul sejajar/di bawah lutut
  shallowReportAngle: 140,
  maxSideViewRatio: 0.45, // lebar bahu/pinggul dibagi panjang torso; di atas ini = menghadap kamera
  maxTorsoLean: 55, // derajat dari vertikal (v0.1: 50 — terlalu ketat untuk squat sampai paralel)
  maxFootDrift: 0.15, // geser pergelangan kaki, relatif panjang tungkai
  heelLiftRatio: 0.08, // kenaikan tumit relatif panjang tungkai (v0.1: 0.06)
  heelMinVisibility: 0.7, // tumit & ujung kaki harus terlihat jelas untuk cek tumit
};

export const PUSHUP = {
  ...COMMON,
  extendAngle: 150, // siku >= ini = posisi atas
  startAngle: 140,
  depthAngle: 100, // siku <= ini = posisi bawah cukup
  shallowReportAngle: 130,
  maxBodyTilt: 40, // garis bahu–pergelangan kaki maksimal sekian derajat dari horizontal (posisi plank)
  maxSideViewRatio: 0.6, // jarak bahu kiri-kanan dibagi panjang torso
  maxHipBend: 20, // pinggul menyimpang dari garis lurus bahu–kaki lebih dari ini = turun/naik
  maxHandOffset: 0.4, // geser pergelangan tangan dari bawah bahu, relatif panjang lengan (di posisi atas)
};

export const CURL = {
  ...COMMON,
  cuePersistMs: 250,
  extendAngle: 145, // siku >= ini = lengan turun (lurus)
  startAngle: 135,
  depthAngle: 65, // siku <= ini = posisi atas cukup
  shallowReportAngle: 105,
  fastRepMs: 1200, // satu repetisi lebih cepat dari ini = "terlalu cepat" (tetap dihitung)
  maxSideViewRatio: 0.45,
  maxStandLean: 30, // badan harus kurang lebih tegak
  maxSwing: 12, // perubahan condong badan (derajat) selama repetisi = memakai momentum
  maxElbowDrift: 35, // lengan atas maju lebih dari ini dari vertikal = siku tidak terkunci
};
