// The only way the rest of the server reaches policy data. Switching the pilot CSV for the
// policy system's API is a POLICY_SOURCE change; the rules engine never sees the difference.
import path from 'node:path';
import { createCsvRepository } from './csvRepository.js';
import { createApiRepository } from './apiRepository.js';

const DEFAULT_CSV = path.resolve(import.meta.dirname, '../../../data/policies.csv');

export function createPolicyRepository({ source = process.env.POLICY_SOURCE || 'csv', csvPath = DEFAULT_CSV } = {}) {
  if (source === 'csv') return createCsvRepository(csvPath);
  if (source === 'api') return createApiRepository();
  throw new Error(`Unknown POLICY_SOURCE "${source}" - use csv or api`);
}
