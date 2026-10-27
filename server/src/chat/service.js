// One question in, one safe answer out:
//   code reads the question -> stops before the model when it must -> builds the facts file ->
//   the model phrases it -> the model's flags may only escalate -> the guard checks the draft ->
//   the draft, or the safe template when anything fails.
import { assessPolicy } from '../rules/assess.js';
import { PILOT_AS_OF, SOURCES } from '../rules/config.js';
import { allowedFrom, checkAnswer } from './guard.js';
import { detectIntent, isAboutCustomer, mentionsRegulator, resolvePolicy } from './intent.js';
import { systemPrompt, userPrompt } from './prompt.js';
import { FIXED_ANSWERS, factLines, safeAnswer } from './templates.js';

const CANCELLATION_INTENTS = ['cancel', 'refund'];
const CLAIM_INTENTS = ['claim', 'claimPayment', 'documents'];
const MODEL_INTENTS = { general: 'unknown', unclear: 'unknown' };

function citationsFor(facts, intent, extra = []) {
  const ids = [...extra];
  if (facts && !CLAIM_INTENTS.includes(intent)) ids.push(...facts.cancellation.sources);
  if (facts && !CANCELLATION_INTENTS.includes(intent)) ids.push(...facts.claims.sources);
  const seen = new Set();
  return ids
    .map((id) => ({ id, ...SOURCES[id] }))
    .filter((c) => c.doc && !seen.has(`${c.doc}|${c.section}`) && seen.add(`${c.doc}|${c.section}`));
}

const missingFor = (facts, intent) => {
  if (!facts) return [];
  const items = [];
  if (!CLAIM_INTENTS.includes(intent)) items.push(...facts.cancellation.missing);
  if (!CANCELLATION_INTENTS.includes(intent)) items.push(...facts.claims.missing);
  return items.map((m) => m.key);
};

const isOpenClaimCancellation = (facts, intent) =>
  facts && CANCELLATION_INTENTS.includes(intent) && facts.cancellation.blockedReason === 'openClaims';

export function createChatService({ repo, drafter = null, asOf = PILOT_AS_OF, policyDocs, log = () => {} }) {
  const system = systemPrompt(policyDocs);
  const generalAllowed = allowedFrom(policyDocs.map((d) => d.text).join('\n'));

  async function run(question, trace) {
    const reply = (source, answer, extra = {}) => ({ source, answer, intent: trace.intent, asOf, ...extra });
    trace.intent = detectIntent(question);

    // `reason` tells the screen which kind of stop this is (and which buttons to offer).
    const regulatorReply = () =>
      reply('escalation', FIXED_ANSWERS.regulator, { reason: 'regulator', citations: citationsFor(null, null, ['general.1']) });
    if (mentionsRegulator(question)) return regulatorReply();

    const found = await resolvePolicy(question, repo);
    if (found.status === 'notFound') return reply('clarify', FIXED_ANSWERS.notFound(found.policyId), { reason: 'notFound' });
    if (found.status === 'ambiguousName') return reply('clarify', FIXED_ANSWERS.ambiguousName, { reason: 'ambiguousName' });
    if (found.status === 'severalPolicies') {
      return reply('clarify', FIXED_ANSWERS.severalPolicies(found.policies), {
        reason: 'severalPolicies',
        options: found.policies.map((p) => ({ policyId: p.policyId, product: p.product })),
      });
    }
    if (found.status === 'none' && isAboutCustomer(question)) {
      return reply('clarify', FIXED_ANSWERS.needPolicyId, { reason: 'needPolicyId' });
    }

    let facts = null;
    if (found.status === 'found') {
      const customerPolicies = await repo.getCustomerPolicies(found.policy.customerId);
      facts = assessPolicy(found.policy, { asOf, customerPolicies });
      trace.policyId = facts.policyId;
    }
    const withFacts = (source, answer, extra = {}) =>
      reply(source, answer, {
        policyId: facts?.policyId ?? null,
        facts,
        missing: missingFor(facts, trace.intent),
        citations: citationsFor(facts, trace.intent),
        ...extra,
      });
    const template = (extra) =>
      withFacts('template', facts ? safeAnswer(facts, trace.intent) : FIXED_ANSWERS.generalUnavailable, extra);

    // Open claim + cancellation: the manager decides, so the model is never asked for amounts.
    const managerReply = () => withFacts('escalation', safeAnswer(facts, 'cancel'), { reason: 'openClaims' });
    if (isOpenClaimCancellation(facts, trace.intent)) return managerReply();
    if (!drafter) return template();

    let draft;
    try {
      // The customer's name stays out of what the model sees.
      const name = found.policy?.customerName;
      const asked = name ? question.replaceAll(name, 'הלקוח') : question;
      draft = await drafter({ system, user: userPrompt(asked, facts && factLines(facts, 'unknown')) });
      trace.draft = draft;
    } catch (err) {
      trace.modelError = err.message;
      return template({ modelError: err.message });
    }

    // The model's classification can only make the answer stricter, never looser.
    if (draft.regulatorMention) return regulatorReply();
    if (!draft.inScope) return reply('outOfScope', FIXED_ANSWERS.offTopic, { reason: 'offTopic' });
    if (trace.intent === 'unknown') {
      if (draft.intent === 'unclear') return reply('clarify', FIXED_ANSWERS.clarifyIntent, { reason: 'intent' });
      trace.intent = MODEL_INTENTS[draft.intent] ?? draft.intent;
    }
    if (isOpenClaimCancellation(facts, trace.intent)) return managerReply();

    const guard = checkAnswer(draft.answer, facts, { intent: trace.intent, allowed: facts ? undefined : generalAllowed });
    trace.guard = guard;
    if (!guard.passed) return template({ guard });
    return withFacts('llm', draft.answer.trim(), { guard });
  }

  return {
    model: drafter?.model ?? null,
    async answer(question) {
      const started = performance.now();
      const trace = { intent: 'unknown', policyId: null };
      const result = await run(String(question ?? '').trim(), trace);
      result.latencyMs = Math.round(performance.now() - started);
      log({
        question,
        policyId: trace.policyId,
        intent: trace.intent,
        source: result.source,
        answer: result.answer,
        // The rejected draft is kept in the log so guard catches can be reviewed and shown.
        draft: trace.draft && result.source !== 'llm' ? trace.draft.answer : undefined,
        guard: trace.guard,
        modelError: trace.modelError,
        model: drafter?.model ?? null,
        latencyMs: result.latencyMs,
        asOf,
      });
      return result;
    },
  };
}
