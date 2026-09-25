import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SafeError, UncertainError, canonical, hash, hashBytes, ensure, parseJson, dollars, formatDollars, payload, validateJob, validateResponse } from './schema.ts';
import type { Job, Item } from './schema.ts';
import type { Transport } from './client.ts';

type Attempt = { status: string; started_at: string; reserve_nano: number; actual_nano: number | null;
  request_sha256: string; http_status?: number; response_sha256?: string; latency_ms?: number;
  response_id?: string; model?: string; provider?: string; usage?: unknown; error_class?: string };
type Entry = { status: string; attempts: Attempt[] };
export type Ledger = { schema_version: string; job_sha256: string; standard_version: string;
  policy: { budget_nano: number; reserve_nano: number; max_attempts: number; concurrency: number };
  entries: Record<string, Entry> };
export type Options = { budget?: string; reserve?: string; maxAttempts?: number; concurrency?: number;
  maxItems?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void> };
export function privateDir(root: string): void {
  if (fs.existsSync(root)) ensure(!fs.lstatSync(root).isSymbolicLink(), 'Symbolic output directory is blocked');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  ensure(fs.statSync(root).uid === process.getuid!(), 'Output directory belongs to another user');
  fs.chmodSync(root, 0o700);
}
export function atomicBytes(file: string, bytes: Uint8Array): void {
  if (fs.existsSync(file)) ensure(!fs.lstatSync(file).isSymbolicLink(), 'Symbolic output file is blocked');
  const temp = path.join(path.dirname(file), '.write-' + randomUUID());
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
    const dir = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export function saveJson(file: string, data: unknown): void { atomicBytes(file, Buffer.from(JSON.stringify(data, null, 2) + '\n')); }
export function readJson(file: string): any {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { ensure(fs.fstatSync(fd).size <= 8 * 1024 * 1024, 'Local JSON exceeds 8 MiB'); return parseJson(fs.readFileSync(fd, 'utf8')); }
  finally { fs.closeSync(fd); }
}
export function acquire(root: string): () => void {
  const lock = path.join(root, '.run-lock');
  try { fs.mkdirSync(lock, { mode: 0o700 }); }
  catch { throw new SafeError('Job is locked; inspect status or use unlock after its process has exited'); }
  try { saveJson(path.join(lock, 'owner.json'), { pid: process.pid, created_at: new Date().toISOString() }); }
  catch (e) { fs.rmdirSync(lock); throw e; }
  return () => { fs.unlinkSync(path.join(lock, 'owner.json')); fs.rmdirSync(lock); };
}
export function unlock(root: string): void {
  const lock = path.join(root, '.run-lock');
  const owner = readJson(path.join(lock, 'owner.json'));
  ensure(Number.isSafeInteger(owner.pid) && owner.pid > 0, 'Lock owner is unknown; refusing removal');
  try { process.kill(owner.pid, 0); throw new SafeError('Lock owner is still running'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
  fs.unlinkSync(path.join(lock, 'owner.json')); fs.rmdirSync(lock);
  // A stale lock may be removed; in-flight requests remain uncertain in the ledger.
}
export function summary(l: Ledger) {
  const entries = Object.values(l.entries), attempts = entries.flatMap(e => e.attempts);
  const actual = attempts.reduce((s, a) => s + (a.actual_nano ?? 0), 0);
  const held = attempts.reduce((s, a) => s + (a.actual_nano === null ? a.reserve_nano : 0), 0);
  return { job_sha256: l.job_sha256, items: entries.length, success: entries.filter(e => e.status === 'success').length,
    pending: entries.filter(e => e.status === 'pending').length,
    unresolved: entries.filter(e => !['pending', 'success'].includes(e.status)).length,
    http_attempts: attempts.length, actual_cost_usd: formatDollars(actual), uncertain_reserved_usd: formatDollars(held),
    budget_usd: formatDollars(l.policy.budget_nano) };
}
export const itemFingerprint = (job: Job, item: Item) => hash({ standard_version: job.standard_version, model: job.model, item });
export async function runJob(job: Job, root: string, client: Transport, options: Options = {}) {
  validateJob(job, true);
  const policy = { budget_nano: dollars(options.budget ?? '0.01'), reserve_nano: dollars(options.reserve ?? '0.002'),
    max_attempts: options.maxAttempts ?? 2, concurrency: options.concurrency ?? 1 };
  ensure(policy.reserve_nano > 0 && policy.reserve_nano <= policy.budget_nano, 'Invalid budget reservation');
  ensure([1, 2].includes(policy.max_attempts) && [1, 2, 3, 4].includes(policy.concurrency), 'Invalid retry or concurrency limit');
  ensure(options.maxItems === undefined || (Number.isSafeInteger(options.maxItems) && options.maxItems > 0), 'max-items must be positive');
  privateDir(root);
  const release = acquire(root), ledgerPath = path.join(root, 'ledger.json');
  let stopped = false, next = 0, completed = 0, cached = 0;
  try {
    let ledger: Ledger;
    if (fs.existsSync(ledgerPath)) {
      ledger = readJson(ledgerPath);
      ensure(ledger.job_sha256 === hash(job) && canonical(ledger.policy) === canonical(policy), 'Changed job or budget requires a new output directory');
      ensure(canonical(Object.keys(ledger.entries).sort()) === canonical(job.items.map(i => i.id).sort()), 'Ledger item IDs changed');
    } else {
      ledger = { schema_version: 'jev-direct-ledger/1', job_sha256: hash(job), standard_version: job.standard_version,
        policy, entries: Object.fromEntries(job.items.map(item => [item.id, { status: 'pending', attempts: [] }])) };
      saveJson(path.join(root, 'job.json'), job); saveJson(ledgerPath, ledger);
    }
    ensure(summary(ledger).unresolved === 0, 'Failed or uncertain requests require manual verification before any resend');
    // Validate every cache before starting any new paid call.
    const pending: Item[] = [];
    for (const item of job.items) {
      const entry = ledger.entries[item.id];
      if (entry.status !== 'success') { pending.push(item); continue; }
      const attempt = entry.attempts.at(-1)!;
      const file = path.join(root, itemFingerprint(job, item), `attempt-${entry.attempts.length}`, 'response.raw.json');
      ensure(!fs.lstatSync(file).isSymbolicLink(), 'Symbolic cached response is blocked');
      const raw = fs.readFileSync(file);
      ensure(hashBytes(raw) === attempt.response_sha256, 'Cached raw response was modified');
      const r = validateResponse(raw, payload(job, item));
      ensure(dollars(r.usage.cost) === attempt.actual_nano, 'Cached cost differs from ledger');
      cached++;
    }
    const queue = pending.slice(0, options.maxItems ?? pending.length);
    async function evaluate(item: Item) {
      const entry = ledger.entries[item.id], request = payload(job, item);
      const dir = path.join(root, itemFingerprint(job, item)); privateDir(dir);
      for (let index = 0; index < policy.max_attempts; index++) {
        ensure(!options.signal?.aborted && !stopped, 'Job interrupted before sending');
        const all = Object.values(ledger.entries).flatMap(e => e.attempts);
        const committed = all.reduce((s, a) => s + (a.actual_nano ?? a.reserve_nano), 0);
        ensure(committed + policy.reserve_nano <= policy.budget_nano, 'Local reservation budget exhausted; no further request sent');
        const attemptDir = path.join(dir, `attempt-${entry.attempts.length + 1}`); privateDir(attemptDir);
        atomicBytes(path.join(attemptDir, 'request.json'), Buffer.from(canonical(request) + '\n'));
        const attempt: Attempt = { started_at: new Date().toISOString(), status: 'in_flight', reserve_nano: policy.reserve_nano,
          actual_nano: null, request_sha256: hash(request) };
        entry.attempts.push(attempt); entry.status = 'in_flight';
        saveJson(ledgerPath, ledger); // Synchronous reservation occurs before the first await.
        const start = performance.now();
        try {
          const reply = await client.post(request, options.signal);
          attempt.http_status = reply.status;
          attempt.latency_ms = Math.round(performance.now() - start);
          ensure(client.safeToStore(reply.body), 'Credential-like response was not saved');
          atomicBytes(path.join(attemptDir, 'response.raw.json'), reply.body);
          attempt.response_sha256 = hashBytes(reply.body);
          if (reply.status === 429) {
            attempt.status = entry.status = 'rate_limited'; saveJson(ledgerPath, ledger);
            if (index + 1 < policy.max_attempts && !stopped && !options.signal?.aborted) {
              await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(1000);
              continue;
            }
            throw new SafeError('Rate-limit retry allowance exhausted');
          }
          if (reply.status !== 200) throw new UncertainError('Non-success HTTP response; no automatic retry');
          const result = validateResponse(reply.body, request);
          attempt.actual_nano = dollars(result.usage.cost);
          attempt.response_id = result.id; attempt.model = result.model; attempt.provider = result.provider; attempt.usage = result.usage;
          ensure(attempt.actual_nano <= policy.reserve_nano, 'Actual cost exceeded reservation; job halted');
          saveJson(path.join(attemptDir, 'result.json'), { status: 'JEV_RAW_VALIDATED', source: 'openrouter_direct', item_id: item.id,
            standard_version: job.standard_version, request_sha256: attempt.request_sha256, response_sha256: attempt.response_sha256,
            model: result.model, provider: result.provider, answers: result.answers, usage: result.usage, interpretation: null });
          attempt.status = entry.status = 'success'; saveJson(ledgerPath, ledger); completed++; return;
        } catch (e) {
          stopped = true;
          if (attempt.status !== 'rate_limited') attempt.status = entry.status = 'uncertain';
          attempt.error_class = e instanceof UncertainError ? 'DeliveryUnknown' : 'ValidationOrLocalFailure';
          attempt.latency_ms = Math.round(performance.now() - start); saveJson(ledgerPath, ledger);
          throw new SafeError('Request stopped; inspect private ledger. Uncertain calls will not be resent');
        }
      }
    }
    let failed = false;
    async function worker() {
      while (!stopped && next < queue.length) {
        const item = queue[next++];
        try { await evaluate(item); }
        catch { failed = stopped = true; }
      }
    }
    await Promise.all(Array.from({ length: policy.concurrency }, worker));
    const result = { ...summary(ledger), completed_this_run: completed, cache_hits: cached };
    saveJson(path.join(root, 'summary.json'), result);
    if (failed) throw new SafeError('Job stopped safely; inspect status. No uncertain request will be automatically resent');
    return result;
  } finally { release(); }
}
