import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MODEL, ENDPOINT, MAX_RESPONSE_BYTES, SafeError, UncertainError, canonical, hashBytes, payload, parseJson, validateJob, validateResponse, dollars } from '../src/schema.ts';
import type { Job, Request } from '../src/schema.ts';
import { OpenRouter, keychainOptions } from '../src/client.ts';
import type { Transport, Reply } from '../src/client.ts';
import { acquire, itemFingerprint, readJson, runJob, saveJson, summary } from '../src/runner.ts';

const project = fileURLToPath(new URL('..', import.meta.url));
const fixture = () => validateJob(readJson(path.join(project, 'examples/smoke-job.json')));
const bytes = (v: unknown) => Buffer.from(JSON.stringify(v));
function response(req: Request): Reply {
  const answers = Object.fromEntries(Object.entries(req.questions).map(([id, q]) => {
    if (q.type === 'noul') return [id, { type: q.type, noul: 1 }];
    const keys = Array.isArray(q.criteria) ? q.criteria.map((_, i) => String(i)) : Object.keys(q.criteria!);
    const distributions = Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0]));
    return [id, { type: q.type, confidence: 1, probabilities: distributions,
      ...(q.type === 'choice' ? { choice: keys[0] } : { score: 0, legend: Object.fromEntries((q.criteria as string[]).map((s, i) => [String(i), s])) }) }];
  }));
  return { status: 200, body: bytes({ id: 'test-only-simulated-response', provider: 'TypeSafe', model: MODEL, answers,
    usage: { input_tokens: 100, output_tokens: 20, cost: 0.0000042 } }) };
}
class Fake implements Transport {
  calls = 0; active = 0; peak = 0;
  handler: (r: Request, index: number, signal?: AbortSignal) => Promise<Reply>;
  constructor(handler?: Fake['handler']) { this.handler = handler ?? (async r => response(r)); }
  async post(req: Request, signal?: AbortSignal) {
    this.calls++; this.active++; this.peak = Math.max(this.peak, this.active);
    try { return await this.handler(req, this.calls, signal); } finally { this.active--; }
  }
  safeToStore(raw: Uint8Array) { return !Buffer.from(raw).toString().includes('TEST_CREDENTIAL'); }
}
async function temp(fn: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jevrail-test-'));
  try { await fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('input contracts: reject unsupported model, secret, URL, PII, oversized and duplicate records before network', () => {
  const mutations = [
    (j: any) => { j.model = '~typesafe/jev-latest'; },
    (j: any) => { j.items[0].state = 'sk-or-v1-' + 'a'.repeat(64); },
    (j: any) => { j.items[0].state = { password: 'hidden' }; },
    (j: any) => { j.items[0].state = 'https://example.com/private.mp4'; },
    (j: any) => { j.items[0].state = '/Users/example/private.txt'; },
    (j: any) => { j.items[0].state = 'someone@example.com'; },
    (j: any) => { j.items[0].state = 'a'.repeat(40000); },
    (j: any) => { j.items[1].id = j.items[0].id; },
    (j: any) => { j.items[0].questions.stage.type = 'execute'; },
  ];
  for (const mutate of mutations) { const j = fixture(); mutate(j); assert.throws(() => validateJob(j), SafeError); }
  const business = fixture(); business.data_class = 'sanitized_text';
  assert.throws(() => validateJob(business)); assert.doesNotThrow(() => validateJob(business, true));
});
test('JSON rejects duplicate keys, non-finite and unsafe integers without echoing input', () => {
  for (const raw of ['{"x":1,"x":2}', '{"x":NaN}', '{"x":9007199254740993}', '{"__proto__":{}}', '{"x":1} garbage']) assert.throws(() => parseJson(raw));
  assert.deepEqual(parseJson('{"id":"9007199254740993","state":null}'), { id: '9007199254740993', state: null });
});
test('result validates provider, snapshot, IDs, cost, scale, labels and probabilities', () => {
  const request = payload(fixture(), fixture().items[0]);
  const mutations = [
    (r: any) => { r.provider = 'Other'; }, (r: any) => { r.model = 'other/model'; },
    (r: any) => { delete r.usage.cost; }, (r: any) => { r.answers.verified_complete.noul = 1.1; },
    (r: any) => { r.answers.stage.choice = 'invented'; }, (r: any) => { r.answers.completion_level.score = 5; },
    (r: any) => { r.answers.completion_level.legend['0'] = 'changed'; },
    (r: any) => { r.answers.stage.probabilities.complete = 0; },
  ];
  assert.doesNotThrow(() => validateResponse(response(request).body, request));
  for (const mutate of mutations) { const r = JSON.parse(Buffer.from(response(request).body).toString()); mutate(r); assert.throws(() => validateResponse(bytes(r), request)); }
});
test('partial execution resumes remaining items then uses verified cache without more posts', async () => temp(async root => {
  const job = fixture(), fake = new Fake();
  assert.equal((await runJob(job, root, fake, { maxItems: 1 })).success, 1);
  assert.equal((await runJob(job, root, fake)).completed_this_run, 2);
  const cached = await runJob(job, root, fake); assert.equal(cached.cache_hits, 3); assert.equal(fake.calls, 3);
  assert.equal(fs.statSync(root).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(root, 'ledger.json')).mode & 0o777, 0o600);
}));
test('changed job and tampered cached bytes block further paid calls', async () => temp(async root => {
  const job = fixture(), fake = new Fake(); await runJob(job, root, fake, { maxItems: 1 });
  const changed = structuredClone(job); changed.standard_version = 'new';
  await assert.rejects(runJob(changed, root, fake)); assert.equal(fake.calls, 1);
  fs.appendFileSync(path.join(root, itemFingerprint(job, job.items[0]), 'attempt-1/response.raw.json'), ' ');
  await assert.rejects(runJob(job, root, fake)); assert.equal(fake.calls, 1);
}));
test('timeout is marked uncertain, reservation held, resume cannot resend', async () => temp(async root => {
  const fake = new Fake(async () => { throw new UncertainError('TEST_CREDENTIAL should never be printed'); });
  await assert.rejects(runJob(fixture(), root, fake));
  await assert.rejects(runJob(fixture(), root, fake)); assert.equal(fake.calls, 1);
  const s = summary(readJson(path.join(root, 'ledger.json'))); assert.equal(s.unresolved, 1); assert.equal(s.uncertain_reserved_usd, '0.002000000');
  assert(!fs.readFileSync(path.join(root, 'ledger.json'), 'utf8').includes('TEST_CREDENTIAL'));
}));
test('429 retries are bounded and keep conservative reservations', async () => temp(async root => {
  const fake = new Fake(async (r, i) => i === 1 ? { status: 429, body: bytes({ error: 'rate limited' }) } : response(r));
  const result = await runJob(fixture(), root, fake, { maxItems: 1, sleep: async () => {} });
  assert.equal(fake.calls, 2); assert.equal(result.success, 1); assert.equal(result.uncertain_reserved_usd, '0.002000000');
}));
test('exhausted 429 retries stop; 500 and redirects do not retry', async () => {
  for (const status of [429, 500, 307]) await temp(async root => {
    const fake = new Fake(async () => ({ status, body: bytes({ error: 'synthetic' }) }));
    await assert.rejects(runJob(fixture(), root, fake, { sleep: async () => {} }));
    assert.equal(fake.calls, status === 429 ? 2 : 1);
  });
});
test('budget reservations cap concurrent sends before network', async () => temp(async root => {
  const fake = new Fake(async r => { await new Promise(resolve => setTimeout(resolve, 20)); return response(r); });
  await assert.rejects(runJob(fixture(), root, fake, { budget: '0.004', reserve: '0.002', concurrency: 3 }));
  assert.equal(fake.calls, 2); assert.equal(fake.peak, 2);
}));
test('concurrency is bounded and successful parallel writes retain every result', async () => temp(async root => {
  const fake = new Fake(async r => { await new Promise(resolve => setTimeout(resolve, 10)); return response(r); });
  const result = await runJob(fixture(), root, fake, { concurrency: 2 });
  assert.equal(result.success, 3); assert.equal(fake.peak, 2); assert.equal(result.http_attempts, 3);
}));
test('single writer lock rejects overlap without paid requests', async () => temp(async root => {
  const release = acquire(root), fake = new Fake();
  try { await assert.rejects(runJob(fixture(), root, fake)); assert.equal(fake.calls, 0); } finally { release(); }
}));
test('crash-persisted in-flight state is never automatically resent', async () => temp(async root => {
  const job = fixture(), fake = new Fake(); await runJob(job, root, fake, { maxItems: 1 });
  const ledger = readJson(path.join(root, 'ledger.json')); ledger.entries.completed.status = 'in_flight'; saveJson(path.join(root, 'ledger.json'), ledger);
  await assert.rejects(runJob(job, root, fake)); assert.equal(fake.calls, 1);
}));
test('unexpected cost and credential-like response halt and do not leak', async () => {
  await temp(async root => {
    const fake = new Fake(async r => { const b = JSON.parse(Buffer.from(response(r).body).toString()); b.usage.cost = 0.003; return { status: 200, body: bytes(b) }; });
    await assert.rejects(runJob(fixture(), root, fake)); assert.equal(fake.calls, 1);
    assert.equal(summary(readJson(path.join(root, 'ledger.json'))).actual_cost_usd, '0.003000000');
  });
  await temp(async root => {
    const fake = new Fake(async () => ({ status: 200, body: bytes({ secret: 'TEST_CREDENTIAL' }) }));
    await assert.rejects(runJob(fixture(), root, fake));
    assert(!fs.existsSync(path.join(root, itemFingerprint(fixture(), fixture().items[0]), 'attempt-1/response.raw.json')));
  });
});
test('production transport fixes destination and rejects redirects; private credential cannot be serialized', async () => {
  let calls = 0;
  const fakeFetch: typeof fetch = async (url, options) => {
    calls++; assert.equal(url, ENDPOINT); assert.equal(options?.redirect, 'error'); assert(options?.signal);
    return new Response('{}', { status: 200 });
  };
  const c = new OpenRouter(() => 'FAKE_TEST_KEY', fakeFetch);
  assert(!JSON.stringify(c).includes('FAKE_TEST_KEY'));
  await c.post(payload(fixture(), fixture().items[0]));
  await assert.rejects(c.request('https://example.com/collect')); assert.equal(calls, 1);
  assert.equal(c.safeToStore(Buffer.from('{"echo":"FAKE_TEST_KEY"}')), false);
});
test('production transport stops oversized responses and sanitizes thrown errors', async () => {
  const c = new OpenRouter(() => 'FAKE_TEST_KEY', async () => new Response('a'.repeat(MAX_RESPONSE_BYTES + 1)));
  await assert.rejects(c.post(payload(fixture(), fixture().items[0])), UncertainError);
  const e = new OpenRouter(() => 'FAKE_TEST_KEY', async () => { throw new Error('FAKE_TEST_KEY'); });
  await assert.rejects(e.post(payload(fixture(), fixture().items[0])), x => x instanceof Error && !x.message.includes('FAKE_TEST_KEY'));
});
test('launcher removes startup injection; offline plan does not read credentials', () => {
  const result = spawnSync(path.join(project, 'jevrail'), ['plan', path.join(project, 'examples/smoke-job.json')], {
    encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '--require=/nonexistent/injection.cjs', NODE_TLS_REJECT_UNAUTHORIZED: '0', OPENROUTER_API_KEY: 'TEST_CREDENTIAL' },
  });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).paid_requests, 0); assert(!result.stdout.includes('TEST_CREDENTIAL'));
});
test('money accounting handles sub-cent costs without cumulative float drift', () => {
  assert.equal(dollars(0.0000042), 4200); assert.equal(dollars('0.01'), 10_000_000);
});
test('key metadata excludes unknown fields and suppresses credential-like or malformed values', async () => {
  const data = { is_management_key: false, is_provisioning_key: false, limit: 5, limit_remaining: 4.99, usage: 0.01, label: 'ignored' };
  const make = (value: unknown) => new OpenRouter(() => 'FAKE_TEST_KEY', async () => new Response(JSON.stringify({ data: value })));
  assert(!Object.hasOwn(await make(data).keyStatus(), 'label'));
  await assert.rejects(make({ ...data, usage: 'FAKE_TEST_KEY' }).keyStatus());
  await assert.rejects(make({ ...data, limit_remaining: '4.99' }).keyStatus());
  await assert.rejects(make({ ...data, is_management_key: 'false' }).keyStatus());
});
test('public Keychain selectors have portable defaults and never accept credential-like values', () => {
  assert.equal(keychainOptions().service, 'jevrail.openrouter');
  assert.deepEqual(keychainOptions({ service: 'my-item', account: 'example' }), { service: 'my-item', account: 'example' });
  for (const value of ['', '\n', 'x'.repeat(129), 'sk-or-v1-' + 'b'.repeat(32)]) {
    assert.throws(() => keychainOptions({ service: value }));
    assert.throws(() => keychainOptions({ account: value }));
  }
});
test('public CLI works outside its checkout and keychain-info performs no credential lookup', () => {
  const cli = path.join(project, 'jevrail');
  const info = spawnSync(cli, ['keychain-info', '--keychain-service', 'example-item', '--keychain-account', 'example'], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(info.status, 0);
  assert.deepEqual(JSON.parse(info.stdout), { service: 'example-item', account: 'example', credential_read: false, network_requests: 0 });
  const plan = spawnSync(cli, ['plan', path.join(project, 'examples/smoke-job.json')], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(plan.status, 0); assert.equal(JSON.parse(plan.stdout).paid_requests, 0);
  const version = spawnSync(cli, ['--version'], { encoding: 'utf8' });
  assert.equal(version.status, 0);
  assert.equal(JSON.parse(version.stdout).version, readJson(path.join(project, 'package.json')).version);
});
