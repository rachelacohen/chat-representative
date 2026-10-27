import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRepository } from '../src/policies/repository.js';
import { assessPolicy } from '../src/rules/assess.js';
import { PILOT_AS_OF } from '../src/rules/config.js';
import { FIXED_ANSWERS, formatDate, formatMoney, safeAnswer } from '../src/chat/templates.js';

const repo = createPolicyRepository({ source: 'csv' });

async function answerFor(policyId, intent) {
  const policy = await repo.getPolicy(policyId);
  const facts = assessPolicy(policy, { asOf: PILOT_AS_OF, customerPolicies: await repo.getCustomerPolicies(policy.customerId) });
  return safeAnswer(facts, intent);
}

test('formats dates and amounts the Israeli way', () => {
  assert.equal(formatDate('2026-10-31'), '31.10.2026');
  assert.equal(formatDate('2026-11-07'), '7.11.2026');
  assert.equal(formatMoney(4920), '4,920 ₪');
  assert.equal(formatMoney(342), '342 ₪');
});

test('4471 cancellation answer carries the approved numbers and wording', async () => {
  const answer = await answerFor('4471', 'cancel');
  for (const part of ['פוליסה 4471, רכב, נכון ל־25.10.2026', '31.10.2026', 'דמי ביטול: 150 ₪', '492 ₪', 'הערכת החזר: 342 ₪', 'בכתב', 'הערכה בלבד']) {
    assert.ok(answer.includes(part), `missing: ${part}`);
  }
});

test('every line of every answer is Hebrew only and starts with a Hebrew letter', async () => {
  const answers = [
    await answerFor('4401', 'unknown'),
    await answerFor('4403', 'cancel'),
    await answerFor('4428', 'unknown'),
    ...Object.values(FIXED_ANSWERS).map((a) => (typeof a === 'function' ? a('9999') : a)),
  ];
  for (const line of answers.flatMap((a) => a.split('\n'))) {
    assert.doesNotMatch(line, /[A-Za-z]/, line);
    assert.match(line, /^[֐-׿]/, line);
  }
});

test('a claim payment question gets the stage times and an explicit unknown', async () => {
  const answer = await answerFor('4425', 'claimPayment');
  assert.ok(answer.includes('עד 13 ימי עסקים'));
  assert.ok(answer.includes('אין זמן מדויק או מירבי לתשלום התביעה'));
  assert.ok(!answer.includes('ביטול'), 'a claim question does not get the cancellation section');
});
