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

// Hebrew keyword patterns for reading the representative's question. A miss is safe: an
// unrecognized intent gets the full facts file, and the model's own classification can only
// escalate. The regulator list is deliberately wide (general.1).
export const INTENT_PATTERNS = {
  regulator: /רשות שוק ההון|שוק ההון|רגולטור|הממונה על|המפקח על|רשות הביטוח|רשות לשוק/,
  cancel: /ביטול|לבטל|מבטל|לסגור את הפוליסה|לסיים את הפוליסה|להפסיק את הביטוח|לא רוצה (יותר )?את הביטוח|לעזוב/,
  refund: /החזר|בחזרה|מה מגיע|כמה מגיע|יחזירו/,
  claimPayment: /(מתי|כמה זמן|עד מתי)[^?.\n]*(תשולם|ישולם|יקבל|יגיע|הכסף|התשלום|לתשלום)|תשלום התביעה|(תשולם|ישולם)[^?.\n]*מתי/,
  documents: /מסמכ|להגיש|אישורים|קבלות/,
  claim: /תביע|ערעור|מעריך|שמאי|פיצוי/,
  // The question is about a specific customer, so it needs a policy to answer.
  aboutCustomer: /הלקוח|הלקוחה|המבוטח|שלו|שלה|פוליסה שלו|הפוליסה/,
  products: { car: /רכב/, home: /דירה/, health: /בריאות/, travel: /נסיע/ },
};

// Hebrew keyword patterns the answer guard uses. They are heuristics: a miss on a good
// answer only costs a fallback to the safe template, so they lean strict. Patterns with
// the g flag are only used with matchAll.
export const GUARD_PATTERNS = {
  latin: /[A-Za-z]+/,
  estimate: /הערכ|משוער|מוערך/,
  missing: /חסר|לא מופיע|לא ידוע|אין (לנו )?(נתון|מידע)|לא קיים בנתונים/,
  manager: /מנהל/,
  cancellationTopic: /ביטול|לבטל|החזר/,
  claimsTopic: /תביע/,
  policyMention: /פוליס\S*\s+(?:מספר\s+)?(\d{3,})/g,
  feeMention: /דמי\s+ה?ביטול/g,
  noFee: /(אין|בלי|ללא|לא יהיו|פטור מ)\s*דמי\s+ה?ביטול/,
  refundMention: /החזר/g,
  paymentWords: /ישולם|תשולם|יועבר|תשלום|הכסף/,
  paymentUnknown: /לא ידוע|אינו ידוע|אינה ידועה|אין זמן|אין פרק זמן|לא מוגדר|אינו מוגדר|לא נקבע|אין מועד|לא ניתן להתחייב/,
  claimStatusTalk: /שלב|מתי|ישולם|תשולם|תשלום|זמן/,
  claimAmountTopic: /תביע|פיצוי/,
  negation: /לא|אין|אינ|אסור|איסור|אי אפשר/,
  odds: [
    /סיכוי/g,
    /המלצ\S*\s+(?:של\s+)?המעריך|המעריך\s+(?:המליץ|ממליץ)/g,
    /(?:בטוח|בוודאות|ודאי)[^.\n]{0,20}(?:יאושר|תאושר)/g,
  ],
  missingChecks: {
    paidClaimsLast12Months: /שולמה/,
    debtAmount: /חוב[^.\n]*(חסר|לא מופיע|לא ידוע|אין)|(חסר|לא מופיע|לא ידוע|אין)[^.\n]*חוב/,
    lastPaymentDate: /חסר|לא מופיע|לא ידוע/,
  },
  disclosureChecks: {
    writtenRequest: /בכתב/,
    multiPolicyDiscountLoss: /הנח/,
    noticePeriod: /הודעה מראש|30 (יום|ימים)/,
    customerPays: /ישלם|לשלם|יחויב|חיוב/,
    arrearsOffset: /חוב/,
    unfreezeFirst: /הפשר/,
  },
  blockedChecks: {
    alreadyCancelled: /מבוטלת|בוטלה/,
    frozen: /מוקפא|הקפאה/,
    tripStarted: /(לא ניתן|אי אפשר|אין אפשרות)[^.\n]{0,15}לבטל/,
    missingData: /חסר|לא מופיע|לא ידוע/,
  },
};
