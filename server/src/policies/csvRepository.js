// Pilot policy source: the CSV export, read once at startup. Read-only, so nothing here
// writes data or needs an audit entry.
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { normalizePolicy } from './normalize.js';

const normalizeName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

export function createCsvRepository(filePath) {
  const rows = parse(fs.readFileSync(filePath), { bom: true, columns: true, skip_empty_lines: true, trim: true });
  const policies = rows.map(normalizePolicy).filter((p) => p.policyId);
  const byId = new Map(policies.map((p) => [p.policyId, p]));

  // Async like the future API source, so callers do not change when the source does.
  return {
    async getPolicy(policyId) {
      const policy = byId.get(String(policyId).trim());
      return policy ? structuredClone(policy) : null;
    },
    async getCustomerPolicies(customerId) {
      return structuredClone(policies.filter((p) => p.customerId === customerId));
    },
    // Exact full-name match; one name can belong to several customers.
    async findByCustomerName(name) {
      const wanted = normalizeName(name);
      return structuredClone(policies.filter((p) => p.customerName === wanted));
    },
  };
}
