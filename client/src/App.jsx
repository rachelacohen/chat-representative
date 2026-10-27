import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const SOURCES = {
  llm: { label: 'נוסח המודל, עבר את השומר', tone: 'ok' },
  template: { label: 'תשובה בטוחה מתבנית', tone: 'info' },
  escalation: { label: 'הפניה למנהל', tone: 'warn' },
  clarify: { label: 'נדרשת הבהרה', tone: 'ask' },
  outOfScope: { label: 'לא בנושא פוליסות', tone: 'muted' },
};

const GUARD_LABELS = {
  'G-NUM': 'מספר או תאריך שלא קיימים בנתונים',
  'G-FEE': 'דמי ביטול שגויים',
  'G-REFUND': 'סכום החזר שלא חושב',
  'G-ESTIMATE': 'סכום בלי המילה הערכה',
  'G-ESCALATE': 'חסרה הפניה למנהל',
  'G-CLAIM-DATE': 'מועד לתשלום תביעה',
  'G-CLAIM-ODDS': 'הערכה על התביעה',
  'G-MISSING': 'נתון חסר שלא צוין',
  'G-DISCLOSE': 'משפט חובה חסר',
  'G-ENTITY': 'אזכור של פוליסה אחרת',
  'G-LATIN': 'מילים באנגלית',
};

const MISSING_LABELS = {
  debtAmount: 'סכום החוב',
  paidClaimsLast12Months: 'האם שולמה ללקוח תביעה ב־12 החודשים האחרונים',
  claimStage: 'שלב הטיפול בתביעה',
  claimFiledDate: 'תאריך הגשת התביעה',
  lastPaymentDate: 'תאריך התשלום האחרון',
  openClaims: 'מספר התביעות הפתוחות',
  startDate: 'תאריך התחלה',
  status: 'סטטוס',
  product: 'סוג הפוליסה',
  monthlyPremium: 'פרמיה חודשית',
};

const PRODUCT_NAMES = { car: 'רכב', home: 'דירה', health: 'בריאות', travel: 'נסיעות' };

// Buttons for "what does the customer want?" - each adds words the intent reader recognizes.
const INTENT_CHOICES = [
  ['ביטול', 'רוצה לבטל'],
  ['החזר', 'כמה מגיע החזר'],
  ['תביעה', 'שאלה על תביעה'],
];

const EXAMPLES = [
  'הלקוח 4471 רוצה לבטל, מה מגיע לו?',
  'הלקוח 4425 רוצה לבטל את הפוליסה',
  'מתי תשולם התביעה של פוליסה 4428?',
  'אורן גבאי רוצה לבטל את הרכב',
  'פוליסה 4455, הלקוח רוצה לבטל',
  'מה דמי הביטול בפוליסת רכב?',
];

function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day}.${month}.${year}`;
}

function Answer({ exchange, onAsk, onRetry }) {
  if (exchange.status === 'loading') return <div className="answer loading">מחפש תשובה בנתונים ובנהלים…</div>;
  if (exchange.status === 'error') {
    return (
      <div className="answer error">
        <p>השרת לא ענה. אפשר לשלוח שוב</p>
        <button onClick={onRetry}>לשלוח שוב</button>
      </div>
    );
  }

  const { result, question } = exchange;
  const source = SOURCES[result.source] ?? SOURCES.template;
  const blocked = result.guard && !result.guard.passed;
  const guardCodes = blocked ? [...new Set(result.guard.violations.map((v) => v.code))] : [];

  return (
    <div className={`answer tone-${source.tone}`}>
      <span className={`badge tone-${source.tone}`}>{source.label}</span>
      <div className="answer-text">
        {result.answer.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {result.reason === 'intent' && (
        <div className="choices">
          {INTENT_CHOICES.map(([label, words]) => (
            <button key={label} onClick={() => onAsk(`${question} ${words}`)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {result.reason === 'severalPolicies' && (
        <div className="choices">
          {result.options.map((o) => (
            <button key={o.policyId} onClick={() => onAsk(`${question} פוליסה ${o.policyId}`)}>
              פוליסה {o.policyId} {PRODUCT_NAMES[o.product]}
            </button>
          ))}
        </div>
      )}

      {blocked && (
        <p className="notice">
          טיוטת המודל נחסמה בשומר, ולכן מוצגת תשובת התבנית: {guardCodes.map((c) => GUARD_LABELS[c] ?? c).join(', ')}
        </p>
      )}
      {result.modelError && <p className="notice">המודל לא היה זמין או לא ענה בזמן, ולכן מוצגת תשובת התבנית</p>}

      {result.missing?.length > 0 && (
        <div className="missing">
          <strong>חסר בנתונים</strong>
          <ul>
            {result.missing.map((key) => (
              <li key={key}>{MISSING_LABELS[key] ?? key}</li>
            ))}
          </ul>
        </div>
      )}

      <details>
        <summary>על מה התשובה מבוססת</summary>
        {result.citations?.length > 0 && (
          <ul>
            {result.citations.map((c) => (
              <li key={`${c.doc}-${c.section}`}>
                {c.doc}, {c.section}
              </li>
            ))}
          </ul>
        )}
        <p>
          נתונים נכונים ל־{formatDate(result.asOf)}. זמן תגובה {(result.latencyMs / 1000).toFixed(1)} שניות
        </p>
      </details>
    </div>
  );
}

export default function App() {
  const [exchanges, setExchanges] = useState([]);
  const [question, setQuestion] = useState('');
  const endRef = useRef(null);
  const busy = exchanges.some((e) => e.status === 'loading');

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [exchanges]);

  const update = (id, patch) => setExchanges((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const run = async (id, text) => {
    update(id, { status: 'loading' });
    try {
      update(id, { status: 'done', result: await api.ask(text) });
    } catch (err) {
      update(id, { status: 'error', error: err.message });
    }
  };

  const ask = (text) => {
    const value = text.trim();
    if (!value || busy) return;
    const id = crypto.randomUUID();
    setExchanges((prev) => [...prev, { id, question: value, status: 'loading' }]);
    setQuestion('');
    run(id, value);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(question);
    }
  };

  return (
    <main className="app">
      <header>
        <h1>עוזר לנציגי שירות</h1>
        <p>תשובות לפי נתוני הפוליסה ונהלי החברה. כל סכום הוא הערכה, והסכום הסופי נקבע במחלקת הכספים</p>
      </header>

      {exchanges.length === 0 && (
        <section className="examples">
          <p>אפשר להתחיל משאלה לדוגמה</p>
          <div className="choices">
            {EXAMPLES.map((q) => (
              <button key={q} onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="conversation" aria-live="polite">
        {exchanges.map((exchange) => (
          <article key={exchange.id}>
            <p className="question">{exchange.question}</p>
            <Answer exchange={exchange} onAsk={ask} onRetry={() => run(exchange.id, exchange.question)} />
          </article>
        ))}
        <div ref={endRef} className="scroll-end" />
      </section>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="למשל: הלקוח 4471 רוצה לבטל, מה מגיע לו?"
          rows={2}
          maxLength={2000}
          aria-label="שאלה"
        />
        <button type="submit" disabled={busy || !question.trim()}>
          שליחה
        </button>
      </form>
    </main>
  );
}
