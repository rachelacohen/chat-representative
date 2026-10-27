// The only data layer in the app. Every write goes through create/update/remove,
// and each one appends an audit entry with before/after snapshots.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { currentActor } from './context.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.jsonl');

// collection -> audited entityType. A collection missing here cannot be read or written.
const AUDITED = { tasks: 'Task' };

const SECRET_KEY = /pass(word)?|token|secret|api[-_]?key|card|cvv/i;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
for (const name of Object.keys(AUDITED)) db[name] ??= [];

function persist() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[REDACTED]' : redact(v)]),
    );
  }
  return value;
}

function audit(collection, action, entityId, before, after) {
  const entry = {
    id: randomUUID(),
    actorUserId: currentActor(),
    action,
    entityType: AUDITED[collection],
    entityId,
    beforeJson: before ? redact(before) : null,
    afterJson: after ? redact(after) : null,
    createdAt: new Date().toISOString(),
  };
  try {
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    // A failed audit write must never fail the business operation.
    console.error('[audit] failed to write entry', err, entry);
  }
}

function table(collection) {
  if (!AUDITED[collection]) throw new Error(`Unknown collection "${collection}" - register it in AUDITED`);
  return db[collection];
}

export function list(collection) {
  return structuredClone(table(collection));
}

export function create(collection, data) {
  const now = new Date().toISOString();
  const row = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
  table(collection).push(row);
  persist();
  audit(collection, 'create', row.id, null, row);
  return structuredClone(row);
}

export function update(collection, id, patch) {
  const rows = table(collection);
  const index = rows.findIndex((r) => r.id === id);
  if (index === -1) return null;
  const before = rows[index];
  const after = { ...before, ...patch, id, updatedAt: new Date().toISOString() };
  rows[index] = after;
  persist();
  audit(collection, 'update', id, before, after);
  return structuredClone(after);
}

export function remove(collection, id) {
  const rows = table(collection);
  const index = rows.findIndex((r) => r.id === id);
  if (index === -1) return false;
  const [before] = rows.splice(index, 1);
  persist();
  audit(collection, 'delete', id, before, null);
  return true;
}

export function listAudit({ entityType, entityId, limit = 100 } = {}) {
  if (!fs.existsSync(AUDIT_FILE)) return [];
  return fs
    .readFileSync(AUDIT_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((e) => (!entityType || e.entityType === entityType) && (!entityId || e.entityId === entityId))
    .slice(-limit)
    .reverse();
}
