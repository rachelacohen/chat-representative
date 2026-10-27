// Builds the facts file for one policy: everything the model may say about it, already
// computed. It covers every scenario (cancellation, refund, claims), so an intent the code
// did not recognize never leaves the model without facts - or with a number to invent.
// The customer's name is left out on purpose: it is not sent to the model.
import { assessCancellation } from './cancellation.js';
import { assessClaims } from './claims.js';
import { elapsed } from './dates.js';

export function assessPolicy(policy, { asOf, customerPolicies = [] }) {
  const seniority = policy.startDate ? elapsed(policy.startDate, asOf) : null;
  const otherPolicies = customerPolicies.filter((p) => p.policyId !== policy.policyId && p.status !== 'cancelled');

  return {
    policyId: policy.policyId,
    product: policy.product,
    status: policy.status,
    asOf,
    startDate: policy.startDate,
    monthlyPremium: policy.monthlyPremium,
    seniority,
    cancellation: assessCancellation(policy, { asOf, seniority, otherPolicies }),
    claims: assessClaims(policy),
    dataWarnings: policy.dataWarnings,
  };
}
