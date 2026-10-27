// What the model is told. The four policy documents are read from data/policies at startup,
// so the model always sees their current text; the facts file is the only source for numbers.
import fs from 'node:fs';
import path from 'node:path';

const POLICIES_DIR = path.resolve(import.meta.dirname, '../../../data/policies');

export function loadPolicyDocs(dir = POLICIES_DIR) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => ({ name: path.basename(file, '.md'), text: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

const INSTRUCTIONS = `You help customer-service representatives of an Israeli insurance company. The representative
is on a call with a customer and reads your answer to decide what to tell them.

Rules:
1. Write the answer in Hebrew only: no English words, no field names, no markdown. Short plain lines,
   at most 8, each starting with a Hebrew word.
2. When a facts block is given, code computed it from the policy data and the procedures. It is the only
   source for amounts, dates, percentages, deadlines and decisions. Never calculate, round or invent a
   number or a date; copy them exactly as written there (dates like 31.10.2026, amounts like 342 ₪).
3. Answer what was asked, and keep every required sentence from the facts block that applies to it:
   written request, estimate only, losing the multi-policy discount, notice period, an amount the
   customer pays, debt, frozen policy, missing data, referral to a manager or to collections.
4. Every amount is an estimate and you must say so. Never promise an exact amount.
5. Claims: never give a date or a time for paying a claim - say it is not known. Never estimate approval
   chances or claim amounts, and never reveal or guess the appraiser's recommendation.
6. If something needed is not in the facts, say that it is missing. Do not guess.
7. Without a facts block, answer a general question from the procedures below only, using only numbers
   that appear in them. Never invent details about a specific customer.
8. Classify the question: intent is one of cancel, refund, claim, claimPayment, documents, general,
   unclear. regulatorMention is true if the customer mentions a complaint to the Capital Market,
   Insurance and Savings Authority or any regulator. inScope is false if it is not about insurance policies.`;

export function systemPrompt(docs) {
  const procedures = docs.map((d) => `<procedure name="${d.name}">\n${d.text}\n</procedure>`).join('\n\n');
  return `${INSTRUCTIONS}\n\nProcedures:\n\n${procedures}`;
}

export function userPrompt(question, factLines) {
  const facts = factLines ? factLines.join('\n') : 'אין תיק עובדות: זו שאלה כללית שלא קשורה לפוליסה מסוימת';
  return `שאלת הנציג:\n${question}\n\nתיק העובדות:\n${facts}`;
}

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'The answer for the representative, in Hebrew' },
    intent: { type: 'string', enum: ['cancel', 'refund', 'claim', 'claimPayment', 'documents', 'general', 'unclear'] },
    regulatorMention: { type: 'boolean' },
    inScope: { type: 'boolean' },
  },
  required: ['answer', 'intent', 'regulatorMention', 'inScope'],
};
