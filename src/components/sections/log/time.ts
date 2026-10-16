// Date formatting for the survey log. Own month names (en-GB now prints "Sept").

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const IST_OFFSET_MS = 330 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09-05T17:56:09Z" → "05 Sep 2026 · 23:26 IST" */
export function formatIST(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + IST_OFFSET_MS);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} IST`;
}

/** "5 wk ago" */
export function relative(iso: string, now: number) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = diff / 60000;
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)} min ago`;
  const h = min / 60;
  if (h < 24) return `${Math.floor(h)} h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)} d ago`;
  if (d < 60) return `${Math.floor(d / 7)} wk ago`;
  if (d < 365) return `${Math.floor(d / 30.44)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

function parseDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** "2026-06-11" → "11 Jun" */
export function shortDay(date: string) {
  const d = parseDay(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-06-11" → "11 Jun 2026" */
export function fullDay(date: string) {
  const d = parseDay(date);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2026-06-11" → "Thu 11 Jun 2026" */
export function longDay(date: string) {
  const d = parseDay(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${fullDay(date)}`;
}

/** 365 empty days ending on `now`: the survey grid before any data arrives. */
export function emptyYear(now: Date) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(end - i * 86400000);
    days.push({ date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, count: 0 });
  }
  return days;
}
