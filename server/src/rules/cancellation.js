// Cancellation rules, applied in a fixed order so an exception is always checked before the
// general rule it overrides. Blocks (cancelled, frozen, open claim, trip started) return early,
// before any amount is computed, so a blocked case never carries a number the model could repeat.
import { RULES } from './config.js';
import { addDays, daysBetween, endOfMonth } from './dates.js';
import { estimateOutcomes, loyaltyBonus } from './refund.js';

const REQUIRED = ['status', 'product', 'startDate', 'monthlyPremium', 'openClaims'];

export function assessCancellation(policy, { asOf, seniority, otherPolicies }) {
  const result = {
    allowed: false,
    blockedReason: null,
    referTo: null,
    coolingOff: false,
    effectiveDate: null,
    noticeDays: null,
    lastCancellationDate: null,
    fee: null,
    bonus: null,
    proRata: null,
    outcomes: null,
    beforeDebtOffset: false,
    missing: [],
    disclosures: [],
    sources: [],
  };
  const block = (reason, source, extra = {}) => {
    Object.assign(result, { blockedReason: reason, ...extra });
    result.sources.push(source);
    return result;
  };

  const missingFields = REQUIRED.filter((field) => policy[field] === null);
  if (missingFields.length) {
    result.missing = missingFields.map((key) => ({ key, source: 'cancel.12' }));
    return block('missingData', 'cancel.12');
  }

  if (policy.status === 'cancelled') return block('alreadyCancelled', 'cancel.12');
  if (policy.status === 'frozen') {
    result.disclosures.push({ key: 'unfreezeFirst', referTo: 'collections', source: 'cancel.11' });
    return block('frozen', 'cancel.11', { referTo: 'collections' });
  }
  if (policy.openClaims > 0) {
    result.disclosures.push({
      key: 'managerReferral',
      answerWithinBusinessDays: RULES.openClaimsAnswerBusinessDays,
      source: 'cancel.8',
    });
    return block('openClaims', 'cancel.8', { referTo: 'shiftManager' });
  }

  // cancel.6: a trip that has started cannot be cancelled, even inside the 14 days (pilot decision);
  // before the trip the cooling-off rule applies.
  if (policy.product === 'travel') {
    if (asOf >= policy.startDate) {
      result.sources.push('decision.travelStarted');
      return block('tripStarted', 'cancel.6');
    }
    result.coolingOff = true;
    result.lastCancellationDate = addDays(policy.startDate, -1);
    result.disclosures.push({ key: 'travelDeadline', date: result.lastCancellationDate, source: 'cancel.6' });
    result.sources.push('cancel.6', 'decision.travelBeforeTrip');
  } else if (daysBetween(policy.startDate, asOf) <= RULES.coolingOffDays) {
    result.coolingOff = true;
  }

  result.allowed = true;
  result.disclosures.push({ key: 'writtenRequest', source: 'cancel.1' }, { key: 'estimateOnly', source: 'refund.5' });

  if (result.coolingOff) {
    // cancel.3: immediate, no fee (the car fee does not apply either), full refund of what was paid.
    // The export shows only the last monthly payment, so the refund is "at least" that.
    Object.assign(result, {
      effectiveDate: asOf,
      fee: { amount: 0, source: 'cancel.3' },
      outcomes: [{ condition: null, refund: policy.monthlyPremium, customerPays: 0, atLeast: true }],
    });
    result.sources.push('cancel.3', 'decision.monthlyBilling');
  } else {
    const notice = RULES.noticePeriods.find((n) => n.product === policy.product && policy.startDate < n.startedBefore);
    if (notice) {
      result.noticeDays = notice.days;
      result.effectiveDate = addDays(asOf, notice.days);
      result.disclosures.push({ key: 'noticePeriod', days: notice.days, source: notice.source });
      result.sources.push(notice.source);
    } else {
      result.effectiveDate = endOfMonth(asOf);
      result.sources.push('cancel.2');
    }

    const override = RULES.feeOverrides.find((o) => o.product === policy.product);
    result.fee = override
      ? { amount: override.amount, source: override.source }
      : { amount: seniority.totalMonths >= RULES.fee.freeFromMonths ? 0 : RULES.fee.amount, source: 'cancel.4' };

    result.bonus = loyaltyBonus(policy, seniority);
    if (result.bonus.conditional) result.missing.push({ key: 'paidClaimsLast12Months', source: 'refund.3' });

    // Billing is monthly, so nothing is prepaid past the effective date.
    result.proRata = 0;
    result.outcomes = estimateOutcomes({ proRata: 0, fee: result.fee.amount, bonus: result.bonus });
    result.sources.push(result.fee.source, 'refund.1', 'refund.2', 'decision.monthlyBilling');

    if (policy.lastPaymentDate === null) {
      result.missing.push({ key: 'lastPaymentDate', source: 'cancel.7' });
    } else if (daysBetween(policy.lastPaymentDate, asOf) > RULES.arrearsAfterDays) {
      result.beforeDebtOffset = true;
      result.missing.push({ key: 'debtAmount', source: 'cancel.7' });
      result.disclosures.push({ key: 'arrearsOffset', referTo: 'collections', source: 'cancel.7' });
      result.sources.push('cancel.7');
    }
  }

  if (result.outcomes.some((o) => o.refund > 0)) {
    result.disclosures.push({ key: 'refundTiming', businessDays: RULES.refundBusinessDays, source: 'refund.4' });
  }
  const pays = Math.max(...result.outcomes.map((o) => o.customerPays));
  if (pays > 0) {
    result.disclosures.push({ key: 'customerPays', amount: pays, source: 'decision.feeExceedsRefund' });
    result.sources.push('decision.feeExceedsRefund');
  }
  if (otherPolicies.length) {
    result.disclosures.push({
      key: 'multiPolicyDiscountLoss',
      percent: RULES.multiPolicyDiscountPercent,
      otherPolicyIds: otherPolicies.map((p) => p.policyId),
      source: 'cancel.10',
    });
    result.sources.push('cancel.10');
  }
  return result;
}
