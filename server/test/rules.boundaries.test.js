// Edge cases around every threshold in the policies, on made-up policies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPolicy } from '../src/rules/assess.js';
import { addDays, daysBetween, elapsed, endOfMonth } from '../src/rules/dates.js';
import { estimateOutcomes } from '../src/rules/refund.js';

const AS_OF = '2026-10-25';
const policy = (overrides) => ({
  policyId: '9001',
  customerId: 'C-9001',
  customerName: 'בדיקה',
  product: 'home',
  status: 'active',
  startDate: '2020-01-01',
  lastPaymentDate: '2026-10-01',
  monthlyPremium: 100,
  openClaims: 0,
  notes: '',
  dataWarnings: [],
  ...overrides,
});
const cancel = (overrides) => assessPolicy(policy(overrides), { asOf: AS_OF }).cancellation;

test('dates: end of month, adding days, elapsed time', () => {
  assert.equal(endOfMonth('2026-10-25'), '2026-10-31');
  assert.equal(endOfMonth('2028-02-03'), '2028-02-29');
  assert.equal(addDays('2026-10-25', 30), '2026-11-24');
  assert.equal(addDays('2026-11-08', -1), '2026-11-07');
  assert.equal(daysBetween('2026-06-02', '2026-10-25'), 145);
  assert.deepEqual(elapsed('2023-02-10', AS_OF), { years: 3, months: 8, days: 15, totalMonths: 44 });
  assert.deepEqual(elapsed('2026-11-08', AS_OF), { years: 0, months: 0, days: 0, totalMonths: 0 });
});

test('cooling-off: day 14 is inside, day 15 is not', () => {
  assert.equal(cancel({ startDate: addDays(AS_OF, -14) }).coolingOff, true);
  assert.equal(cancel({ startDate: addDays(AS_OF, -15) }).coolingOff, false);
});

test('the car fee does not apply during cooling-off', () => {
  assert.equal(cancel({ product: 'car', startDate: addDays(AS_OF, -3) }).fee.amount, 0);
  assert.equal(cancel({ product: 'car', startDate: addDays(AS_OF, -30) }).fee.amount, 150);
});

test('fee: exactly 12 months is free, 11 months pays 50', () => {
  assert.equal(cancel({ startDate: '2025-10-25' }).fee.amount, 0);
  assert.equal(cancel({ startDate: '2025-10-26' }).fee.amount, 50);
});

test('bonus tiers include the lower bound', () => {
  const percent = (startDate) => cancel({ startDate }).bonus.percent;
  assert.equal(percent('2025-10-26'), 0);
  assert.equal(percent('2025-10-25'), 5);
  assert.equal(percent('2023-10-26'), 5);
  assert.equal(percent('2023-10-25'), 10);
  assert.equal(percent('2021-10-26'), 10);
  assert.equal(percent('2021-10-25'), 15);
});

test('arrears start after 60 days without payment', () => {
  assert.equal(cancel({ lastPaymentDate: addDays(AS_OF, -60) }).beforeDebtOffset, false);
  assert.equal(cancel({ lastPaymentDate: addDays(AS_OF, -61) }).beforeDebtOffset, true);
});

test('30-day notice only for health policies opened before 1.1.2024', () => {
  assert.equal(cancel({ product: 'health', startDate: '2023-12-31' }).noticeDays, 30);
  assert.equal(cancel({ product: 'health', startDate: '2024-01-01' }).noticeDays, null);
  assert.equal(cancel({ product: 'home', startDate: '2023-12-31' }).noticeDays, null);
});

test('travel: the day before the trip can cancel, the trip day cannot', () => {
  assert.equal(cancel({ product: 'travel', startDate: addDays(AS_OF, 1) }).allowed, true);
  assert.equal(cancel({ product: 'travel', startDate: AS_OF }).blockedReason, 'tripStarted');
});

test('a missing field blocks the estimate instead of guessing', () => {
  const c = cancel({ startDate: null });
  assert.equal(c.blockedReason, 'missingData');
  assert.deepEqual(c.missing.map((m) => m.key), ['startDate']);
  assert.equal(c.outcomes, null);
});

test('a cancelled second policy does not trigger the multi-policy disclosure', () => {
  const customerPolicies = [policy({}), policy({ policyId: '9002', status: 'cancelled' })];
  const c = assessPolicy(policy({}), { asOf: AS_OF, customerPolicies }).cancellation;
  assert.ok(!c.disclosures.some((d) => d.key === 'multiPolicyDiscountLoss'));
});

test('fee larger than refund: customer pays, or nothing if the decision were reversed', () => {
  const bonus = { amount: 0, conditional: false };
  assert.deepEqual(estimateOutcomes({ proRata: 0, fee: 150, bonus }, 'customerPays')[0], {
    condition: null, refund: 0, customerPays: 150, atLeast: false,
  });
  assert.equal(estimateOutcomes({ proRata: 0, fee: 150, bonus }, 'waive')[0].customerPays, 0);
});
