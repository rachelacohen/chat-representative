// Refund estimate = pro-rata of prepaid premium - cancellation fee + loyalty bonus (refund.1).
import { RULES } from './config.js';

export function loyaltyBonus(policy, seniority) {
  const tier = RULES.loyaltyBonusTiers.findLast((t) => seniority.years >= t.minYears);
  const annualPremium = policy.monthlyPremium * 12;
  return {
    percent: tier.percent,
    annualPremium,
    amount: Math.round(annualPremium * tier.percent) / 100,
    // refund.3: health pays the bonus only if no claim was paid in the last 12 months,
    // which the data does not show, so the bonus becomes a condition.
    conditional: tier.percent > 0 && policy.product === RULES.bonusNeedsNoPaidClaim.product,
    source: 'refund.2',
  };
}

// One outcome per possible state of a conditional bonus. A negative total means the
// cancellation fee is larger than the refund; by pilot decision the customer pays the difference.
export function estimateOutcomes({ proRata, fee, bonus }, feeExceedsRefund = RULES.feeExceedsRefund) {
  const settle = (condition, bonusAmount) => {
    const total = proRata - fee + bonusAmount;
    return {
      condition,
      refund: Math.max(total, 0),
      customerPays: feeExceedsRefund === 'customerPays' ? Math.max(-total, 0) : 0,
      atLeast: false,
    };
  };
  if (bonus.conditional) return [settle('noPaidClaimLast12Months', bonus.amount), settle('paidClaimLast12Months', 0)];
  return [settle(null, bonus.amount)];
}
