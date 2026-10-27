// The guard against deliberately bad drafts: every check must catch its case, and the
// safe template answers must pass every check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPolicyRepository } from '../src/policies/repository.js';
import { assessPolicy } from '../src/rules/assess.js';
import { PILOT_AS_OF } from '../src/rules/config.js';
import { allowedFrom, checkAnswer } from '../src/chat/guard.js';
import { safeAnswer } from '../src/chat/templates.js';

const repo = createPolicyRepository({ source: 'csv' });

async function factsFor(policyId) {
  const policy = await repo.getPolicy(policyId);
  return assessPolicy(policy, { asOf: PILOT_AS_OF, customerPolicies: await repo.getCustomerPolicies(policy.customerId) });
}

const codes = (result) => [...new Set(result.violations.map((v) => v.code))].sort();

function expectCaught(answer, facts, code, context) {
  const result = checkAnswer(answer, facts, context);
  assert.equal(result.passed, false, `expected ${code} for: ${answer}`);
  assert.ok(codes(result).includes(code), `expected ${code}, got ${codes(result).join(', ')}`);
}

function expectPassed(answer, facts, context) {
  const result = checkAnswer(answer, facts, context);
  assert.deepEqual(result.violations, [], answer);
}

const ALL_IDS = Array.from({ length: 71 }, (_, i) => String(4401 + i));

test('every safe template answer passes the guard, for every policy and intent', async () => {
  for (const id of ALL_IDS) {
    const policy = await repo.getPolicy(id);
    if (!policy) continue;
    const facts = await factsFor(id);
    for (const intent of ['cancel', 'refund', 'claim', 'claimPayment', 'documents', 'unknown']) {
      const result = checkAnswer(safeAnswer(facts, intent), facts, { intent });
      assert.deepEqual(result.violations, [], `policy ${id}, intent ${intent}`);
    }
  }
});

test('a good paraphrase by the model passes', async () => {
  const facts = await factsFor('4471');
  expectPassed(
    'הלקוח יכול לבטל בבקשה בכתב, והביטול ייכנס לתוקף ב־31.10.2026. דמי הביטול ברכב הם 150 ₪, ומענק הוותק הוא 492 ₪. ' +
      'לכן ההחזר המשוער הוא 342 ₪. זו הערכה, והסכום הסופי ייקבע במחלקת הכספים',
    facts,
    { intent: 'cancel' },
  );
});

test('invented amount and wrong date are caught', async () => {
  const facts = await factsFor('4471');
  expectCaught('הערכת החזר: 400 ₪, בבקשה בכתב', facts, 'G-NUM', { intent: 'cancel' });
  expectCaught('הערכת החזר: 400 ₪, בבקשה בכתב', facts, 'G-REFUND', { intent: 'cancel' });
  expectCaught('הביטול נכנס לתוקף ב־30.11.2026, בבקשה בכתב', facts, 'G-NUM', { intent: 'cancel' });
});

test('the general fee instead of the car exception is caught', async () => {
  const facts = await factsFor('4471');
  expectCaught('בבקשה בכתב. דמי ביטול: 50 ₪. הערכת החזר: 342 ₪', facts, 'G-FEE', { intent: 'cancel' });
  expectCaught('בבקשה בכתב. אין דמי ביטול, והערכת החזר: 342 ₪', facts, 'G-FEE', { intent: 'cancel' });
});

test('an amount without the word estimate is caught', async () => {
  const facts = await factsFor('4471');
  expectCaught('בבקשה בכתב. דמי ביטול 150 ₪, והלקוח יקבל 342 ₪', facts, 'G-ESTIMATE', { intent: 'cancel' });
});

test('amounts on an open-claim cancellation are caught, and a referral passes', async () => {
  const facts = await factsFor('4425');
  expectCaught('אפשר לבטל. דמי ביטול 0 ₪, ההחזר המשוער 96 ₪', facts, 'G-ESCALATE', { intent: 'cancel' });
  expectCaught('אפשר לבטל את הפוליסה בבקשה בכתב', facts, 'G-ESCALATE', { intent: 'cancel' });
  expectPassed('יש תביעה פתוחה, ולכן הביטול מועבר למנהל המשמרת, ותשובה תינתן תוך 2 ימי עסקים', facts, { intent: 'cancel' });
});

test('a substantive answer to a regulator complaint is caught', async () => {
  const facts = await factsFor('4471');
  expectCaught('ההחזר המשוער הוא 342 ₪', facts, 'G-ESCALATE', { intent: 'cancel', regulator: true });
});

test('missing data that is not mentioned is caught', async () => {
  expectCaught('בבקשה בכתב. הערכת החזר: 87 ₪, זו הערכה', await factsFor('4412'), 'G-MISSING', { intent: 'cancel' });
  expectCaught(
    'בבקשה בכתב, בהודעה מראש. הערכת החזר: 288 ₪, זו הערכה',
    await factsFor('4401'),
    'G-MISSING',
    { intent: 'cancel' },
  );
});

test('missing required disclosures are caught', async () => {
  expectCaught('בבקשה בכתב. הערכת החזר: 474 ₪, זו הערכה', await factsFor('4418'), 'G-DISCLOSE', { intent: 'cancel' });
  expectCaught('בבקשה בכתב. אין החזר, זו הערכה', await factsFor('4441'), 'G-DISCLOSE', { intent: 'cancel' });
  expectCaught(
    'בבקשה בכתב. הביטול נכנס לתוקף ב־24.11.2026, וזו הערכה. ההחזר תלוי בתביעה ששולמה, וזה נתון חסר',
    await factsFor('4401'),
    'G-DISCLOSE',
    { intent: 'cancel' },
  );
  expectCaught('הפוליסה מוקפאת, ולכן אי אפשר לבטל אותה', await factsFor('4455'), 'G-DISCLOSE', { intent: 'cancel' });
  expectCaught('אפשר לבטל בבקשה בכתב, החזר מלא של לפחות 50 ₪, זו הערכה', await factsFor('4403'), 'G-DISCLOSE', {
    intent: 'cancel',
  });
});

test('a promised claim payment time is caught, and saying it is unknown passes', async () => {
  const facts = await factsFor('4425');
  expectCaught('התביעה תשולם תוך 3 ימי עסקים', facts, 'G-CLAIM-DATE', { intent: 'claimPayment' });
  expectCaught('מעריך ימונה תוך 10 ימי עסקים', facts, 'G-CLAIM-DATE', { intent: 'claimPayment' });
  expectPassed(
    'מעריך ימונה עד 13 ימי עסקים מההגשה. לנוהל אין זמן מוגדר לתשלום התביעה, ולכן הזמן לא ידוע. שלב הטיפול לא מופיע בנתונים',
    facts,
    { intent: 'claimPayment' },
  );
});

test('claim odds, claim amounts and the appraiser recommendation are caught, refusals pass', async () => {
  const facts = await factsFor('4425');
  expectCaught('יש לך סיכוי טוב שהתביעה תאושר', facts, 'G-CLAIM-ODDS', { intent: 'claim' });
  expectCaught('המעריך המליץ לאשר את התביעה', facts, 'G-CLAIM-ODDS', { intent: 'claim' });
  expectCaught('התביעה בטוח תאושר', facts, 'G-CLAIM-ODDS', { intent: 'claim' });
  expectCaught('הפיצוי על התביעה יהיה 310 ₪', facts, 'G-CLAIM-ODDS', { intent: 'claim' });
  expectPassed('אסור לי להעריך סיכויים, ואי אפשר למסור את המלצת המעריך לפני החלטה בכתב', facts, { intent: 'claim' });
});

test('another policy number and English text are caught', async () => {
  const facts = await factsFor('4471');
  expectCaught('גם פוליסה 4433 של הלקוח תושפע', facts, 'G-ENTITY', { intent: 'cancel' });
  expectCaught('the refund is 342', facts, 'G-LATIN', { intent: 'cancel' });
  expectCaught('הערכת החזר לפי monthly_premium', facts, 'G-LATIN', { intent: 'cancel' });
});

test('a general question may only use numbers from the policy documents', () => {
  const dir = path.resolve(import.meta.dirname, '../../data/policies');
  const text = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const allowed = allowedFrom(text);
  expectPassed('בפוליסת רכב דמי הביטול הם 150 ₪, חוץ מתקופת ההתחרטות של 14 ימים', null, { allowed });
  expectCaught('בפוליסת רכב דמי הביטול הם 175 ₪', null, 'G-NUM', { allowed });
});

test('bidi control characters do not hide anything from the guard', async () => {
  const facts = await factsFor('4471');
  expectCaught('הערכת החזר: ‏400‏ ₪, בבקשה בכתב', facts, 'G-NUM', { intent: 'cancel' });
});
