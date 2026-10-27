// Every value the rules engine uses, in one place. Each rule id points to the policy
// section (or pilot decision) it comes from, so any answer can be traced back to its source.
// The rules do not change during the pilot; changing a value here is a code change + tests.

// Pilot data is an export taken on this date (overridable with AS_OF_DATE).
export const PILOT_AS_OF = '2026-10-25';

export const SOURCES = {
  'cancel.1': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 1' },
  'cancel.2': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 1' },
  'cancel.3': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 2' },
  'cancel.4': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 3' },
  'cancel.5': { doc: 'חריגים ועדכונים לנהלים', section: 'סעיף א' },
  'cancel.6': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 4' },
  'cancel.7': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 5' },
  'cancel.8': { doc: 'נוהל ביטול פוליסה', section: 'סעיף 6' },
  'cancel.9': { doc: 'חריגים ועדכונים לנהלים', section: 'סעיף ב' },
  'cancel.10': { doc: 'חריגים ועדכונים לנהלים', section: 'סעיף ג' },
  'cancel.11': { doc: 'חריגים ועדכונים לנהלים', section: 'סעיף ד' },
  'cancel.12': { doc: 'נתוני הפוליסה', section: 'סטטוס' },
  'refund.1': { doc: 'נוהל החזרים', section: 'סעיף 2' },
  'refund.2': { doc: 'נוהל החזרים', section: 'סעיף 2' },
  'refund.3': { doc: 'נוהל החזרים', section: 'סעיף 3' },
  'refund.4': { doc: 'נוהל החזרים', section: 'סעיף 4' },
  'refund.5': { doc: 'נוהל החזרים', section: 'סעיף 5' },
  'claims.1': { doc: 'נוהל טיפול בתביעות', section: 'סעיפים 1 ו־4' },
  'claims.2': { doc: 'נוהל טיפול בתביעות', section: 'סעיף 2' },
  'claims.3': { doc: 'נוהל טיפול בתביעות', section: 'סעיף 2' },
  'claims.4': { doc: 'נוהל טיפול בתביעות', section: 'סעיף 3' },
  'claims.5': { doc: 'נוהל טיפול בתביעות', section: 'סעיף 6' },
  'claims.6': { doc: 'נוהל טיפול בתביעות', section: 'סעיף 5' },
  'claims.7': { doc: 'נתוני הפוליסה', section: 'תביעות פתוחות' },
  'general.1': { doc: 'חריגים ועדכונים לנהלים', section: 'סעיף ה' },
  'decision.monthlyBilling': { doc: 'החלטות הפיילוט', section: 'החיוב חודשי בכל הפוליסות' },
  'decision.travelBeforeTrip': { doc: 'החלטות הפיילוט', section: 'נסיעה שלא התחילה מקבלת החזר מלא' },
  'decision.travelStarted': { doc: 'החלטות הפיילוט', section: 'נסיעה שהתחילה לא ניתנת לביטול' },
  'decision.feeExceedsRefund': { doc: 'החלטות הפיילוט', section: 'הלקוח משלם את ההפרש' },
};

export const RULES = {
  coolingOffDays: 14, // cancel.3 - day 14 after the start date is still inside
  fee: { amount: 50, freeFromMonths: 12 }, // cancel.4
  feeOverrides: [{ product: 'car', amount: 150, source: 'cancel.5' }], // not during cooling-off
  arrearsAfterDays: 60, // cancel.7 - more than 60 days since the last payment
  openClaimsAnswerBusinessDays: 2, // cancel.8
  noticePeriods: [{ product: 'health', startedBefore: '2024-01-01', days: 30, source: 'cancel.9' }],
  multiPolicyDiscountPercent: 5, // cancel.10
  // refund.2 - lower bound inclusive: exactly 3 years is 10%, exactly 5 years is 15%
  loyaltyBonusTiers: [
    { minYears: 0, percent: 0 },
    { minYears: 1, percent: 5 },
    { minYears: 3, percent: 10 },
    { minYears: 5, percent: 15 },
  ],
  bonusNeedsNoPaidClaim: { product: 'health', months: 12 }, // refund.3
  refundBusinessDays: 14, // refund.4
  feeExceedsRefund: 'customerPays', // decision.feeExceedsRefund; the alternative is 'waive'
  claims: {
    ackBusinessDays: 3, // claims.2
    appraiserBusinessDays: 10, // claims.2
    appealDays: 30, // claims.6
    documents: { // claims.1
      car: ['דוח משטרה, אם רלוונטי', 'הצעת מחיר ממוסך', 'צילומי הנזק'],
      home: ['צילומי הנזק', 'קבלות על רכוש שניזוק', 'דוח שמאי אם הנזק מעל 10,000 ₪'],
      health: ['מסמכים רפואיים', 'קבלות', 'הפניית רופא'],
      travel: ['כרטיסי טיסה', 'אישורים רפואיים מחו״ל', 'קבלות'],
    },
  },
};
