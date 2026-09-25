import { createHash } from 'node:crypto';

export const MODEL = 'typesafe/jev-1.13-20260917';
export const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export const MAX_INPUT_BYTES = 32_768;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const SECRET = /sk-(?:or-v1-)?[A-Za-z0-9_-]{20,}|Bearer\s+\S{12,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PRIVATE_FIELDS = new Set(['api_key', 'apikey', 'authorization', 'password', 'secret', 'access_token', 'refresh_token']);
const UNSAFE_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);
export class SafeError extends Error {}
export class UncertainError extends SafeError {}
export type Question = { type: 'noul' | 'choice' | 'score'; instructions: string; criteria?: Record<string, string | null> | string[] };
export type Item = { id: string; state: unknown; questions: Record<string, Question> };
export type Job = { schema_version: string; standard_version: string; data_class: 'synthetic' | 'sanitized_text'; model: string; items: Item[] };
export type Request = { model: string; state: unknown; questions: Record<string, Question> };
export type Result = { id: string; model: string; provider: string; answers: Record<string, Record<string, unknown>>; usage: { input_tokens: number; output_tokens: number; cost: number } };
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SafeError(message);
}
export function object(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const sameKeys = (a: object, b: object) => Object.keys(a).sort().join('\0') === Object.keys(b).sort().join('\0');
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  const result = JSON.stringify(value);
  ensure(result !== undefined && !(typeof value === 'number' && !Number.isFinite(value)), 'Non-JSON value');
  return result;
}
export const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
export const hashBytes = (v: Uint8Array) => createHash('sha256').update(v).digest('hex');

// Reject duplicate object keys before JSON.parse would silently discard evidence.
export function parseJson(raw: string): any {
  try {
    const tokens = raw.match(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]|[^\s]/g) ?? [];
    let i = 0;
    const walk = (depth = 0): void => {
      ensure(depth < 80, 'JSON nesting exceeds limit');
      const token = tokens[i++];
      if (token === '{') {
        const keys = new Set<string>();
        if (tokens[i] === '}') { i++; return; }
        while (true) {
          const key = JSON.parse(tokens[i++]);
          ensure(typeof key === 'string' && !keys.has(key) && !UNSAFE_FIELDS.has(key), 'Duplicate or unsafe JSON key');
          keys.add(key);
          ensure(tokens[i++] === ':', 'Invalid JSON');
          walk(depth + 1);
          const delimiter = tokens[i++];
          if (delimiter === '}') return;
          ensure(delimiter === ',', 'Invalid JSON');
        }
      }
      if (token === '[') {
        if (tokens[i] === ']') { i++; return; }
        while (true) {
          walk(depth + 1);
          const delimiter = tokens[i++];
          if (delimiter === ']') return;
          ensure(delimiter === ',', 'Invalid JSON');
        }
      }
      ensure(token !== undefined && token !== '}' && token !== ']', 'Invalid JSON');
      const value = JSON.parse(token);
      if (typeof value === 'number') ensure(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'Unsafe numeric precision; encode long IDs as strings');
    };
    walk();
    ensure(i === tokens.length, 'Unexpected JSON tail');
    return JSON.parse(raw);
  } catch (e) {
    if (e instanceof SafeError) throw e;
    throw new SafeError('Invalid JSON document');
  }
}
export function screenText(v: unknown): void {
  if (Array.isArray(v)) { v.forEach(screenText); return; }
  if (object(v)) {
    for (const [key, value] of Object.entries(v)) {
      ensure(!PRIVATE_FIELDS.has(key.toLowerCase()) && !UNSAFE_FIELDS.has(key), 'Credential or unsafe field in input');
      screenText(key); screenText(value);
    }
  } else if (typeof v === 'string') {
    ensure(!SECRET.test(v), 'Credential-like text in input');
    ensure(!/https?:\/\/|file:\/\/|data:(?:image|audio|video)\/|\/(?:Users|Volumes|home)\//i.test(v), 'Media URL or local path in input; anonymous text only');
    ensure(!/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|(?<!\d)1[3-9]\d{9}(?!\d)/.test(v), 'Possible contact information; anonymize locally');
  }
}
export const payload = (job: Job, item: Item): Request => ({ model: job.model, state: item.state, questions: item.questions });
export function validateJob(v: unknown, allowSanitized = false): Job {
  ensure(object(v) && sameKeys(v, { schema_version: 0, standard_version: 0, data_class: 0, model: 0, items: 0 }), 'Unexpected job fields');
  ensure(v.schema_version === 'jev-direct-job/1' && v.model === MODEL, 'Unapproved schema or model snapshot');
  ensure(typeof v.standard_version === 'string' && v.standard_version.trim(), 'Frozen standard_version required');
  ensure(v.data_class === 'synthetic' || v.data_class === 'sanitized_text', 'Only synthetic or sanitized_text allowed');
  ensure(v.data_class === 'synthetic' || allowSanitized, 'Business text requires --allow-sanitized-text');
  ensure(Array.isArray(v.items) && v.items.length > 0 && v.items.length <= 500, 'Need 1 to 500 items');
  const ids = new Set<string>();
  for (const item of v.items) {
    ensure(object(item) && sameKeys(item, { id: 0, state: 0, questions: 0 }), 'Invalid item fields');
    ensure(typeof item.id === 'string' && /^[\w-]{1,80}$/.test(item.id) && !ids.has(item.id), 'Duplicate or unsafe item ID');
    ids.add(item.id);
    ensure(item.state !== null && item.state !== undefined, 'State required; unknown subfields may be null');
    ensure(object(item.questions) && Object.keys(item.questions).length > 0 && Object.keys(item.questions).length <= 16, 'Need 1 to 16 questions');
    for (const [id, q] of Object.entries(item.questions)) {
      ensure(/^[\w-]{1,80}$/.test(id) && object(q), 'Invalid question');
      ensure(Object.keys(q).every(k => ['type', 'instructions', 'criteria'].includes(k)), 'Unknown question field');
      ensure(typeof q.instructions === 'string' && q.instructions.trim(), 'Explicit question instructions required');
      const c = q.criteria;
      if (q.type === 'noul') ensure(c === undefined || (object(c) && sameKeys(c, { true: 0, false: 0 }) && Object.values(c).every(x => typeof x === 'string')), 'Invalid noul criteria');
      else if (q.type === 'choice') ensure(object(c) && Object.keys(c).length >= 2 && Object.keys(c).length <= 32 && Object.entries(c).every(([k, x]) => k && (x === null || typeof x === 'string')), 'Invalid choice criteria');
      else if (q.type === 'score') ensure(Array.isArray(c) && c.length >= 2 && c.length <= 32 && c.every(x => typeof x === 'string' && x.trim()), 'Invalid score criteria');
      else throw new SafeError('Only noul, choice and score are supported');
    }
    ensure(Buffer.byteLength(canonical(payload(v as Job, item as Item))) <= MAX_INPUT_BYTES, 'Request exceeds 32 KiB');
  }
  screenText(v);
  return v as Job;
}
export function finite(v: unknown, lo: number, hi: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
}
// Integer nanodollars avoid floating-point accumulation. Always round cost up.
export function dollars(v: unknown): number {
  ensure((typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v)) || typeof v === 'number', 'Invalid USD amount');
  const n = Number(v);
  ensure(Number.isFinite(n) && n >= 0 && n <= 1000, 'Invalid USD amount');
  return Math.ceil(n * 1e9 - 1e-7);
}
export const formatDollars = (nano: number) => (nano / 1e9).toFixed(9);
export function validateResponse(raw: Uint8Array, req: Request): Result {
  const r = parseJson(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  ensure(object(r) && r.model === MODEL && r.provider === 'TypeSafe', 'Unexpected model or provider');
  ensure(typeof r.id === 'string' && r.id, 'Missing provider request ID');
  ensure(object(r.answers) && sameKeys(r.answers, req.questions), 'Question IDs do not match response');
  for (const [id, q] of Object.entries(req.questions)) {
    const a = r.answers[id];
    ensure(object(a) && a.type === q.type, 'Answer type mismatch');
    if (q.type === 'noul') { ensure(finite(a.noul, 0, 1), 'Invalid noul probability'); continue; }
    const criteria = q.criteria!;
    const expected = Array.isArray(criteria) ? Object.fromEntries(criteria.map((x, i) => [String(i), x])) : criteria;
    ensure(object(a.probabilities) && sameKeys(a.probabilities, expected) && Object.values(a.probabilities).every(x => finite(x, 0, 1)), 'Invalid probability distribution');
    const ps = Object.values(a.probabilities) as number[];
    ensure(Math.abs(ps.reduce((s, x) => s + x, 0) - 1) <= 0.011 + ps.length * 0.005, 'Probability total is invalid');
    ensure(finite(a.confidence, 0, 1), 'Invalid confidence');
    if (q.type === 'choice') ensure(typeof a.choice === 'string' && Object.hasOwn(expected, a.choice), 'Choice outside criteria');
    else {
      ensure(finite(a.score, 0, (criteria as string[]).length - 1), 'Score outside ordered scale');
      ensure(canonical(a.legend) === canonical(expected), 'Score legend mismatch');
    }
  }
  ensure(object(r.usage) && typeof r.usage.cost === 'number', 'Actual cost missing');
  dollars(r.usage.cost);
  for (const k of ['input_tokens', 'output_tokens']) ensure(Number.isSafeInteger(r.usage[k]) && r.usage[k] >= 0, 'Token usage invalid');
  return r as Result;
}
