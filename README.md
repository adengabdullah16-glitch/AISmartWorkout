# SmartFit AI – Personal Workout Assistant

Aplikasi web yang memakai kamera HP untuk mendeteksi pose tubuh (MediaPipe Pose Landmarker), menghitung repetisi, dan memberi koreksi gerakan secara real-time. Semua pemrosesan video berjalan di perangkat; tidak ada video yang diunggah dan tidak memakai API AI berbayar.

**Status: Tahap 2** — kamera, deteksi pose, skeleton, serta penghitung & koreksi untuk **squat, push-up, dan dumbbell bicep curl**.

> SmartFit AI adalah alat bantu latihan, bukan alat medis. Aplikasi ini tidak mendeteksi cedera dan tidak menjamin keamanan gerakan.

## Struktur

```
smartfit-ai/
├── index.html               # semua tampilan (dashboard, panduan, sesi, ringkasan)
├── css/style.css            # dark mode, mobile-first
├── assets/icon.svg
├── js/
│   ├── app.js               # navigasi & pengikatan UI
│   ├── config.js            # versi MediaPipe, URL model, SEMUA ambang sudut (kalibrasi di sini)
│   ├── camera.js            # getUserMedia, kamera depan/belakang, pesan error
│   ├── pose-detection.js    # MediaPipe, GPU → fallback CPU otomatis
│   ├── geometry.js          # sudut 3 titik, One Euro Filter, cek visibilitas
│   ├── skeleton-renderer.js # gambar skeleton & busur sudut di canvas
│   ├── exercise-engine.js   # registri latihan + panduan posisi kamera
│   ├── exercises/rep-cycle.js # FSM penghitung repetisi umum + penyaring noise teknik
│   ├── exercises/squat.js   # squat: sudut lutut, condong badan, kaki, tumit
│   ├── exercises/pushup.js  # push-up: sudut siku, garis tubuh, posisi tangan
│   ├── exercises/curl.js    # bicep curl: sudut siku, ayunan badan, siku maju, kecepatan
│   ├── coach.js             # pesan pelatih berbasis aturan + suara (id-ID)
│   ├── workout-session.js   # loop deteksi, timer, jeda/lanjut, wake lock
│   ├── storage.js           # riwayat (localStorage, siap diganti Supabase)
│   ├── dashboard.js         # statistik & grafik 7 hari (SVG)
│   └── dev/synthetic-pose.js# pose sintetis untuk uji otomatis & mode demo
└── tests/                  # unit test logika (Node 18+)
```

## Cara kerja penghitung repetisi

Ketiga latihan memakai FSM yang sama (`rep-cycle.js`) pada satu sudut sendi utama:
`lurus → menekuk → cukup dalam → lurus lagi = 1 repetisi`. Repetisi hanya dihitung saat kembali lurus
setelah mencapai kedalaman, jadi goyangan di posisi bawah tidak dihitung dua kali. Peringatan teknik baru
dicatat bila bertahan minimal 0,25–0,3 detik, supaya loncatan landmark sesaat tidak dianggap kesalahan.

| Latihan | Sudut utama | Dihitung bila | Peringatan teknik |
|---|---|---|---|
| Squat | lutut | lutut ≤ 100° atau pinggul sejajar lutut | badan terlalu condong, kaki bergeser, tumit terangkat |
| Push-up | siku | siku ≤ 100° | pinggul terlalu turun / terlalu tinggi, tangan tidak di bawah bahu |
| Bicep curl | siku | siku ≤ 65° | badan berayun (momentum), siku maju, repetisi < 1,2 detik |

### Detail squat

1. Memilih sisi tubuh yang paling terlihat (kiri/kanan).
2. Menolak penilaian bila landmark bahu–pinggul–lutut–pergelangan kaki tidak jelas (`minVisibility`), keluar frame, atau pengguna **tidak menyamping** ke kamera.
3. Sudut lutut dihitung dalam piksel (bukan koordinat 0–1) agar tidak terdistorsi rasio layar.
4. FSM: `Bersiap → Berdiri → Turun → Posisi bawah → Naik → Berdiri (+1)`. Repetisi hanya dihitung saat kembali berdiri setelah mencapai kedalaman (lutut ≤ 100° **atau** pinggul sejajar/di bawah lutut), sehingga goyangan di posisi bawah tidak dihitung dua kali.
5. Turun tapi kurang dalam → "terlalu dangkal", tidak dihitung. Tracking hilang > 0,7 detik → repetisi dibatalkan dan harus berdiri lagi.
6. Peringatan teknik: badan terlalu condong, kaki bergeser, tumit terangkat.

## Menjalankan di komputer

Kamera hanya boleh diakses dari **HTTPS** atau **localhost**.

```bash
cd smartfit-ai
python3 -m http.server 8000
# buka http://localhost:8000 (webcam laptop)
```

Mode demo tanpa kamera (pose sintetis, untuk melihat alur UI): `http://localhost:8000/?mock=1` atau tombol *Coba mode demo* di Pengaturan lanjutan. Sesi demo diberi label DEMO dan tidak masuk statistik.

Unit test logika: `npm test` (butuh Node 18+, tanpa dependensi).

## Deploy ke GitHub Pages (untuk dicoba di HP)

1. Buat repository baru di GitHub, misalnya `smartfit-ai`.
2. Unggah seluruh isi folder ini ke root repository (lewat *Add file → Upload files*, atau `git push`).
3. Buka **Settings → Pages**, pilih *Deploy from a branch*, branch `main`, folder `/ (root)`, lalu **Save**.
4. Tunggu 1–2 menit. Situs tersedia di `https://<username>.github.io/smartfit-ai/`.
5. Buka alamat itu di Chrome (Android) atau Safari (iPhone/iPad), lalu izinkan kamera.

Pertama kali dibuka, browser mengunduh pustaka MediaPipe dan model pose (± 5 MB), jadi perlu internet.

## Checklist uji di HP (mohon laporkan hasilnya)

Umum:
- [ ] Angka FPS (di pojok atas) — catat berapa, dan tertulis GPU atau CPU.
- [ ] Skeleton menempel di tubuh dan mengikuti gerakan (coba juga opsi *Akurasi tinggi*).
- [ ] Jeda/Lanjutkan dan tombol ganti kamera berfungsi; riwayat muncul setelah Selesai.

Per latihan (lakukan 10 gerakan penuh + 5 gerakan setengah):

| | Squat | Push-up | Bicep curl |
|---|---|---|---|
| 10 penuh → terhitung berapa? | | | |
| 5 setengah ditolak? | | | |
| "Teknik baik" berapa? | | | |
| Peringatan apa yang muncul? (lihat Riwayat) | | | |

Bila hitungan meleset, ubah angka di `js/config.js` (bagian `SQUAT`, `PUSHUP`, `CURL`), misalnya `depthAngle` atau `extendAngle`.

## Catatan perangkat

- **iPhone/iPad:** semua browser di iOS memakai mesin WebKit. Bila deteksi macet atau skeleton tidak muncul, aktifkan *Mode kompatibilitas (CPU)* di Pengaturan lanjutan. Aplikasi juga otomatis pindah ke CPU bila GPU gagal.
- Suara pelatih memakai suara bahasa Indonesia bawaan perangkat bila tersedia.
- Layar dijaga tetap menyala selama sesi (Wake Lock) di browser yang mendukung.

## Batasan yang diketahui

- Ambang sudut adalah nilai awal dan perlu dikalibrasi dengan uji nyata.
- Bicep curl hanya menghitung lengan yang menghadap kamera; pada curl bergantian, lengan yang jauh tidak dihitung.
- Push-up memerlukan HP di lantai di samping tubuh; dari depan kepala, sudut siku tidak terbaca akurat.
- Penilaian teknik adalah estimasi dari kamera 2D, bukan analisis biomekanik.
- Uji otomatis memakai pose sintetis dan kamera palsu; akurasi deteksi pose nyata harus diuji di perangkat.

## Rencana tahap berikutnya

- **Tahap 3:** penyempurnaan sesi, riwayat & grafik progres.
- **Tahap 4:** integrasi Supabase (opsional) dan PWA "Add to Home Screen".
