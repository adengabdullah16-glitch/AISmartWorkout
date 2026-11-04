# SmartFit AI – Personal Workout Assistant

Aplikasi web yang memakai kamera HP untuk mendeteksi pose tubuh (MediaPipe Pose Landmarker), menghitung repetisi, dan memberi koreksi gerakan secara real-time. Semua pemrosesan video berjalan di perangkat; tidak ada video yang diunggah dan tidak memakai API AI berbayar.

**Status: Tahap 1** — kamera, deteksi pose, skeleton, dan **squat counter**. Push-up & bicep curl menyusul di Tahap 2.

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
│   ├── exercises/squat.js   # finite state machine squat + analisis teknik
│   ├── coach.js             # pesan pelatih berbasis aturan + suara (id-ID)
│   ├── workout-session.js   # loop deteksi, timer, jeda/lanjut, wake lock
│   ├── storage.js           # riwayat (localStorage, siap diganti Supabase)
│   ├── dashboard.js         # statistik & grafik 7 hari (SVG)
│   └── dev/synthetic-pose.js# pose sintetis untuk uji otomatis & mode demo
└── tests/squat.test.mjs     # unit test logika (Node 18+)
```

## Cara kerja squat counter

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

- [ ] Kamera menyala, skeleton menempel di tubuh dan mengikuti gerakan.
- [ ] Angka FPS (di pojok atas) — catat berapa, dan tertulis GPU atau CPU.
- [ ] 10 squat penuh → terhitung 10? Catat selisihnya.
- [ ] 5 squat setengah → tidak terhitung dan muncul "terlalu dangkal"?
- [ ] Menghadap kamera (bukan menyamping) → muncul "Posisikan badan menyamping"?
- [ ] Jeda/Lanjutkan dan tombol ganti kamera berfungsi.
- [ ] Setelah Selesai, riwayat muncul di dashboard.

Bila hitungan meleset, ubah angka di `js/config.js` bagian `SQUAT` (misalnya `depthAngle`, `standAngle`).

## Catatan perangkat

- **iPhone/iPad:** semua browser di iOS memakai mesin WebKit. Bila deteksi macet atau skeleton tidak muncul, aktifkan *Mode kompatibilitas (CPU)* di Pengaturan lanjutan. Aplikasi juga otomatis pindah ke CPU bila GPU gagal.
- Suara pelatih memakai suara bahasa Indonesia bawaan perangkat bila tersedia.
- Layar dijaga tetap menyala selama sesi (Wake Lock) di browser yang mendukung.

## Batasan yang diketahui

- Ambang sudut adalah nilai awal dan perlu dikalibrasi dengan uji nyata.
- Penilaian teknik adalah estimasi dari kamera 2D, bukan analisis biomekanik.
- Uji otomatis memakai pose sintetis dan kamera palsu; akurasi deteksi pose nyata harus diuji di perangkat.

## Rencana tahap berikutnya

- **Tahap 2:** push-up dan bicep curl (FSM & panduan kamera masing-masing).
- **Tahap 3:** penyempurnaan sesi, riwayat & grafik progres.
- **Tahap 4:** integrasi Supabase (opsional) dan PWA "Add to Home Screen".
