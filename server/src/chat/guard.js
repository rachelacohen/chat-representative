// Checks a drafted answer against the facts file before it reaches the representative.
// Every check is deterministic. Any violation means the representative gets the safe
// template answer instead, and the violations are logged.
import { GUARD_PATTERNS as P } from '../rules/config.js';

const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;
const DATE = /(\d{1,2})[./](\d{1,2})[./](\d{4})|(\d{4})-(\d{2})-(\d{2})/g;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const MONEY_AFTER = /^\s*(₪|ש"ח|שח|שקל)/;
const MONEY_BEFORE = /₪\s*$/;
const CLAUSE_END = /[.,;!?\n]/;
const CLAIM_INTENTS = ['claim', 'claimPayment', 'documents'];

const normalize = (text) =>
  String(text ?? '').replace(BIDI_MARKS, '').replace(/״/g, '"').replace(/ /g, ' ');

const pad = (n) => String(n).padStart(2, '0');

// Dates are read first and blanked out, so 31.10.2026 is not also read as three numbers.
export function scanText(text) {
  const dates = [];
  const rest = text.replace(DATE, (match, d, m, y, isoY, isoM, isoD, offset) => {
    dates.push({ iso: y ? `${y}-${pad(m)}-${pad(d)}` : `${isoY}-${isoM}-${isoD}`, index: offset });
    return ' '.repeat(match.length);
  });
  const numbers = [...rest.matchAll(NUMBER)].map((m) => ({
    value: Number(m[0].replace(/,/g, '')),
    index: m.index,
    money:
      MONEY_AFTER.test(rest.slice(m.index + m[0].length, m.index + m[0].length + 6)) ||
      MONEY_BEFORE.test(rest.slice(Math.max(0, m.index - 3), m.index)),
  }));
  return { dates, numbers };
}

// Every number and date that appears anywhere in a value (facts file, policy text).
export function allowedFrom(value, allowed = { numbers: new Set(), dates: new Set() }) {
  if (typeof value === 'number') allowed.numbers.add(value);
  else if (typeof value === 'string') {
    const { dates, numbers } = scanText(value);
    for (const d of dates) {
      allowed.dates.add(d.iso);
      allowed.numbers.add(Number(d.iso.slice(0, 4)));
    }
    for (const n of numbers) allowed.numbers.add(n.value);
  } else if (Array.isArray(value)) value.forEach((v) => allowedFrom(v, allowed));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allowedFrom(v, allowed));
  return allowed;
}

// The text after each match of a keyword, up to the end of that clause.
function clausesAfter(text, pattern) {
  return [...text.matchAll(pattern)].map((m) => {
    const rest = text.slice(m.index + m[0].length);
    const end = rest.search(CLAUSE_END);
    return end === -1 ? rest : rest.slice(0, end);
  });
}

const firstMoney = (clause) => scanText(clause).numbers.find((n) => n.money)?.value ?? null;

const sentences = (text) => text.split(/[.!?\n]/).map((s) => s.trim()).filter(Boolean);

const negated = (text, index) => P.negation.test(text.slice(Math.max(0, index - 25), index));

export function checkAnswer(answer, facts, { intent = 'unknown', regulator = false, allowed: generalAllowed } = {}) {
  const text = normalize(answer);
  const violations = [];
  const flag = (code, detail) => violations.push({ code, detail });
  const { dates, numbers } = scanText(text);
  const money = numbers.filter((n) => n.money);
  const allowed = facts ? allowedFrom(facts) : generalAllowed ?? allowedFrom(null);

  const latin = text.match(P.latin);
  if (latin) flag('G-LATIN', `English text in the answer: ${latin[0]}`);

  for (const d of dates) if (!allowed.dates.has(d.iso)) flag('G-NUM', `date ${d.iso} is not in the facts`);
  for (const n of numbers) {
    if (!allowed.numbers.has(n.value)) flag('G-NUM', `${n.money ? 'amount' : 'number'} ${n.value} is not in the facts`);
  }

  for (const pattern of P.odds) {
    for (const m of text.matchAll(pattern)) {
      if (!negated(text, m.index)) flag('G-CLAIM-ODDS', `claim judgement: ${m[0]}`);
    }
  }

  if (regulator) {
    if (!P.manager.test(text)) flag('G-ESCALATE', 'regulator complaint without a referral to the shift manager');
    if (numbers.length) flag('G-ESCALATE', 'substantive answer to a regulator complaint');
  }

  if (!facts) return { passed: violations.length === 0, violations };

  const c = facts.cancellation;
  const talksCancellation = ['cancel', 'refund'].includes(intent) || P.cancellationTopic.test(text);
  const talksClaims = CLAIM_INTENTS.includes(intent) || P.claimsTopic.test(text);
  // Amounts quoted from the claim document list (an assessor report above 10,000 ₪) are not money owed.
  const documentNumbers = allowedFrom(facts.claims.documents).numbers;

  const ownIds = new Set([
    facts.policyId,
    ...(c.disclosures.find((d) => d.key === 'multiPolicyDiscountLoss')?.otherPolicyIds ?? []),
  ]);
  for (const m of text.matchAll(P.policyMention)) {
    if (!ownIds.has(m[1])) flag('G-ENTITY', `mentions another policy: ${m[1]}`);
  }

  if (talksCancellation && c.blockedReason === 'openClaims') {
    if (!P.manager.test(text)) flag('G-ESCALATE', 'cancellation with an open claim without a referral to the shift manager');
    if (money.some((n) => !documentNumbers.has(n.value))) flag('G-ESCALATE', 'amounts given while the case belongs to a manager');
  } else if (talksCancellation && !c.allowed) {
    const required = P.blockedChecks[c.blockedReason];
    if (required && !required.test(text)) flag('G-DISCLOSE', `does not say why it cannot be cancelled: ${c.blockedReason}`);
    for (const d of c.disclosures) {
      const disclosure = P.disclosureChecks[d.key];
      if (disclosure && !disclosure.test(text)) flag('G-DISCLOSE', `missing required disclosure: ${d.key}`);
    }
  } else if (talksCancellation) {
    for (const clause of clausesAfter(text, P.feeMention)) {
      const amount = firstMoney(clause);
      if (amount !== null && amount !== c.fee.amount) flag('G-FEE', `fee ${amount} instead of ${c.fee.amount}`);
    }
    if (c.fee.amount > 0 && P.noFee.test(text)) flag('G-FEE', `says there is no fee, the fee is ${c.fee.amount}`);

    const refunds = new Set(c.outcomes.map((o) => o.refund));
    for (const clause of clausesAfter(text, P.refundMention)) {
      const amount = firstMoney(clause);
      if (amount !== null && !refunds.has(amount)) flag('G-REFUND', `refund ${amount} is not a computed outcome`);
    }

    const outcomeAmounts = new Set(c.outcomes.flatMap((o) => [o.refund, o.customerPays]).filter((v) => v > 0));
    if (money.some((n) => outcomeAmounts.has(n.value)) && !P.estimate.test(text)) {
      flag('G-ESTIMATE', 'an amount without saying it is an estimate');
    }

    for (const item of c.missing) {
      const required = P.missingChecks[item.key];
      if (required && !required.test(text)) flag('G-MISSING', `does not say that ${item.key} is missing`);
    }

    for (const d of c.disclosures) {
      const required = P.disclosureChecks[d.key];
      if (required && !required.test(text)) flag('G-DISCLOSE', `missing required disclosure: ${d.key}`);
      if (d.key === 'travelDeadline' && !dates.some((x) => x.iso === d.date)) {
        flag('G-DISCLOSE', 'missing the last date to cancel before the trip');
      }
    }
  }

  if (talksClaims) {
    for (const sentence of sentences(text)) {
      const scanned = scanText(sentence);
      const aboutPayment =
        P.paymentWords.test(sentence) && (P.claimsTopic.test(sentence) || intent === 'claimPayment');
      if (aboutPayment && (scanned.dates.length || scanned.numbers.length) && !P.paymentUnknown.test(sentence)) {
        flag('G-CLAIM-DATE', `a time or date for paying the claim: ${sentence}`);
      }
      const claimMoney = scanned.numbers.filter((n) => n.money && !documentNumbers.has(n.value));
      if (P.claimAmountTopic.test(sentence) && !P.cancellationTopic.test(sentence) && claimMoney.length) {
        flag('G-CLAIM-ODDS', `an amount for the claim: ${sentence}`);
      }
    }
    if (intent === 'claimPayment' && !P.paymentUnknown.test(text)) {
      flag('G-CLAIM-DATE', 'does not say that the payment time is not known');
    }
    if (facts.claims.openClaims > 0 && P.claimStatusTalk.test(text) && !P.missing.test(text)) {
      flag('G-MISSING', 'does not say that the claim stage is missing');
    }
  }

  return { passed: violations.length === 0, violations };
}
