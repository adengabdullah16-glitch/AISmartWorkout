// Statistik dashboard + grafik repetisi 7 hari (SVG buatan sendiri, tanpa library).

export function computeStats(history) {
  const real = history.filter((h) => !h.mock);
  const totalReps = real.reduce((s, h) => s + (h.reps || 0), 0);
  const totalSec = real.reduce((s, h) => s + (h.durationSec || 0), 0);
  return {
    totalWorkouts: real.length,
    totalReps,
    totalSec,
    last: real[0] || null,
  };
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}d`;
  return `${s}d`;
}

export function formatClock(ms) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Data 7 hari terakhir (termasuk hari ini). */
export function last7Days(history, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ key: dayKey(d), label: d.toLocaleDateString('id-ID', { weekday: 'short' }).slice(0, 3), reps: 0 });
  }
  const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
  for (const h of history) {
    if (h.mock) continue;
    const k = dayKey(new Date(h.date));
    if (k in idx) days[idx[k]].reps += h.reps || 0;
  }
  return days;
}

export function renderChart(container, days) {
  const max = Math.max(...days.map((d) => d.reps), 1);
  const W = 320, H = 140, pad = 22, barW = 26;
  const gap = (W - pad * 2 - barW * days.length) / (days.length - 1);
  const bars = days.map((d, i) => {
    const x = pad + i * (barW + gap);
    const bh = d.reps ? Math.max(4, ((H - 44) * d.reps) / max) : 3;
    const y = H - 24 - bh;
    const today = i === days.length - 1;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="6" class="${d.reps ? (today ? 'bar bar-today' : 'bar') : 'bar bar-empty'}"/>
      ${d.reps ? `<text x="${x + barW / 2}" y="${y - 6}" class="bar-val">${d.reps}</text>` : ''}
      <text x="${x + barW / 2}" y="${H - 6}" class="bar-lbl${today ? ' bar-lbl-today' : ''}">${d.label}</text>`;
  }).join('');
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Repetisi 7 hari terakhir">${bars}</svg>`;
}
