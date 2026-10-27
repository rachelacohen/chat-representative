// Calendar math on 'YYYY-MM-DD' strings, in UTC so the server's time zone never shifts a date.
const DAY_MS = 86_400_000;
const toTime = (iso) => Date.parse(`${iso}T00:00:00Z`);
const fromTime = (time) => new Date(time).toISOString().slice(0, 10);

export const addDays = (iso, days) => fromTime(toTime(iso) + days * DAY_MS);

export const daysBetween = (fromIso, toIso) => Math.round((toTime(toIso) - toTime(fromIso)) / DAY_MS);

export function endOfMonth(iso) {
  const date = new Date(toTime(iso));
  return fromTime(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

// Adds whole months, clamping to the last day (Jan 31 + 1 month = Feb 28).
function addMonths(iso, months) {
  const [year, month, day] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return fromTime(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)));
}

// Whole years, months and days from start to asOf: 2023-02-10 -> 2026-10-25 is 3y 8m 15d.
// A start date after asOf (a policy that has not started) counts as zero.
export function elapsed(startIso, asOfIso) {
  if (startIso > asOfIso) return { years: 0, months: 0, days: 0, totalMonths: 0 };
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = asOfIso.split('-').map(Number);
  const totalMonths = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: daysBetween(addMonths(startIso, totalMonths), asOfIso),
    totalMonths,
  };
}
