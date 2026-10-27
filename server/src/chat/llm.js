// The only module that talks to the model. It returns the parsed draft or throws; the chat
// service turns any failure (no key, timeout, API error, malformed JSON) into the safe template.
import { FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { RESPONSE_SCHEMA } from './prompt.js';

// The previous-generation Flash: on 27.10.2026 gemini-3.8-flash kept returning 503 (high demand)
// while this one answered in 3-6 s. Switch back with GEMINI_MODEL.
const DEFAULT_MODEL = 'gemini-3.6-flash';
// Leaves room for a slow connection; after this the representative gets the safe template.
const DEFAULT_TIMEOUT_MS = 15000;

const INTENTS = RESPONSE_SCHEMA.properties.intent.enum;

function parseDraft(text) {
  const draft = JSON.parse(text);
  const valid =
    typeof draft?.answer === 'string' &&
    draft.answer.trim() &&
    INTENTS.includes(draft.intent) &&
    typeof draft.regulatorMention === 'boolean' &&
    typeof draft.inScope === 'boolean';
  if (!valid) throw new Error('model returned JSON that does not match the schema');
  return draft;
}

// An answer that was cut short (token limit, safety stop) is never used, even if part of it
// happens to parse; a cut that breaks the JSON fails in parseDraft. Either way: safe template.
export function readDraft(response) {
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== FinishReason.STOP) throw new Error(`model stopped early: ${finishReason}`);
  return parseDraft(response.text ?? '');
}

// Returns null when no API key is configured, so the service runs in template-only mode.
export function createGeminiDrafter({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  timeoutMs = Number(process.env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });

  const draft = async ({ system, user }) => {
    const response = await ai.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        // Low thinking keeps the answer fast; the model only phrases facts that code computed.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });
    return readDraft(response);
  };
  draft.model = model;
  return draft;
}
