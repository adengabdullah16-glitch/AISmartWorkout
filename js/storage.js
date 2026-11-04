// Penyimpanan riwayat workout.
// Saat ini memakai localStorage. Antarmuka adapter (list/add/remove/clear) sengaja
// async supaya nanti bisa diganti SupabaseAdapter tanpa mengubah kode lain.

const KEY = 'smartfit.history.v1';

function uid() {
  return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export class LocalStorageAdapter {
  _read() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  _write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }
  async list() {
    return this._read().sort((a, b) => b.date.localeCompare(a.date));
  }
  async add(session) {
    const item = { id: uid(), ...session };
    const list = this._read();
    list.push(item);
    if (!this._write(list)) throw new Error('Penyimpanan browser penuh atau diblokir (mode privat?).');
    return item;
  }
  async remove(id) {
    this._write(this._read().filter((s) => s.id !== id));
  }
  async clear() {
    this._write([]);
  }
}

// Tahap 4: SupabaseAdapter dengan antarmuka yang sama (list/add/remove/clear).
export const storage = new LocalStorageAdapter();
