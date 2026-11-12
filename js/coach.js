// AI Workout Coach berbasis aturan (tanpa LLM / API berbayar).
// Mengubah hasil analisis menjadi satu pesan yang stabil (tidak berkedip) + suara opsional.
// Teks pesan berasal dari definisi latihan (exercise-engine.js).

export class Coach {
  /** @param {{messages: object, speech?: boolean}} o */
  constructor({ messages, speech = true }) {
    this.m = messages;
    this.speechEnabled = speech && 'speechSynthesis' in globalThis;
    this.current = { text: messages.states.NEED_READY, tone: 'info' };
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
    const m = this.m;
    // 1) Event: prioritas tertinggi
    for (const ev of result.events || []) {
      if (ev.type === 'rep') {
        const cue = ev.flags.length ? m.cues[ev.flags[0]] : null;
        const msg = cue
          ? { text: `Repetisi ${ev.count} terhitung. ${cue.text}`, tone: 'warn' }
          : { text: `Bagus! Repetisi ${ev.count} berhasil.`, tone: 'good' };
        this._show(msg, now, 1600);
        this.say(String(ev.count), now, true);
      } else if (ev.type === 'shallow') {
        this._show({ text: m.shallow, tone: 'warn' }, now, 2200);
        this.say(m.shallowSpeak, now, true);
      } else if (ev.type === 'shallow_warning') {
        this._show({ text: m.shallowWarning, tone: 'warn' }, now, 1200);
      } else if (ev.type === 'too_fast') {
        this._show({ text: 'Gerakan terlalu cepat — tidak dihitung. Lakukan lebih terkontrol.', tone: 'warn' }, now, 1800);
      } else if (ev.type === 'aborted') {
        this._show({ text: m.aborted, tone: 'warn' }, now, 2000);
      } else if (ev.type === 'ready') {
        this._show({ text: m.ready, tone: 'good' }, now, 1000);
        this.say('Siap', now);
      }
    }

    if (now < this.holdUntil) return this.current;

    // 2) Masalah tracking/posisi kamera
    if (!result.valid) {
      if (this.lastIssueSince === null) this.lastIssueSince = now;
      // tunggu sebentar agar gangguan sesaat tidak langsung memunculkan peringatan
      if (now - this.lastIssueSince > 400) {
        this.current = { text: m.issues[result.issue] || m.issues.no_pose, tone: 'warn' };
      }
      return this.current;
    }
    this.lastIssueSince = null;

    // 3) Koreksi teknik
    if (result.cues?.length) {
      const cue = m.cues[result.cues[0]];
      if (cue) {
        this._show({ text: cue.text, tone: 'warn' }, now, 1200);
        this.say(cue.speak, now);
        return this.current;
      }
    }

    // 4) Panduan fase gerakan
    const tone = result.state === 'BOTTOM' ? 'good' : 'info';
    this.current = { text: m.states[result.state] || this.current.text, tone };
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
