// How a model response is read, without calling the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readDraft } from '../src/chat/llm.js';

const response = (text, finishReason = 'STOP') => ({ text, candidates: [{ finishReason }] });
const VALID = JSON.stringify({ answer: 'הערכת החזר: 342 ₪', intent: 'cancel', regulatorMention: false, inScope: true });

test('a complete response is read', () => {
  assert.equal(readDraft(response(VALID)).answer, 'הערכת החזר: 342 ₪');
});

test('an answer cut off by the token limit is rejected, even if it parses', () => {
  assert.throws(() => readDraft(response(VALID, 'MAX_TOKENS')), /stopped early: MAX_TOKENS/);
});

test('a cut in the middle of the JSON is rejected', () => {
  assert.throws(() => readDraft(response(VALID.slice(0, 30))), SyntaxError);
});

test('a response that does not match the schema is rejected', () => {
  assert.throws(() => readDraft(response(JSON.stringify({ answer: '', intent: 'cancel' }))), /does not match the schema/);
  assert.throws(() => readDraft(response(JSON.stringify({ answer: 'כן', intent: 'other', regulatorMention: false, inScope: true }))));
});
