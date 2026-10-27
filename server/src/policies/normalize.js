// Turns a raw policy record (a CSV row today, a policy-system API record later) into the
// single shape the rules engine reads. Hebrew source values become English enums here and
// nowhere else, so no other module compares Hebrew strings.

const STATUS = { 'פעילה': 'active', 'מבוטלת': 'cancelled', 'מוקפאת': 'frozen' };
const PRODUCT = { 'רכב': 'car', 'דירה': 'home', 'בריאות': 'health', 'נסיעות': 'travel' };

// Accepts ISO (2026-10-01) or day/month/year with slashes (01/10/2026) and returns
// 'YYYY-MM-DD', or null when the value is not a real calendar date.
export function parseDate(value) {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !dmy) return null;
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]].map(Number) : [dmy[3], dmy[2], dmy[1]].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.toISOString().slice(0, 10) : null;
}

function parseNumber(value) {
  const text = String(value ?? '').trim();
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

const text = (value) => String(value ?? '').trim();

// A field that cannot be parsed becomes null and is listed in dataWarnings; the rules
// engine treats null as missing data rather than guessing.
export function normalizePolicy(raw) {
  const dataWarnings = [];
  const field = (name, value, parse) => {
    const parsed = parse(value) ?? null;
    if (parsed === null) dataWarnings.push({ field: name, value: text(value) });
    return parsed;
  };

  return {
    policyId: text(raw.policy_id),
    customerId: text(raw.customer_id),
    customerName: text(raw.customer_name).replace(/\s+/g, ' '),
    product: field('product', raw.product, (v) => PRODUCT[text(v)]),
    status: field('status', raw.status, (v) => STATUS[text(v)]),
    startDate: field('startDate', raw.start_date, parseDate),
    lastPaymentDate: field('lastPaymentDate', raw.last_payment_date, parseDate),
    monthlyPremium: field('monthlyPremium', raw.monthly_premium, parseNumber),
    openClaims: field('openClaims', raw.open_claims, parseNumber),
    notes: text(raw.notes),
    dataWarnings,
  };
}
