// Golden cases: the expected answers were computed by hand from the four policy documents and
// approved before this file was written. A failure here means the engine disagrees with the
// policy as approved - fix the engine, or get a new approval before changing an expectation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRepository } from '../src/policies/repository.js';
import { assessPolicy } from '../src/rules/assess.js';
import { PILOT_AS_OF } from '../src/rules/config.js';

const repo = createPolicyRepository({ source: 'csv' });

async function cancellationFor(policyId) {
  const policy = await repo.getPolicy(policyId);
  const customerPolicies = await repo.getCustomerPolicies(policy.customerId);
  return assessPolicy(policy, { asOf: PILOT_AS_OF, customerPolicies }).cancellation;
}

const keys = (items) => items.map((i) => i.key).sort();
const refund = (amount, atLeast = false) => [{ condition: null, refund: amount, customerPays: 0, atLeast }];
const pays = (amount) => [{ condition: null, refund: 0, customerPays: amount, atLeast: false }];
const REGULAR = ['estimateOnly', 'refundTiming', 'writtenRequest'];

function expectAllowed(c, expected) {
  assert.equal(c.allowed, true);
  assert.equal(c.blockedReason, null);
  assert.equal(c.coolingOff, expected.coolingOff ?? false);
  assert.equal(c.effectiveDate, expected.effectiveDate);
  assert.equal(c.fee.amount, expected.fee);
  if ('bonus' in expected) assert.deepEqual(c.bonus && { percent: c.bonus.percent, amount: c.bonus.amount }, expected.bonus);
  assert.deepEqual(c.outcomes, expected.outcomes);
  assert.equal(c.beforeDebtOffset, expected.beforeDebtOffset ?? false);
  assert.deepEqual(keys(c.missing), expected.missing ?? []);
  assert.deepEqual(keys(c.disclosures), [...(expected.disclosures ?? REGULAR)].sort());
}

function expectBlocked(c, reason, referTo = null) {
  assert.equal(c.allowed, false);
  assert.equal(c.blockedReason, reason);
  assert.equal(c.referTo, referTo);
  assert.equal(c.fee, null, 'no fee on a blocked case');
  assert.equal(c.bonus, null, 'no bonus on a blocked case');
  assert.equal(c.outcomes, null, 'no amounts on a blocked case');
}

test('4471 car, 3y8m: fee 150 by the car exception, bonus 492, refund 342', async () => {
  expectAllowed(await cancellationFor('4471'), {
    effectiveDate: '2026-10-31', fee: 150, bonus: { percent: 10, amount: 492 }, outcomes: refund(342),
  });
});

test('4416 car started 10 days ago: cooling-off, immediate, no fee, full refund of at least 530', async () => {
  const c = await cancellationFor('4416');
  expectAllowed(c, { coolingOff: true, effectiveDate: '2026-10-25', fee: 0, bonus: null, outcomes: refund(530, true) });
});

test('4437 travel that started on 22.10: no cancellation, no refund', async () => {
  expectBlocked(await cancellationFor('4437'), 'tripStarted');
});

test('4455 frozen: no cancellation, unfreeze through collections first', async () => {
  const c = await cancellationFor('4455');
  expectBlocked(c, 'frozen', 'collections');
  assert.deepEqual(keys(c.disclosures), ['unfreezeFirst']);
});

test('4425 and 4428 open claims: shift manager, answer within 2 business days, no amounts', async () => {
  for (const id of ['4425', '4428']) {
    const c = await cancellationFor(id);
    expectBlocked(c, 'openClaims', 'shiftManager');
    assert.deepEqual(c.disclosures, [{ key: 'managerReferral', answerWithinBusinessDays: 2, source: 'cancel.8' }]);
  }
});

test('4412 home in arrears: bonus 87 before the debt offset, debt amount missing', async () => {
  expectAllowed(await cancellationFor('4412'), {
    effectiveDate: '2026-10-31', fee: 0, bonus: { percent: 5, amount: 87 }, outcomes: refund(87),
    beforeDebtOffset: true, missing: ['debtAmount'], disclosures: [...REGULAR, 'arrearsOffset'],
  });
});

test('4418 and 4433, one customer: each cancellation discloses losing the 5% on the other', async () => {
  const car = await cancellationFor('4418');
  expectAllowed(car, {
    effectiveDate: '2026-10-31', fee: 150, bonus: { percent: 10, amount: 624 }, outcomes: refund(474),
    disclosures: [...REGULAR, 'multiPolicyDiscountLoss'],
  });
  assert.deepEqual(car.disclosures.find((d) => d.key === 'multiPolicyDiscountLoss').otherPolicyIds, ['4433']);

  const home = await cancellationFor('4433');
  expectAllowed(home, {
    effectiveDate: '2026-10-31', fee: 0, bonus: { percent: 10, amount: 216 }, outcomes: refund(216),
    disclosures: [...REGULAR, 'multiPolicyDiscountLoss'],
  });
  assert.deepEqual(home.disclosures.find((d) => d.key === 'multiPolicyDiscountLoss').otherPolicyIds, ['4418']);
});

test('4401 health from 2020: 30-day notice to 24.11, two estimates 288 or 0', async () => {
  expectAllowed(await cancellationFor('4401'), {
    effectiveDate: '2026-11-24', fee: 0, bonus: { percent: 15, amount: 288 },
    outcomes: [
      { condition: 'noPaidClaimLast12Months', refund: 288, customerPays: 0, atLeast: false },
      { condition: 'paidClaimLast12Months', refund: 0, customerPays: 0, atLeast: false },
    ],
    missing: ['paidClaimsLast12Months'], disclosures: [...REGULAR, 'noticePeriod'],
  });
});

test('4446 health from 2024: end of month, two estimates 96 or 0', async () => {
  expectAllowed(await cancellationFor('4446'), {
    effectiveDate: '2026-10-31', fee: 0, bonus: { percent: 5, amount: 96 },
    outcomes: [
      { condition: 'noPaidClaimLast12Months', refund: 96, customerPays: 0, atLeast: false },
      { condition: 'paidClaimLast12Months', refund: 0, customerPays: 0, atLeast: false },
    ],
    missing: ['paidClaimsLast12Months'],
  });
});

test('4405 already cancelled: nothing to cancel', async () => {
  expectBlocked(await cancellationFor('4405'), 'alreadyCancelled');
});

test('4421 car, 2y3m (slash dates): fee 150, bonus 288, refund 138', async () => {
  expectAllowed(await cancellationFor('4421'), {
    effectiveDate: '2026-10-31', fee: 150, bonus: { percent: 5, amount: 288 }, outcomes: refund(138),
  });
});

test('4441 car, 40 days: no refund, the customer pays 150', async () => {
  expectAllowed(await cancellationFor('4441'), {
    effectiveDate: '2026-10-31', fee: 150, bonus: { percent: 0, amount: 0 }, outcomes: pays(150),
    disclosures: ['estimateOnly', 'writtenRequest', 'customerPays'],
  });
});

test('4404 home, 8 months: fee 50, no refund, the customer pays 50', async () => {
  expectAllowed(await cancellationFor('4404'), {
    effectiveDate: '2026-10-31', fee: 50, bonus: { percent: 0, amount: 0 }, outcomes: pays(50),
    disclosures: ['estimateOnly', 'writtenRequest', 'customerPays'],
  });
});

test('4403 travel starting 8.11: cancel until 7.11, immediate, full refund of at least 50', async () => {
  const c = await cancellationFor('4403');
  expectAllowed(c, {
    coolingOff: true, effectiveDate: '2026-10-25', fee: 0, bonus: null, outcomes: refund(50, true),
    disclosures: [...REGULAR, 'travelDeadline'],
  });
  assert.equal(c.lastCancellationDate, '2026-11-07');
});

test('9999 does not exist: there is no policy to assess', async () => {
  assert.equal(await repo.getPolicy('9999'), null);
});

test('claims facts: open claims have no stage, no filing date and no payment time', async () => {
  const facts = assessPolicy(await repo.getPolicy('4425'), { asOf: PILOT_AS_OF });
  assert.equal(facts.claims.openClaims, 1);
  assert.deepEqual(keys(facts.claims.missing), ['claimFiledDate', 'claimStage']);
  assert.deepEqual(facts.claims.timeline, {
    ackBusinessDays: 3, appraiserBusinessDays: 10, maxBusinessDaysToAppraiser: 13, decisionAndPaymentTimeKnown: false,
  });
  assert.deepEqual(facts.claims.documents, ['מסמכים רפואיים', 'קבלות', 'הפניית רופא']);
});

test('the facts file never carries the customer name', async () => {
  const facts = assessPolicy(await repo.getPolicy('4471'), { asOf: PILOT_AS_OF });
  assert.ok(!JSON.stringify(facts).includes('רונן'));
});
