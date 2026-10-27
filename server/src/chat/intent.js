// Reads the representative's question in code, without the model: which policy it is about
// and what is being asked. It never decides an amount; it only picks which facts to build.
import { INTENT_PATTERNS as P } from '../rules/config.js';
import { scanText } from './guard.js';

export function detectIntent(question) {
  if (P.cancel.test(question)) return 'cancel';
  if (P.refund.test(question)) return 'refund';
  if (P.claimPayment.test(question)) return 'claimPayment';
  if (P.documents.test(question)) return 'documents';
  if (P.claim.test(question)) return 'claim';
  return 'unknown';
}

export const mentionsRegulator = (question) => P.regulator.test(question);

export const isAboutCustomer = (question) => P.aboutCustomer.test(question);

// Policy numbers: whole numbers of 4-6 digits that are not part of a date and not an amount.
// A bare year (2024) is skipped unless the word "policy" or "number" comes right before it.
export function policyIdCandidates(question) {
  const withoutCustomerIds = question.replace(CUSTOMER_ID, (match) => ' '.repeat(match.length));
  return scanText(withoutCustomerIds)
    .numbers.filter((n) => !n.money && Number.isInteger(n.value) && n.value >= 1000 && n.value < 1_000_000)
    .filter((n) => {
      const isYear = n.value >= 1900 && n.value <= 2100;
      return !isYear || /(פוליס\S*|מספר)\s*$/.test(question.slice(0, n.index));
    })
    .map((n) => String(n.value));
}

const CUSTOMER_ID = /\bC-?(\d{4})\b/gi;

export const customerIdIn = (question) => [...question.matchAll(CUSTOMER_ID)][0]?.[1] ?? null;

export const productIn = (question) =>
  Object.entries(P.products).find(([, pattern]) => pattern.test(question))?.[0] ?? null;

// Finds the policy the question is about: by policy number, then customer number, then name.
// Returns { status: 'found' | 'notFound' | 'ambiguousName' | 'severalPolicies' | 'none', ... }.
export async function resolvePolicy(question, repo) {
  const ids = policyIdCandidates(question);
  for (const id of ids) {
    const policy = await repo.getPolicy(id);
    if (policy) return { status: 'found', policy, matchedName: null };
  }
  if (ids.length) return { status: 'notFound', policyId: ids[0] };

  let policies = [];
  let matchedName = null;
  const customerId = customerIdIn(question);
  if (customerId) {
    policies = await repo.getCustomerPolicies(`C-${customerId}`);
    if (!policies.length) return { status: 'notFound', policyId: `C-${customerId}` };
  } else {
    const byName = await repo.findByNameInText(question);
    if (!byName.length) return { status: 'none' };
    if (new Set(byName.map((p) => p.customerId)).size > 1) return { status: 'ambiguousName' };
    policies = byName;
    matchedName = byName[0].customerName;
  }

  const product = productIn(question);
  const narrowed = product ? policies.filter((p) => p.product === product) : policies;
  if (narrowed.length === 1) return { status: 'found', policy: narrowed[0], matchedName };
  return { status: 'severalPolicies', policies, matchedName };
}
