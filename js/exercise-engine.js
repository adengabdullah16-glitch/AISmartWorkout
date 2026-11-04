// Registri latihan. Tiap latihan punya analyzer dengan antarmuka yang sama:
//   update(frame) → { valid, issue, state, reps, events, cues, metrics, stats }
//   reset(), rearm()
// Push-up dan bicep curl ditambahkan di Tahap 2 dengan antarmuka yang sama.

import { SquatAnalyzer } from './exercises/squat.js';

export const EXERCISES = {
  squat: {
    id: 'squat',
    name: 'Squat',
    available: true,
    muscles: 'Paha, bokong, core',
    defaultTarget: 10,
    create: () => new SquatAnalyzer(),
    primaryAngle: { label: 'Sudut lutut', key: 'kneeAngle' },
    stateLabels: {
      NEED_STAND: 'Bersiap', STAND: 'Berdiri', DOWN: 'Turun', BOTTOM: 'Posisi bawah', UP: 'Naik',
    },
    guide: {
      title: 'Posisi kamera untuk squat',
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
    available: false,
    muscles: 'Dada, trisep, bahu',
    defaultTarget: 10,
  },
  curl: {
    id: 'curl',
    name: 'Bicep Curl',
    available: false,
    muscles: 'Bisep, lengan bawah',
    defaultTarget: 12,
  },
};

export function getExercise(id) {
  return EXERCISES[id] || null;
}
