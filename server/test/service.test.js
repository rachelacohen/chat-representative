// The whole question-to-answer path, with a fake model so it runs without a key or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRepository } from '../src/policies/repository.js';
import { loadPolicyDocs } from '../src/chat/prompt.js';
import { createChatService } from '../src/chat/service.js';
import { FIXED_ANSWERS } from '../src/chat/templates.js';

const repo = createPolicyRepository({ source: 'csv' });
const policyDocs = loadPolicyDocs();

// A fake model that records what it was sent and returns a fixed draft.
function fakeModel(draft) {
  const calls = [];
  const drafter = async (prompt) => {
    calls.push(prompt);
    if (draft instanceof Error) throw draft;
    return { intent: 'cancel', regulatorMention: false, inScope: true, ...draft };
  };
  drafter.model = 'fake';
  return { drafter, calls };
}

function service(drafter = null) {
  const logs = [];
  const chat = createChatService({ repo, drafter, policyDocs, log: (entry) => logs.push(entry) });
  return { chat, logs };
}

const GOOD_4471 =
  'הלקוח יכול לבטל בבקשה בכתב, והביטול ייכנס לתוקף ב־31.10.2026. דמי הביטול ברכב הם 150 ₪ ומענק הוותק 492 ₪. ' +
  'ההחזר המשוער הוא 342 ₪, וזו הערכה בלבד';

test('a good model draft is sent as is', async () => {
  const { drafter } = fakeModel({ answer: GOOD_4471 });
  const result = await service(drafter).chat.answer('הלקוח 4471 רוצה לבטל, מה מגיע לו?');
  assert.equal(result.source, 'llm');
  assert.equal(result.answer, GOOD_4471);
  assert.equal(result.policyId, '4471');
  assert.equal(result.guard.passed, true);
  assert.ok(result.citations.some((c) => c.doc === 'חריגים ועדכונים לנהלים' && c.section === 'סעיף א'));
});

test('a draft with the wrong fee is replaced by the safe template, and the draft is logged', async () => {
  const bad = 'בבקשה בכתב. דמי ביטול 50 ₪, ההחזר המשוער 342 ₪, זו הערכה';
  const { drafter } = fakeModel({ answer: bad });
  const { chat, logs } = service(drafter);
  const result = await chat.answer('הלקוח 4471 רוצה לבטל, מה מגיע לו?');
  assert.equal(result.source, 'template');
  assert.ok(result.answer.includes('הערכת החזר: 342 ₪'));
  assert.ok(result.guard.violations.some((v) => v.code === 'G-FEE'));
  assert.equal(logs[0].draft, bad);
  assert.equal(logs[0].source, 'template');
});

test('a regulator mention is referred to a manager without calling the model', async () => {
  const { drafter, calls } = fakeModel({ answer: GOOD_4471 });
  const result = await service(drafter).chat.answer('הלקוח 4471 רוצה לבטל ואומר שיתלונן ברשות שוק ההון');
  assert.equal(result.source, 'escalation');
  assert.equal(result.answer, FIXED_ANSWERS.regulator);
  assert.equal(calls.length, 0);
});

test('cancelling with an open claim is referred to a manager without calling the model', async () => {
  const { drafter, calls } = fakeModel({ answer: 'ההחזר המשוער 96 ₪' });
  const result = await service(drafter).chat.answer('הלקוח 4425 רוצה לבטל את הפוליסה');
  assert.equal(result.source, 'escalation');
  assert.ok(result.answer.includes('מנהל המשמרת'));
  assert.doesNotMatch(result.answer, /₪/);
  assert.equal(calls.length, 0);
});

test('when the code misses the intent, the model classification can still escalate', async () => {
  const { drafter } = fakeModel({ answer: 'ההחזר המשוער 96 ₪', intent: 'cancel' });
  const result = await service(drafter).chat.answer('הלקוח 4425 כבר לא מעוניין, מה עושים?');
  assert.equal(result.source, 'escalation');

  const { drafter: flagsRegulator } = fakeModel({ answer: GOOD_4471, regulatorMention: true });
  assert.equal((await service(flagsRegulator).chat.answer('הלקוח 4471 אומר שיפנה לגורם מפקח')).source, 'escalation');
});

test('the model flags can only make the answer stricter', async () => {
  const { drafter } = fakeModel({ answer: 'כן', inScope: false });
  assert.equal((await service(drafter).chat.answer('מה מזג האוויר מחר?')).source, 'outOfScope');

  const { drafter: unclear } = fakeModel({ answer: 'לא ברור', intent: 'unclear' });
  const result = await service(unclear).chat.answer('פוליסה 4471, מה איתו?');
  assert.equal(result.source, 'clarify');
  assert.equal(result.answer, FIXED_ANSWERS.clarifyIntent);
});

test('a model failure or no model at all falls back to the safe template', async () => {
  const { drafter } = fakeModel(new Error('timeout'));
  const failed = await service(drafter).chat.answer('הלקוח 4471 רוצה לבטל');
  assert.equal(failed.source, 'template');
  assert.equal(failed.modelError, 'timeout');
  assert.ok(failed.answer.includes('342 ₪'));

  const noModel = await service(null).chat.answer('הלקוח 4471 רוצה לבטל');
  assert.equal(noModel.source, 'template');
  assert.ok(noModel.answer.includes('342 ₪'));
});

test('questions that need a policy get a clarification, never a guess', async () => {
  const { chat } = service(null);
  assert.equal((await chat.answer('פוליסה 9999 רוצה לבטל')).answer, FIXED_ANSWERS.notFound('9999'));
  assert.equal((await chat.answer('מור שפירא רוצה לבטל')).answer, FIXED_ANSWERS.ambiguousName);
  assert.match((await chat.answer('אורן גבאי רוצה לבטל')).answer, /4418 רכב, 4433 דירה/);
  assert.equal((await chat.answer('הלקוח רוצה לבטל, מה מגיע לו?')).answer, FIXED_ANSWERS.needPolicyId);
});

test('the customer name is never sent to the model', async () => {
  const { drafter, calls } = fakeModel({ answer: GOOD_4471 });
  await service(drafter).chat.answer('רונן אביטל מפוליסה 4471 רוצה לבטל');
  assert.ok(!calls[0].user.includes('רונן'));
  assert.ok(!calls[0].system.includes('רונן'));
});

test('a general question is checked against the numbers in the policy documents', async () => {
  const { drafter } = fakeModel({ answer: 'בפוליסת רכב דמי הביטול הם 150 ₪, חוץ מתקופת ההתחרטות', intent: 'general' });
  const good = await service(drafter).chat.answer('מה דמי הביטול ברכב?');
  assert.equal(good.source, 'llm');

  const { drafter: invents } = fakeModel({ answer: 'בפוליסת רכב דמי הביטול הם 175 ₪', intent: 'general' });
  const bad = await service(invents).chat.answer('מה דמי הביטול ברכב?');
  assert.equal(bad.source, 'template');
  assert.equal(bad.answer, FIXED_ANSWERS.generalUnavailable);
});

test('every answer is logged with its source and latency', async () => {
  const { chat, logs } = service(null);
  await chat.answer('הלקוח 4471 רוצה לבטל');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].policyId, '4471');
  assert.equal(logs[0].intent, 'cancel');
  assert.equal(typeof logs[0].latencyMs, 'number');
});
