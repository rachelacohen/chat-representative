import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRepository } from '../src/policies/repository.js';
import { detectIntent, mentionsRegulator, policyIdCandidates, resolvePolicy } from '../src/chat/intent.js';

const repo = createPolicyRepository({ source: 'csv' });

test('intent from free Hebrew phrasing', () => {
  assert.equal(detectIntent('הלקוח 4471 רוצה לבטל, מה מגיע לו?'), 'cancel');
  assert.equal(detectIntent('הלקוחה רוצה לסגור את הפוליסה'), 'cancel');
  assert.equal(detectIntent('כמה מגיע ללקוח בחזרה?'), 'refund');
  assert.equal(detectIntent('מתי התביעה שלו תשולם?'), 'claimPayment');
  assert.equal(detectIntent('אילו מסמכים צריך לתביעת רכב?'), 'documents');
  assert.equal(detectIntent('מה מצב התביעה?'), 'claim');
  assert.equal(detectIntent('מה שלומך היום?'), 'unknown');
});

test('regulator mentions are caught in several phrasings', () => {
  for (const q of [
    'הלקוח אומר שיתלונן ברשות שוק ההון',
    'הוא מאיים לפנות לרגולטור',
    'פנה לממונה על שוק ההון',
    'הלקוחה מאיימת לפנות לממונה על הביטוח',
    'הלקוח אמר שיגיש תלונה על החברה במשרד האוצר',
  ]) {
    assert.ok(mentionsRegulator(q), q);
  }
  assert.ok(!mentionsRegulator('הלקוח רוצה לבטל'));
});

test('policy numbers ignore dates, amounts, years and customer numbers', () => {
  assert.deepEqual(policyIdCandidates('פוליסה 4471 מ־10.02.2023, פרמיה 410 ₪'), ['4471']);
  assert.deepEqual(policyIdCandidates('בריאות שנפתחה לפני 2024'), []);
  assert.deepEqual(policyIdCandidates('פוליסה 2024'), ['2024']);
  assert.deepEqual(policyIdCandidates('לקוח C-1088 רוצה לבטל'), []);
});

test('resolving the policy: by number, customer number, name, and the hard cases', async () => {
  assert.equal((await resolvePolicy('הלקוח 4471 רוצה לבטל', repo)).policy.policyId, '4471');
  assert.equal((await resolvePolicy('לקוח C-1088 רוצה לבטל', repo)).policy.policyId, '4471');
  assert.equal((await resolvePolicy('רונן אביטל רוצה לבטל', repo)).policy.policyId, '4471');
  assert.deepEqual(await resolvePolicy('פוליסה 9999', repo), { status: 'notFound', policyId: '9999' });
  assert.equal((await resolvePolicy('מור שפירא רוצה לבטל', repo)).status, 'ambiguousName');
  const several = await resolvePolicy('אורן גבאי רוצה לבטל', repo);
  assert.equal(several.status, 'severalPolicies');
  assert.deepEqual(several.policies.map((p) => p.policyId), ['4418', '4433']);
  assert.equal((await resolvePolicy('אורן גבאי רוצה לבטל את הרכב', repo)).policy.policyId, '4418');
  assert.equal((await resolvePolicy('מה דמי הביטול ברכב?', repo)).status, 'none');
});
