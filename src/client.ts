import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { ENDPOINT, MAX_RESPONSE_BYTES, SECRET, SafeError, UncertainError, canonical, ensure, parseJson } from './schema.ts';
import type { Request } from './schema.ts';

export const KEY_ENDPOINT = 'https://openrouter.ai/api/v1/key';
export interface Reply { status: number; body: Uint8Array }
export interface Transport {
  post(request: Request, signal?: AbortSignal): Promise<Reply>;
  safeToStore(raw: Uint8Array): boolean;
}
export type KeychainOptions = { service?: string; account?: string };
export function keychainOptions(options: KeychainOptions = {}) {
  const result = { service: options.service ?? 'jevrail.openrouter', account: options.account ?? userInfo().username };
  for (const value of Object.values(result)) ensure(typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value) && !SECRET.test(value), 'Invalid keychain selector');
  return result;
}
export function readKeychain(options: KeychainOptions = {}): string {
  ensure(process.platform === 'darwin', 'Live credentials require macOS Keychain; offline tools work without it');
  const { service, account } = keychainOptions(options);
  try {
    const raw = execFileSync('/usr/bin/security', ['find-generic-password', '-a', account,
      '-s', service, '-w'], { encoding: 'utf8', timeout: 20_000, maxBuffer: 4096,
        stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } }).trim();
    ensure(/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(raw), 'Credential format invalid');
    return raw;
  } catch { throw new SafeError('Existing OpenRouter credential is unavailable in macOS Keychain'); }
}
export class OpenRouter implements Transport {
  #key: string;
  #fetch: typeof fetch;
  constructor(keyReader: () => string = readKeychain, fetchImpl: typeof fetch = fetch) {
    ensure(process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', 'TLS verification must remain enabled');
    this.#key = keyReader();
    this.#fetch = fetchImpl;
  }
  safeToStore(raw: Uint8Array): boolean {
    const text = Buffer.from(raw).toString('utf8');
    if (text.includes(this.#key) || SECRET.test(text)) return false;
    try { return !SECRET.test(JSON.stringify(JSON.parse(text))); } catch { return true; }
  }
  async request(url: string, body?: Request, signal?: AbortSignal): Promise<Reply> {
    ensure(url === ENDPOINT || url === KEY_ENDPOINT, 'Destination is not allowed');
    try {
      const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
      const response = await this.#fetch(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: abort,
        headers: { Authorization: 'Bearer ' + this.#key, 'Content-Type': 'application/json', 'User-Agent': 'jevrail/0.1.0-alpha.1' },
        body: body ? canonical(body) : undefined });
      const reader = response.body?.getReader();
      ensure(reader, 'No response body');
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new UncertainError('Response too large'); }
        chunks.push(value);
      }
      return { status: response.status, body: Buffer.concat(chunks) };
    } catch { throw new UncertainError('Network outcome unknown; automatic resend is blocked'); }
  }
  post(body: Request, signal?: AbortSignal): Promise<Reply> { return this.request(ENDPOINT, body, signal); }
  async keyStatus(): Promise<Record<string, unknown>> {
    const response = await this.request(KEY_ENDPOINT);
    ensure(response.status === 200, 'Official key status query failed');
    ensure(this.safeToStore(response.body), 'Credential-like key metadata was suppressed');
    const data = parseJson(Buffer.from(response.body).toString('utf8')).data;
    ensure(data && typeof data === 'object', 'Invalid key status');
    const fields = ['limit', 'limit_remaining', 'limit_reset', 'usage', 'usage_daily', 'usage_weekly',
      'expires_at', 'is_management_key', 'is_provisioning_key'];
    const result = Object.fromEntries(fields.filter(f => Object.hasOwn(data, f)).map(f => [f, data[f]]));
    for (const field of ['limit', 'limit_remaining', 'usage', 'usage_daily', 'usage_weekly']) {
      const value = result[field];
      ensure(value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0), 'Invalid numeric key metadata');
    }
    for (const field of ['is_management_key', 'is_provisioning_key']) ensure(typeof result[field] === 'boolean', 'Invalid key role metadata');
    for (const field of ['limit_reset', 'expires_at']) ensure(result[field] === undefined || result[field] === null || typeof result[field] === 'string', 'Invalid key metadata');
    return result;
  }
}
