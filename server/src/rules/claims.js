// What the representative may say about claims. The data has only the number of open claims -
// no stage, no filing date - and the policy sets no time for the decision or the payment.
import { RULES } from './config.js';

export function assessClaims(policy) {
  const { ackBusinessDays, appraiserBusinessDays, appealDays, documents } = RULES.claims;
  const missing = [];
  if (policy.openClaims === null) missing.push({ key: 'openClaims', source: 'claims.7' });
  if (policy.openClaims > 0) {
    missing.push({ key: 'claimStage', source: 'claims.7' }, { key: 'claimFiledDate', source: 'claims.7' });
  }

  return {
    openClaims: policy.openClaims,
    documents: documents[policy.product] ?? [],
    timeline: {
      ackBusinessDays,
      appraiserBusinessDays,
      maxBusinessDaysToAppraiser: ackBusinessDays + appraiserBusinessDays,
      decisionAndPaymentTimeKnown: false,
    },
    appealDays,
    // claims.3-5: never a payment date, approval odds, claim amounts or the appraiser's recommendation
    forbidden: ['paymentDate', 'approvalOdds', 'claimAmount', 'appraiserRecommendation'],
    missing,
    sources: ['claims.1', 'claims.2', 'claims.3', 'claims.4', 'claims.5', 'claims.6'],
  };
}
