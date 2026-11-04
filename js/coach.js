// AI Workout Coach berbasis aturan (tanpa LLM / API berbayar).
// Mengubah hasil analisis menjadi satu pesan yang stabil (tidak berkedip) + suara opsional.

const ISSUE_MSG = {
  no_pose: { text: 'Tubuh belum terdeteksi. Pastikan seluruh badan masuk layar.', tone: 'warn' },
  body_not_visible: { text: 'Kepala sampai kaki harus terlihat. Mundur sedikit dari kamera.', tone: 'warn' },
  out_of_frame: { text: 'Sebagian tubuh keluar layar. Mundur atau atur posisi HP.', tone: 'warn' },
  wrong_view: { text: 'Posisikan badan menyamping ke kamera.', tone: 'warn' },
};

const CUE_MSG = {
  lean: { text: 'Jaga punggung tetap stabil, dada lebih tegak.', tone: 'warn', speak: 'Dada lebih tegak' },
  unstable: { text: 'Kaki bergeser. Pertahankan posisi tubuh.', tone: 'warn', speak: 'Jaga posisi kaki' },
  heel: { text: 'Tumit terangkat. Tekan tumit ke lantai.', tone: 'warn', speak: 'Tekan tumit' },
};

const STATE_MSG = {
  NEED_STAND: { text: 'Berdiri tegak menyamping untuk memulai.', tone: 'info' },
  STAND: { text: 'Siap. Turun perlahan.', tone: 'info' },
  DOWN: { text: 'Turun… pinggul ke belakang.', tone: 'info' },
  BOTTOM: { text: 'Kedalaman cukup. Dorong naik!', tone: 'good' },
  UP: { text: 'Naik sampai berdiri tegak.', tone: 'info' },
};

export class Coach {
  constructor({ speech = true } = {}) {
    this.speechEnabled = speech && 'speechSynthesis' in globalThis;
    this.current = STATE_MSG.NEED_STAND;
    this.holdUntil = 0; // pesan penting ditahan beberapa saat
    this.lastSpoken = 0;
    this.lastIssueSince = null;
    this.voice = null;
    this._pickVoice();
  }

  setSpeech(on) {
    this.speechEnabled = on && 'speechSynthesis' in globalThis;
    if (!this.speechEnabled) this.cancelSpeech();
  }

  /** Dipanggil dari gesture pengguna (tombol Mulai) agar Safari mengizinkan suara. */
  unlockSpeech() {
    if (!('speechSynthesis' in globalThis)) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch { /* abaikan */ }
  }

  cancelSpeech() {
    try { globalThis.speechSynthesis?.cancel(); } catch { /* abaikan */ }
  }

  /** @returns {{text:string, tone:'info'|'good'|'warn'}} */
  process(result, now) {
    // 1) Event repetisi: prioritas tertinggi
    for (const ev of result.events || []) {
      if (ev.type === 'rep') {
        const msg = ev.flags.length
          ? { text: `Repetisi ${ev.count} terhitung. ${CUE_MSG[ev.flags[0]].text}`, tone: 'warn' }
          : { text: `Bagus! Repetisi ${ev.count} berhasil.`, tone: 'good' };
        this._show(msg, now, 1600);
        this.say(String(ev.count), now, true);
      } else if (ev.type === 'shallow') {
        this._show({ text: 'Terlalu dangkal — tidak dihitung. Turunkan pinggul sampai sejajar lutut.', tone: 'warn' }, now, 2200);
        this.say('Terlalu dangkal', now, true);
      } else if (ev.type === 'shallow_warning') {
        this._show({ text: 'Turunkan tubuh sedikit lagi.', tone: 'warn' }, now, 1200);
      } else if (ev.type === 'too_fast') {
        this._show({ text: 'Gerakan terlalu cepat. Lakukan lebih terkontrol.', tone: 'warn' }, now, 1800);
      } else if (ev.type === 'aborted') {
        this._show({ text: 'Tracking terputus, repetisi dibatalkan. Berdiri tegak lagi.', tone: 'warn' }, now, 2000);
      } else if (ev.type === 'ready') {
        this._show({ text: 'Siap! Mulai squat.', tone: 'good' }, now, 1000);
        this.say('Siap', now);
      }
    }

    if (now < this.holdUntil) return this.current;

    // 2) Masalah tracking/posisi kamera
    if (!result.valid) {
      if (this.lastIssueSince === null) this.lastIssueSince = now;
      // tunggu sebentar agar gangguan sesaat tidak langsung memunculkan peringatan
      if (now - this.lastIssueSince > 400) {
        this.current = ISSUE_MSG[result.issue] || ISSUE_MSG.no_pose;
      }
      return this.current;
    }
    this.lastIssueSince = null;

    // 3) Koreksi teknik saat repetisi
    if (result.cues?.length) {
      const cue = CUE_MSG[result.cues[0]];
      this._show(cue, now, 1200);
      this.say(cue.speak, now);
      return this.current;
    }

    // 4) Panduan fase gerakan
    this.current = STATE_MSG[result.state] || this.current;
    return this.current;
  }

  _show(msg, now, holdMs) {
    this.current = msg;
    this.holdUntil = now + holdMs;
  }

  say(text, now, important = false) {
    if (!this.speechEnabled || !text) return;
    if (!important && now - this.lastSpoken < 2500) return;
    try {
      if (important) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'id-ID';
      if (this.voice) u.voice = this.voice;
      u.rate = 1.05;
      speechSynthesis.speak(u);
      this.lastSpoken = now;
    } catch { /* abaikan */ }
  }

  _pickVoice() {
    if (!('speechSynthesis' in globalThis)) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.voice = voices.find((v) => v.lang?.toLowerCase().startsWith('id')) || null;
    };
    pick();
    try { speechSynthesis.addEventListener?.('voiceschanged', pick); } catch { /* abaikan */ }
  }
}
