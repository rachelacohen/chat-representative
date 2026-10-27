// Runs against the real pilot export in data/policies.csv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyRepository } from '../src/policies/repository.js';

const repo = createPolicyRepository({ source: 'csv' });

test('every row of the export loads without data warnings', async () => {
  const ids = [];
  for (let id = 4401; id <= 4471; id++) {
    const policy = await repo.getPolicy(String(id));
    if (!policy) continue;
    ids.push(policy.policyId);
    assert.deepEqual(policy.dataWarnings, [], `policy ${id}`);
  }
  assert.equal(ids.length, 61);
});

test('slash dates are read as day/month/year', async () => {
  assert.equal((await repo.getPolicy('4408')).startDate, '2023-03-15');
  assert.equal((await repo.getPolicy('4449')).startDate, '2025-01-20');
  const p4421 = await repo.getPolicy('4421');
  assert.equal(p4421.startDate, '2024-07-02');
  assert.equal(p4421.lastPaymentDate, '2026-10-01');
});

test('quoted notes with a comma and the frozen status parse correctly', async () => {
  const policy = await repo.getPolicy('4455');
  assert.equal(policy.status, 'frozen');
  assert.equal(policy.product, 'home');
  assert.equal(policy.notes, 'לקוח ביקש הקפאה 09/2026, לבדוק מול גבייה');
});

test('policies are found by customer id, not by name', async () => {
  const c1072 = await repo.getCustomerPolicies('C-1072');
  assert.deepEqual(c1072.map((p) => p.policyId), ['4418', '4433']);

  const sameName = await repo.findByCustomerName('מור  שפירא ');
  assert.deepEqual(sameName.map((p) => [p.policyId, p.customerId]), [['4409', 'C-1059'], ['4413', 'C-1063']]);
});

test('unknown policy returns null', async () => {
  assert.equal(await repo.getPolicy('9999'), null);
  assert.deepEqual(await repo.findByCustomerName('אין כזה'), []);
});

test('callers get copies, not the stored records', async () => {
  const policy = await repo.getPolicy('4471');
  policy.monthlyPremium = 1;
  assert.equal((await repo.getPolicy('4471')).monthlyPremium, 410);
});

test('the api source is wired but not implemented in the pilot', async () => {
  const api = createPolicyRepository({ source: 'api' });
  await assert.rejects(api.getPolicy('4471'), /not implemented/);
  assert.throws(() => createPolicyRepository({ source: 'excel' }), /Unknown POLICY_SOURCE/);
});
