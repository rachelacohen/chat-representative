// Wires the chat service from the environment, for the HTTP server and the CLI alike.
import { createPolicyRepository } from '../policies/repository.js';
import { parseDate } from '../policies/normalize.js';
import { PILOT_AS_OF } from '../rules/config.js';
import { appendChatLog } from '../store.js';
import { createGeminiDrafter } from './llm.js';
import { loadPolicyDocs } from './prompt.js';
import { createChatService } from './service.js';

export function createAppChatService() {
  const asOf = parseDate(process.env.AS_OF_DATE || PILOT_AS_OF);
  if (!asOf) throw new Error(`AS_OF_DATE "${process.env.AS_OF_DATE}" is not a date - use YYYY-MM-DD`);
  return createChatService({
    repo: createPolicyRepository(),
    drafter: createGeminiDrafter(),
    asOf,
    policyDocs: loadPolicyDocs(),
    log: appendChatLog,
  });
}
