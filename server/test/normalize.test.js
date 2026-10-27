import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePolicy, parseDate } from '../src/policies/normalize.js';

test('parseDate reads ISO and day/month/year', () => {
  assert.equal(parseDate('2026-10-01'), '2026-10-01');
  assert.equal(parseDate('01/10/2026'), '2026-10-01');
  assert.equal(parseDate('15/03/2023'), '2023-03-15');
  assert.equal(parseDate(' 2/7/2024 '), '2024-07-02');
});

test('parseDate rejects text and impossible dates', () => {
  for (const value of ['', 'abc', '31/02/2026', '2026-13-01', '2026/10/01', null, undefined]) {
    assert.equal(parseDate(value), null, `value ${value}`);
  }
});

const raw = {
  policy_id: '4471',
  customer_id: 'C-1088',
  customer_name: 'רונן  אביטל',
  product: 'רכב',
  start_date: '2023-02-10',
  monthly_premium: '410',
  status: 'פעילה',
  last_payment_date: '2026-10-05',
  open_claims: '0',
  notes: '',
};

test('normalizePolicy maps Hebrew values to enums and numbers', () => {
  assert.deepEqual(normalizePolicy(raw), {
    policyId: '4471',
    customerId: 'C-1088',
    customerName: 'רונן אביטל',
    product: 'car',
    status: 'active',
    startDate: '2023-02-10',
    lastPaymentDate: '2026-10-05',
    monthlyPremium: 410,
    openClaims: 0,
    notes: '',
    dataWarnings: [],
  });
});

test('normalizePolicy turns unknown values into null with a warning', () => {
  const policy = normalizePolicy({ ...raw, product: 'חיים', status: '', start_date: '2023-02-30', monthly_premium: 'אין' });
  assert.equal(policy.product, null);
  assert.equal(policy.status, null);
  assert.equal(policy.startDate, null);
  assert.equal(policy.monthlyPremium, null);
  assert.deepEqual(
    policy.dataWarnings.map((w) => w.field),
    ['product', 'status', 'startDate', 'monthlyPremium'],
  );
});
