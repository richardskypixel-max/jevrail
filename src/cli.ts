import { parseArgs } from 'node:util';
import { OpenRouter, readKeychain, keychainOptions } from './client.ts';
import { SafeError, ensure, hash, canonical, payload, validateJob, dollars } from './schema.ts';
import { readJson, runJob, summary, unlock } from './runner.ts';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    out: { type: 'string' }, 'keychain-service': { type: 'string' }, 'keychain-account': { type: 'string' }, 'budget-usd': { type: 'string', default: '0.01' }, 'reserve-usd': { type: 'string', default: '0.002' },
    'max-attempts': { type: 'string', default: '2' }, concurrency: { type: 'string', default: '1' }, 'max-items': { type: 'string' },
    'allow-sanitized-text': { type: 'boolean', default: false }, help: { type: 'boolean' }, version: { type: 'boolean' },
  } });
  if (values.version) return { name: 'JevRail', version: '0.1.0-alpha.1', runtime: process.version };
  if (values.help || !positionals.length) {
    console.log('Usage: jevrail plan JOB | run JOB --out DIR | status DIR | unlock DIR | key-status | keychain-info\nOptions: --budget-usd 0.01 --reserve-usd 0.002 --max-attempts 1|2 --concurrency 1..4 --max-items N\nBusiness text: --allow-sanitized-text (after local anonymization and authorization)\nCredentials: --keychain-service NAME --keychain-account ACCOUNT (selectors only; never pass a key)\nOnly HTTP 429 may retry once. Requests with an uncertain outcome are never automatically resent.'); return;
  }
  const [command, file] = positionals;
  const selectors = keychainOptions({ service: values['keychain-service'], account: values['keychain-account'] });
  if (command === 'keychain-info') { ensure(positionals.length === 1, 'No arguments expected'); return { ...selectors, credential_read: false, network_requests: 0 }; }
  if (command === 'key-status') { ensure(positionals.length === 1, 'No arguments expected'); return new OpenRouter(() => readKeychain(selectors)).keyStatus(); }
  ensure(file && positionals.length === 2, 'Exactly one job file or output directory is required');
  if (command === 'status') return summary(readJson(file + '/ledger.json'));
  if (command === 'unlock') { unlock(file); return { status: 'DEAD_LOCK_REMOVED', uncertain_requests_preserved: true }; }
  ensure(command === 'plan' || command === 'run', 'Unknown command');
  const job = validateJob(readJson(file), values['allow-sanitized-text']);
  if (command === 'plan') return { status: 'OFFLINE_PLAN', items: job.items.length, model: job.model, data_class: job.data_class,
    standard_version: job.standard_version, request_bytes: job.items.map(i => Buffer.byteLength(canonical(payload(job, i)))), job_sha256: hash(job), paid_requests: 0 };
  ensure(values.out, '--out is required');
  const client = new OpenRouter(() => readKeychain(selectors)), meta = await client.keyStatus();
  ensure(meta.is_management_key === false && meta.is_provisioning_key === false, 'Ordinary non-management API key required');
  ensure(meta.limit_remaining !== null && meta.limit_remaining !== undefined && dollars(meta.limit_remaining) >= dollars(values['budget-usd']), 'Remaining key limit must cover job budget');
  const controller = new AbortController();
  const interrupt = () => controller.abort(); process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    return await runJob(job, values.out, client, { budget: values['budget-usd'], reserve: values['reserve-usd'],
      maxAttempts: Number(values['max-attempts']), concurrency: Number(values.concurrency),
      maxItems: values['max-items'] === undefined ? undefined : Number(values['max-items']), signal: controller.signal });
  } finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
}
main().then(result => { if (result) console.log(JSON.stringify(result, null, 2)); }).catch(error => {
  console.error(JSON.stringify({ status: 'STOPPED', reason: error instanceof SafeError ? error.message : 'Local operation failed; sensitive error details suppressed' })); process.exitCode = 2;
});
