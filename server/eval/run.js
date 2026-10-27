// Evaluation: runs every question in questions.json through the real chat service and writes
// docs/EVAL_REPORT.md (for people) and docs/eval-results.json (raw).
//   npm run eval                     real model, 3 runs per question (needs GEMINI_API_KEY, costs cents)
//   npm run eval -- --runs 1
//   npm run eval -- --no-model       safe templates only: free, and the baseline the model must not fall below
//   npm run eval -- --from-results   rebuild the report from docs/eval-results.json without calling anything
// Two scores per run: safe (nothing forbidden, the right kind of answer) and complete (the facts the
// question needs are in the answer). Safety must be 100%; completeness shows how useful it is.
import fs from 'node:fs';
import path from 'node:path';
import { createPolicyRepository } from '../src/policies/repository.js';
import { createGeminiDrafter } from '../src/chat/llm.js';
import { loadPolicyDocs } from '../src/chat/prompt.js';
import { createChatService } from '../src/chat/service.js';
import { PILOT_AS_OF } from '../src/rules/config.js';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : undefined);
const fromResults = args.includes('--from-results');
const noModel = args.includes('--no-model');
// The Gemini free tier allows 5 requests a minute per model, so pace model calls by default.
const delayMs = option('--delay-ms') ?? 13000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DOCS_DIR = path.resolve(import.meta.dirname, '../../docs');
const RESULTS_FILE = path.join(DOCS_DIR, 'eval-results.json');
const questions = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'questions.json'), 'utf8'));

const SOURCE_NAMES = {
  llm: 'המודל',
  template: 'תבנית',
  escalation: 'הפניה',
  clarify: 'הבהרה',
  outOfScope: 'לא בנושא',
};

// Why the model was not available, by the HTTP status in the error.
const MODEL_ERRORS = [
  [/"code":\s*402/, 'נגמר הקרדיט של המפתח'],
  [/"code":\s*429/, 'מגבלת בקשות או מכסה יומית'],
  [/"code":\s*503/, 'עומס אצל גוגל'],
  [/aborted|timeout/i, 'עבר זמן התגובה המותר'],
];
const modelErrorKind = (message) => MODEL_ERRORS.find(([re]) => re.test(message))?.[1] ?? 'שגיאה אחרת';

function grade({ expect }, result) {
  const safety = [];
  const completeness = [];
  if (!expect.sources.includes(result.source)) safety.push(`סוג התשובה ${SOURCE_NAMES[result.source]}`);
  if (expect.reason && result.reason !== expect.reason) safety.push(`סיבת עצירה ${result.reason ?? 'חסרה'}`);
  if (expect.policyId && result.policyId && result.policyId !== expect.policyId) safety.push(`פוליסה ${result.policyId}`);
  for (const text of expect.mustNotInclude ?? []) if (result.answer.includes(text)) safety.push(`מופיע ${text}`);
  for (const re of expect.mustNotMatch ?? []) if (new RegExp(re).test(result.answer)) safety.push(`מופיע ${re}`);
  for (const text of expect.mustInclude ?? []) if (!result.answer.includes(text)) completeness.push(`חסר ${text}`);
  for (const re of expect.mustMatch ?? []) if (!new RegExp(re).test(result.answer)) completeness.push(`חסר ${re}`);
  return { safe: safety.length === 0, complete: safety.length === 0 && completeness.length === 0, safety, completeness };
}

async function runQuestions() {
  const runs = option('--runs') || 3;
  const drafter = noModel ? null : createGeminiDrafter();
  if (!noModel && !drafter) {
    console.error('GEMINI_API_KEY is not set - add it to server/.env, or run with --no-model');
    process.exit(1);
  }
  let lastLog = null;
  const chat = createChatService({
    repo: createPolicyRepository(),
    drafter,
    asOf: PILOT_AS_OF,
    policyDocs: loadPolicyDocs(),
    log: (entry) => (lastLog = entry),
  });

  const rows = [];
  for (const item of questions) {
    for (let run = 1; run <= runs; run++) {
      const result = await chat.answer(item.question);
      const usedModel = Boolean(lastLog.draft !== undefined || result.source === 'llm' || result.modelError);
      rows.push({
        id: item.id,
        category: item.category,
        question: item.question,
        run,
        usedModel,
        draft: lastLog.draft,
        source: result.source,
        answer: result.answer,
        guard: result.guard,
        modelError: result.modelError,
        latencyMs: result.latencyMs,
        ...grade(item, result),
      });
      process.stdout.write(rows.at(-1).safe ? (rows.at(-1).complete ? '.' : 'c') : 'S');
      if (usedModel && delayMs) await sleep(delayMs);
    }
  }
  process.stdout.write('\n');
  const results = { date: new Date().toISOString().slice(0, 10), model: drafter?.model ?? null, runs, rows };
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
  return results;
}

const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : 'אין');
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const seconds = (ms) => `${(ms / 1000).toFixed(1)} שניות`;
const formatDate = (iso) => iso.split('-').map(Number).reverse().join('.');

function report({ date, model, runs, rows }) {
  const total = rows.length;
  const safe = rows.filter((r) => r.safe).length;
  const complete = rows.filter((r) => r.complete).length;
  const modelRows = rows.filter((r) => r.usedModel);
  const modelPassed = modelRows.filter((r) => r.source === 'llm').length;
  const failedCalls = modelRows.filter((r) => r.modelError);
  const caught = modelRows.filter((r) => r.guard && !r.guard.passed);
  const codeCounts = {};
  for (const r of caught) for (const code of new Set(r.guard.violations.map((v) => v.code))) codeCounts[code] = (codeCounts[code] ?? 0) + 1;
  const errorKinds = {};
  for (const r of failedCalls) errorKinds[modelErrorKind(r.modelError)] = (errorKinds[modelErrorKind(r.modelError)] ?? 0) + 1;
  const latencies = rows.map((r) => r.latencyMs);
  const modelLatencies = modelRows.filter((r) => !r.modelError).map((r) => r.latencyMs);

  const lines = [
    '# דוח הערכה',
    '',
    `- תאריך ההרצה: ${formatDate(date)}`,
    `- נתונים נכונים ל־${formatDate(PILOT_AS_OF)}`,
    `- ${model ? 'מודל השפה מופיע בבלוק למטה' : 'מצב תבניות בלבד, בלי מודל'}`,
    `- ${questions.length} שאלות, ${runs === 1 ? 'הרצה אחת' : `${runs} הרצות`} לכל שאלה, ${total} תשובות בסך הכל`,
    '',
    ...(model ? ['```text', `model: ${model}`, '```', ''] : []),
  ];
  if (modelRows.length && failedCalls.length > modelRows.length / 2) {
    lines.push(
      '> **שימו לב** — ברוב הקריאות המודל לא היה זמין, ולכן ההרצה הזו בודקת בעיקר את מסלול תשובות התבנית, ולא את הניסוח של המודל',
      '',
    );
  }
  lines.push(
    '## תוצאות',
    '',
    `- **בטיחות** — ${percent(safe, total)} מהתשובות בטוחות: בלי תוכן אסור, ועם סוג התשובה הנכון. היעד הוא 100%`,
    `- **שלמות** — ${percent(complete, total)} מהתשובות כוללות את כל מה שהשאלה צריכה`,
    `- **קריאות למודל** — ${modelRows.length}, מתוכן ${modelRows.length - failedCalls.length} קיבלו תשובה מהמודל`,
    `- **המודל עבר את השומר** — ${modelPassed} תשובות נשלחו בנוסח של המודל`,
    `- **השומר חסם** — ${caught.length} טיוטות של המודל, והנציג קיבל במקומן את תשובת התבנית`,
    `- **המודל לא זמין** — ${failedCalls.length} פעמים, והנציג קיבל את תשובת התבנית`,
    ...Object.entries(errorKinds).map(([kind, count]) => `- **${kind}** — ${count} פעמים`),
    `- **זמן תגובה** — חציון ${seconds(percentile(latencies, 50))}, ובאחוזון 95 ${seconds(percentile(latencies, 95))}`,
    ...(modelLatencies.length
      ? [`- **זמן תגובה כשהמודל ענה** — חציון ${seconds(percentile(modelLatencies, 50))}, ובאחוזון 95 ${seconds(percentile(modelLatencies, 95))}`]
      : []),
    '',
    '## לפי קטגוריה',
    '',
  );
  for (const category of [...new Set(rows.map((r) => r.category))]) {
    const inCategory = rows.filter((r) => r.category === category);
    const safeCount = inCategory.filter((r) => r.safe).length;
    const completeCount = inCategory.filter((r) => r.complete).length;
    lines.push(`- **${category}** — בטיחות ${percent(safeCount, inCategory.length)}, שלמות ${percent(completeCount, inCategory.length)}`);
  }

  if (Object.keys(codeCounts).length) {
    lines.push('', '## מה השומר תפס', '', '- מספר הטיוטות שנחסמו בכל בדיקה, לפי קוד הבדיקה שבבלוק', '', '```text');
    for (const [code, count] of Object.entries(codeCounts).sort((a, b) => b[1] - a[1])) lines.push(`${code.padEnd(14)} ${count}`);
    lines.push('```', '', '### דוגמאות', '');
    for (const r of caught.slice(0, 5)) {
      lines.push(`- **שאלה** — ${r.question}`, '- **טיוטת המודל שנחסמה**', '');
      for (const line of r.draft.split('\n').filter(Boolean)) lines.push(`  > ${line}`);
      lines.push('', '- **הנציג קיבל** — תשובת התבנית', '');
    }
  }

  const failures = rows.filter((r) => !r.complete);
  lines.push('', '## תשובות שלא היו בטוחות או לא היו שלמות', '');
  if (!failures.length) lines.push('- אין');
  for (const r of failures) {
    lines.push(
      `- **שאלה** — ${r.question}, הרצה ${r.run}`,
      `- **מקור** — ${SOURCE_NAMES[r.source]}${r.modelError ? `, כי ${modelErrorKind(r.modelError)}` : ''}`,
      ...(r.safety.length ? [`- **בעיית בטיחות** — ${r.safety.join(', ')}`] : []),
      ...(r.completeness.length ? [`- **חסר בתשובה** — ${r.completeness.join(', ')}`] : []),
      '',
    );
  }

  fs.writeFileSync(path.join(DOCS_DIR, 'EVAL_REPORT.md'), lines.join('\n') + '\n');
  console.log(`safe ${percent(safe, total)} | complete ${percent(complete, total)} | model answered ${modelRows.length - failedCalls.length}/${modelRows.length} | p50 ${percentile(latencies, 50)} ms`);
  console.log('report: docs/EVAL_REPORT.md');
}

const results = fromResults ? JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) : await runQuestions();
report(results);
