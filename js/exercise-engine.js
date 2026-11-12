// Registri latihan. Tiap latihan punya analyzer dengan antarmuka yang sama:
//   update(frame) → { valid, issue, state, reps, events, cues, metrics, viz, stats }
//   reset(), rearm()
// plus teks pelatih, panduan posisi kamera, dan catatan ringkasan.

import { SquatAnalyzer } from './exercises/squat.js';
import { PushupAnalyzer } from './exercises/pushup.js';
import { CurlAnalyzer } from './exercises/curl.js';

// --------------------------- ilustrasi panduan kamera ---------------------------
const PHONE_STAND = `
  <rect x="34" y="78" width="24" height="44" rx="5" class="g-phone"/>
  <circle cx="46" cy="86" r="2.5" class="g-lens"/>
  <path d="M40 122 l-8 28 M52 122 l8 28" class="g-stand"/>`;

const ART = {
  squat: `<svg viewBox="0 0 320 170">
    <line x1="10" y1="150" x2="310" y2="150" class="g-floor"/>${PHONE_STAND}
    <path d="M58 92 L250 20 M58 92 L250 152" class="g-sight"/>
    <circle cx="226" cy="54" r="10" class="g-head"/>
    <path d="M222 66 L206 100 L232 112 L222 148 M221 74 L246 88 M222 148 L238 148" class="g-body"/>
    <path d="M58 162 L210 162" class="g-dim"/><text x="134" y="158" class="g-txt">2–3 m</text>
  </svg>`,
  pushup: `<svg viewBox="0 0 320 170">
    <line x1="10" y1="150" x2="310" y2="150" class="g-floor"/>
    <rect x="30" y="118" width="16" height="30" rx="4" class="g-phone"/>
    <circle cx="38" cy="125" r="2.2" class="g-lens"/>
    <path d="M46 128 L300 70 M46 128 L300 150" class="g-sight"/>
    <circle cx="272" cy="96" r="9" class="g-head"/>
    <path d="M258 104 L140 132 L134 148 M258 104 L262 126 L260 148" class="g-body"/>
    <path d="M46 162 L190 162" class="g-dim"/><text x="118" y="158" class="g-txt">1,5–2 m</text>
  </svg>`,
  curl: `<svg viewBox="0 0 320 170">
    <line x1="10" y1="150" x2="310" y2="150" class="g-floor"/>${PHONE_STAND}
    <path d="M58 92 L250 20 M58 92 L250 152" class="g-sight"/>
    <circle cx="222" cy="40" r="10" class="g-head"/>
    <path d="M220 52 L220 104 L222 148 M220 60 L222 86 L240 70 M222 148 L238 148" class="g-body"/>
    <rect x="234" y="62" width="14" height="7" rx="2" class="g-phone"/>
    <path d="M58 162 L210 162" class="g-dim"/><text x="134" y="158" class="g-txt">2 m</text>
  </svg>`,
};

// --------------------------- teks umum ---------------------------
const COMMON_ISSUES = {
  no_pose: 'Tubuh belum terdeteksi. Pastikan tubuh masuk layar.',
  body_not_visible: 'Bagian tubuh penting tidak terlihat jelas. Mundur sedikit atau perbaiki cahaya.',
  out_of_frame: 'Sebagian tubuh keluar layar. Mundur atau atur posisi HP.',
};

export const EXERCISES = {
  squat: {
    id: 'squat',
    name: 'Squat',
    available: true,
    muscles: 'Paha, bokong, core',
    defaultTarget: 10,
    create: () => new SquatAnalyzer(),
    angleLabel: 'Sudut lutut',
    stateLabels: { NEED_READY: 'Bersiap', TOP: 'Berdiri', DOWN: 'Turun', BOTTOM: 'Posisi bawah', UP: 'Naik' },
    messages: {
      issues: {
        ...COMMON_ISSUES,
        body_not_visible: 'Kepala sampai kaki harus terlihat. Mundur sedikit dari kamera.',
        wrong_view: 'Posisikan badan menyamping ke kamera.',
      },
      states: {
        NEED_READY: 'Berdiri tegak menyamping untuk memulai.',
        TOP: 'Siap. Turun perlahan.',
        DOWN: 'Turun… pinggul ke belakang.',
        BOTTOM: 'Kedalaman cukup. Dorong naik!',
        UP: 'Naik sampai berdiri tegak.',
      },
      cues: {
        lean: { text: 'Jaga punggung tetap stabil, dada lebih tegak.', speak: 'Dada lebih tegak' },
        unstable: { text: 'Kaki bergeser. Pertahankan posisi tubuh.', speak: 'Jaga posisi kaki' },
        heel: { text: 'Tumit terangkat. Tekan tumit ke lantai.', speak: 'Tekan tumit' },
      },
      ready: 'Siap! Mulai squat.',
      shallow: 'Terlalu dangkal — tidak dihitung. Turunkan pinggul sampai sejajar lutut.',
      shallowSpeak: 'Terlalu dangkal',
      shallowWarning: 'Turunkan tubuh sedikit lagi.',
      aborted: 'Tracking terputus, repetisi dibatalkan. Berdiri tegak lagi.',
    },
    notes: {
      zeroReps: 'Belum ada repetisi terhitung. Pastikan tubuh terlihat utuh dari samping dan turun sampai pinggul kira-kira sejajar lutut.',
      shallow: 'gerakan terlalu dangkal sehingga tidak dihitung',
      flags: {
        lean: 'badan terlalu condong ke depan — jaga dada tetap tegak',
        unstable: 'kaki bergeser — jaga posisi kaki tetap',
        heel: 'tumit terangkat — tekan tumit ke lantai',
      },
    },
    guide: {
      title: 'Posisi kamera untuk squat',
      art: ART.squat,
      steps: [
        'Letakkan HP tegak setinggi pinggang (atau di lantai bersandar), jarak sekitar 2–3 meter.',
        'Berdiri MENYAMPING ke kamera. Kepala sampai kaki harus terlihat.',
        'Gunakan ruangan terang; hindari cahaya kuat dari belakang tubuh.',
        'Pakai pakaian yang tidak terlalu longgar agar lutut dan pinggul terbaca.',
      ],
      note: 'Hitungan hanya berjalan saat tubuh terlihat utuh dari samping.',
    },
  },

  pushup: {
    id: 'pushup',
    name: 'Push-up',
    available: true,
    muscles: 'Dada, trisep, bahu',
    defaultTarget: 10,
    create: () => new PushupAnalyzer(),
    angleLabel: 'Sudut siku',
    stateLabels: { NEED_READY: 'Bersiap', TOP: 'Posisi atas', DOWN: 'Turun', BOTTOM: 'Posisi bawah', UP: 'Dorong naik' },
    messages: {
      issues: {
        ...COMMON_ISSUES,
        body_not_visible: 'Bahu, siku, tangan, pinggul, dan kaki harus terlihat. Geser HP sedikit menjauh.',
        wrong_view: 'Letakkan HP di SAMPING tubuh, bukan di depan kepala.',
        not_plank: 'Ambil posisi push-up (plank) dengan tubuh menyamping ke kamera.',
      },
      states: {
        NEED_READY: 'Ambil posisi plank, lengan lurus, tubuh menyamping ke kamera.',
        TOP: 'Siap. Turunkan dada perlahan.',
        DOWN: 'Turun… siku menekuk.',
        BOTTOM: 'Bagus, cukup dalam. Dorong naik!',
        UP: 'Dorong sampai lengan lurus.',
      },
      cues: {
        hip_sag: { text: 'Pinggul terlalu turun. Kencangkan perut, tubuh lurus.', speak: 'Angkat pinggul' },
        hip_pike: { text: 'Pinggul terlalu tinggi. Turunkan sampai tubuh lurus.', speak: 'Turunkan pinggul' },
        hands: { text: 'Letakkan tangan tepat di bawah bahu.', speak: 'Tangan di bawah bahu' },
      },
      ready: 'Siap! Mulai push-up.',
      shallow: 'Kurang dalam — tidak dihitung. Turunkan dada sampai siku sekitar 90°.',
      shallowSpeak: 'Kurang dalam',
      shallowWarning: 'Turunkan dada sedikit lagi.',
      aborted: 'Tracking terputus, repetisi dibatalkan. Kembali ke posisi atas.',
    },
    notes: {
      zeroReps: 'Belum ada repetisi terhitung. Pastikan HP di samping tubuh, seluruh badan terlihat, dan dada turun sampai siku sekitar 90°.',
      shallow: 'push-up kurang dalam sehingga tidak dihitung',
      flags: {
        hip_sag: 'pinggul terlalu turun — kencangkan perut agar tubuh lurus',
        hip_pike: 'pinggul terlalu tinggi — turunkan sampai tubuh membentuk garis lurus',
        hands: 'tangan tidak di bawah bahu — atur posisi tangan',
      },
    },
    guide: {
      title: 'Posisi kamera untuk push-up',
      art: ART.pushup,
      steps: [
        'Letakkan HP di LANTAI, berdiri tegak bersandar, sekitar 1,5–2 meter di samping tubuh.',
        'Tubuh menyamping ke kamera: kepala di satu sisi layar, kaki di sisi lain.',
        'Pastikan bahu, siku, tangan, pinggul, dan kaki terlihat.',
        'Mulai dari posisi atas (lengan lurus) agar aplikasi bisa mengunci posisi awal.',
      ],
      note: 'Push-up lutut bisa terhitung, tetapi penilaian garis tubuh dirancang untuk push-up penuh.',
    },
  },

  curl: {
    id: 'curl',
    name: 'Bicep Curl',
    available: true,
    muscles: 'Bisep, lengan bawah',
    defaultTarget: 12,
    create: () => new CurlAnalyzer(),
    angleLabel: 'Sudut siku',
    stateLabels: { NEED_READY: 'Bersiap', TOP: 'Lengan turun', DOWN: 'Angkat', BOTTOM: 'Posisi atas', UP: 'Turunkan' },
    messages: {
      issues: {
        ...COMMON_ISSUES,
        body_not_visible: 'Bahu, siku, tangan, dan pinggul harus terlihat jelas.',
        wrong_view: 'Berdiri menyamping ke kamera.',
        not_standing: 'Berdiri tegak untuk bicep curl.',
      },
      states: {
        NEED_READY: 'Berdiri tegak menyamping, lengan lurus ke bawah.',
        TOP: 'Siap. Angkat beban perlahan.',
        DOWN: 'Angkat… siku tetap di samping badan.',
        BOTTOM: 'Puncak! Turunkan perlahan.',
        UP: 'Turunkan sampai lengan lurus.',
      },
      cues: {
        swing: { text: 'Badan berayun. Jangan memakai momentum tubuh.', speak: 'Jangan berayun' },
        elbow: { text: 'Siku maju. Jaga siku tetap di samping badan.', speak: 'Siku di samping badan' },
        fast: { text: 'Gerakan terlalu cepat. Angkat dan turunkan lebih pelan.', speak: 'Lebih pelan' },
      },
      ready: 'Siap! Mulai curl.',
      shallow: 'Angkatan belum penuh — tidak dihitung. Tekuk siku sampai beban dekat bahu.',
      shallowSpeak: 'Belum penuh',
      shallowWarning: 'Angkat sedikit lagi.',
      aborted: 'Tracking terputus, repetisi dibatalkan. Luruskan lengan lagi.',
    },
    notes: {
      zeroReps: 'Belum ada repetisi terhitung. Pastikan berdiri menyamping dengan lengan yang dilatih menghadap kamera, dan angkat sampai beban dekat bahu.',
      shallow: 'angkatan belum penuh sehingga tidak dihitung',
      flags: {
        swing: 'badan berayun (memakai momentum) — kurangi beban atau perlambat',
        elbow: 'siku maju — jaga siku tetap di samping badan',
        fast: 'gerakan terlalu cepat — targetkan sekitar 2 detik naik dan 2 detik turun',
      },
    },
    guide: {
      title: 'Posisi kamera untuk bicep curl',
      art: ART.curl,
      steps: [
        'Letakkan HP tegak setinggi dada atau pinggang, sekitar 2 meter dari tubuh.',
        'Berdiri MENYAMPING. Lengan yang dihitung adalah lengan yang menghadap kamera.',
        'Untuk curl bergantian, hitungan hanya mengikuti lengan yang menghadap kamera.',
        'Bahu, siku, pergelangan tangan, dan pinggul harus terlihat.',
      ],
      note: 'Deteksi momentum adalah perkiraan dari gerakan badan dan kecepatan, bukan analisis biomekanik.',
    },
  },
};

export function getExercise(id) {
  return EXERCISES[id] || null;
}
