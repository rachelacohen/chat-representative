// Turns a facts file into Hebrew lines. The same lines are the model's input and, when the
// model fails or is not available, the safe answer the representative gets. Every line is
// Hebrew only - no field names, no Latin letters - with dates as 31.10.2026 and amounts as 342 ₪.

const PRODUCT_NAMES = { car: 'רכב', home: 'דירה', health: 'בריאות', travel: 'נסיעות' };
const FIELD_NAMES = {
  status: 'סטטוס',
  product: 'סוג הפוליסה',
  startDate: 'תאריך התחלה',
  monthlyPremium: 'פרמיה חודשית',
  openClaims: 'מספר תביעות פתוחות',
  lastPaymentDate: 'תאריך התשלום האחרון',
};

export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day}.${month}.${year}`;
}

export const formatMoney = (amount) => `${amount.toLocaleString('en-US')} ₪`;

const CLAIM_INTENTS = ['claim', 'claimPayment', 'documents'];

function headerLine(facts) {
  const product = PRODUCT_NAMES[facts.product] ?? 'סוג לא ידוע';
  return `פוליסה ${facts.policyId}, ${product}, נכון ל־${formatDate(facts.asOf)}`;
}

function blockedLines(facts) {
  const c = facts.cancellation;
  switch (c.blockedReason) {
    case 'alreadyCancelled':
      return ['הפוליסה כבר מבוטלת, ואין מה לבטל'];
    case 'frozen':
      return ['הפוליסה מוקפאת, ולכן אי אפשר לבטל אותה כרגע. הלקוח צריך לבקש קודם הפשרה דרך מחלקת גבייה, ורק אחר כך להגיש בקשת ביטול'];
    case 'openClaims':
      return [
        'יש בפוליסה תביעה פתוחה, ולכן ביטול דורש אישור של מנהל המשמרת. הנציג לא מאשר, לא דוחה ולא נוקב בסכומים',
        `יש להסביר ללקוח שהבקשה מועברת למנהל, ושתשובה תינתן תוך ${c.disclosures[0].answerWithinBusinessDays} ימי עסקים`,
      ];
    case 'tripStarted':
      return [`הנסיעה התחילה ב־${formatDate(facts.startDate)}, ולכן לפי הנוהל אי אפשר לבטל את הפוליסה, ולא יינתן החזר`];
    case 'missingData':
      return [`חסרים נתונים בפוליסה, ולכן אי אפשר להעריך את הביטול: ${c.missing.map((m) => FIELD_NAMES[m.key]).join(', ')}`];
    default:
      return ['אי אפשר להעריך את הביטול לפי הנתונים'];
  }
}

function outcomeLines(c) {
  const [first, second] = c.outcomes;
  if (c.coolingOff) return [`הערכת החזר: לפחות ${formatMoney(first.refund)}, לפי התשלום האחרון שמופיע בנתונים`];
  if (second) {
    const months = c.missing.find((m) => m.key === 'paidClaimsLast12Months').months;
    const ifPaid = second.refund > 0 ? `ו־${formatMoney(second.refund)} אם שולמה` : 'ואין החזר אם שולמה';
    return [
      `הערכת החזר: ${formatMoney(first.refund)} אם לא שולמה ללקוח תביעה ב־${months} החודשים האחרונים, ${ifPaid}`,
      'חסר נתון: האם שולמה ללקוח תביעה בתקופה הזו',
    ];
  }
  if (first.customerPays > 0) {
    return [
      `אין החזר. ההערכה היא שהלקוח ישלם ${formatMoney(first.customerPays)}, כי דמי הביטול גדולים מההחזר`,
      'חובה לומר זאת ללקוח לפני הביטול',
    ];
  }
  if (first.refund > 0) return [`הערכת החזר: ${formatMoney(first.refund)}`];
  return ['ההערכה היא שאין החזר ואין תשלום'];
}

function disclosureLine(d) {
  switch (d.key) {
    case 'writtenRequest':
      return 'הביטול אפשרי רק בבקשה בכתב. בבקשה טלפונית מתעדים את הפנייה ושולחים ללקוח קישור לטופס';
    case 'estimateOnly':
      return 'זו הערכה בלבד, והסכום הסופי נקבע במחלקת הכספים';
    case 'refundTiming':
      return `ההחזר יועבר תוך ${d.businessDays} ימי עסקים מכניסת הביטול לתוקף, לאמצעי התשלום שממנו שולמה הפרמיה. העברה לאמצעי תשלום אחר מחייבת אימות זהות במחלקת הכספים`;
    case 'multiPolicyDiscountLoss':
      return `ללקוח יש עוד פוליסה, מספר ${d.otherPolicyIds.join(' ו־')}. הביטול יבטל את הנחת ריבוי הפוליסות של ${d.percent}% בשאר הפוליסות מחודש החיוב הבא, וחובה לומר זאת ללקוח לפני הביטול`;
    case 'arrearsOffset':
      return `הלקוח בפיגור של ${d.daysSinceLastPayment} ימים בתשלום. החוב יקוזז מההחזר, וסכום החוב לא מופיע בנתונים. אם החוב גדול מההחזר, יש להפנות למחלקת גבייה`;
    default:
      return null;
  }
}

function cancellationLines(facts) {
  const c = facts.cancellation;
  if (!c.allowed) return blockedLines(facts);

  const lines = [];
  const notice = c.disclosures.find((d) => d.key === 'noticePeriod');
  const travel = c.disclosures.find((d) => d.key === 'travelDeadline');

  if (c.coolingOff) {
    if (travel) lines.push(`אפשר לבטל עד ${formatDate(travel.date)}, יום לפני תחילת הנסיעה`);
    lines.push(`הפוליסה בתקופת ההתחרטות של ${c.coolingOffDays} יום, ולכן הביטול מיידי, בלי דמי ביטול, עם החזר מלא של מה ששולם`);
  } else {
    lines.push(
      notice
        ? `הביטול נכנס לתוקף ב־${formatDate(c.effectiveDate)}, ${notice.days} יום אחרי קבלת הבקשה, כי בפוליסת בריאות שנפתחה לפני ${formatDate(notice.startedBefore)} נדרשת הודעה מראש. הלקוח מחויב על הימים האלה`
        : `הביטול נכנס לתוקף ב־${formatDate(c.effectiveDate)}, בסוף חודש החיוב`,
    );
    if (c.fee.amount === 0) lines.push(`אין דמי ביטול, כי הוותק ${c.fee.freeFromMonths} חודשים ומעלה`);
    else if (c.fee.source === 'cancel.4') lines.push(`דמי ביטול: ${formatMoney(c.fee.amount)}, כי הוותק פחות מ־${c.fee.freeFromMonths} חודשים`);
    else lines.push(`דמי ביטול: ${formatMoney(c.fee.amount)}, לפי החריג לפוליסות ${PRODUCT_NAMES[facts.product]}`);

    lines.push(
      c.bonus.percent === 0
        ? 'אין מענק ותק, כי הוותק פחות משנה'
        : `מענק ותק: ${formatMoney(c.bonus.amount)}, שהם ${c.bonus.percent}% מהפרמיה השנתית של ${formatMoney(c.bonus.annualPremium)}`,
    );
  }

  lines.push(...outcomeLines(c));
  for (const d of c.disclosures) {
    const line = disclosureLine(d);
    if (line) lines.push(line);
  }
  return lines;
}

function claimsLines(facts) {
  const { openClaims, timeline, documents, appealDays } = facts.claims;
  const lines = [];
  if (openClaims === null) lines.push('מספר התביעות הפתוחות לא מופיע בנתונים');
  else if (openClaims === 0) lines.push('אין בפוליסה תביעות פתוחות');
  else {
    const count = openClaims === 1 ? 'תביעה פתוחה אחת' : `${openClaims} תביעות פתוחות`;
    lines.push(`יש בפוליסה ${count}. שלב הטיפול ותאריך ההגשה לא מופיעים בנתונים`);
  }
  lines.push(
    `לפי הנוהל, אישור קבלה נשלח תוך ${timeline.ackBusinessDays} ימי עסקים מהגשת התביעה, ומעריך ממונה תוך ${timeline.appraiserBusinessDays} ימי עסקים, כלומר עד ${timeline.maxBusinessDaysToAppraiser} ימי עסקים מההגשה`,
    'לנוהל אין זמן מוגדר להחלטה ולתשלום, ולכן אין זמן מדויק או מירבי לתשלום התביעה',
    'אסור למסור את המלצת המעריך לפני שההחלטה נשלחה בכתב, ואסור להעריך סיכויי אישור או לנקוב בסכומים',
  );
  if (documents.length) lines.push(`מסמכים נדרשים לתביעה: ${documents.join(', ')}`);
  lines.push(`על החלטה שדוחה תביעה אפשר לערער תוך ${appealDays} יום מקבלת ההחלטה`);
  return lines;
}

// The facts as Hebrew lines, limited to what the intent asks about; an unknown intent gets all of it.
export function factLines(facts, intent = 'unknown') {
  const lines = [headerLine(facts)];
  if (!CLAIM_INTENTS.includes(intent)) lines.push(...cancellationLines(facts));
  if (!['cancel', 'refund'].includes(intent)) lines.push(...claimsLines(facts));
  return lines;
}

export const safeAnswer = (facts, intent) => factLines(facts, intent).join('\n');

// Answers that never go through the model.
export const FIXED_ANSWERS = {
  regulator:
    'הלקוח הזכיר תלונה לרשות שוק ההון. לפי הנוהל יש להעביר את השיחה מיד למנהל המשמרת, בלי לתת תשובה עניינית',
  notFound: (policyId) => `לא נמצאה פוליסה מספר ${policyId}. כדאי לבדוק את המספר מול הלקוח`,
  ambiguousName: 'נמצא יותר מלקוח אחד בשם הזה. נא לבקש מהלקוח את מספר הפוליסה',
  severalPolicies: (policies) =>
    `ללקוח יש כמה פוליסות: ${policies.map((p) => `${p.policyId} ${PRODUCT_NAMES[p.product] ?? ''}`.trim()).join(', ')}. על איזו מהן השאלה`,
  generalUnavailable: 'אין כרגע תשובה כללית בטוחה לשאלה הזו. אפשר לשאול על פוליסה מסוימת לפי מספר, או לבדוק בנוהל',
  needPolicyId: 'כדי לענות על השאלה צריך מספר פוליסה. נא לבקש אותו מהלקוח',
  offTopic: 'הכלי עונה רק על שאלות בנושא פוליסות',
  clarifyIntent: 'לא ברור מה הלקוח רוצה לדעת. אפשר לבחור: ביטול, החזר או תביעה',
};
