import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// An intentionally small publication guard, not a complete DLP scanner.
// Uses a source-tree allowlist so ignored private files cannot silently ship.
const root = fileURLToPath(new URL('..', import.meta.url));
const allowed = new Set(['src', 'tests', 'scripts', 'examples', 'docs', 'assets', '.github', 'jevrail',
  'package.json', 'package-lock.json', 'tsconfig.json', 'acceptance-contract.json', 'README.md',
  'README.zh-CN.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CHANGELOG.md',
  '.gitignore', '.gitattributes', '.editorconfig']);
const ignored = new Set(['node_modules', '.git']);
// This exact terminal-only GIF was reviewed together with its text recording.
// New or changed binary assets require another explicit review and digest update.
const reviewedBinary = new Map([
  ['assets/demo.gif', 'b0a332dda16736f1f79a50263a413216cdbc07888cf92f2adb5204fa6c80acbf'],
]);
const findings: string[] = [];
const files: string[] = [];
function walk(dir: string): void {
  for (const name of fs.readdirSync(dir).sort()) {
    if (dir === root && ignored.has(name)) continue;
    if (dir === root && !allowed.has(name)) { findings.push('Unapproved top-level path: ' + name); continue; }
    const file = path.join(dir, name), rel = path.relative(root, file).split(path.sep).join('/');
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) { findings.push('Symlink: ' + rel); continue; }
    if (stat.isDirectory()) { walk(file); continue; }
    if (!stat.isFile() || stat.size > 1024 * 1024) { findings.push('Unexpected file type or size: ' + rel); continue; }
    files.push(rel);
    if (reviewedBinary.has(rel)) {
      const bytes = fs.readFileSync(file);
      if (bytes.subarray(0, 6).toString('ascii') !== 'GIF89a' ||
          createHash('sha256').update(bytes).digest('hex') !== reviewedBinary.get(rel)) {
        findings.push('Binary differs from reviewed asset: ' + rel);
      }
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (/sk-(?:or-v1-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) findings.push('Possible secret: ' + rel);
    if (/\/(?:Users|home)\/(?!example(?:\/|\b))[^\s"'<>]+/.test(text)) findings.push('Private home path: ' + rel);
    if (/gen-dec-\d+-[A-Za-z0-9]+/.test(text)) findings.push('Real provider request identifier: ' + rel);
    if (text.includes('\0')) findings.push('Binary content: ' + rel);
    if (!text.endsWith('\n') || /[\t ]+$/m.test(text)) findings.push('Whitespace / final newline: ' + rel);
    if (rel.endsWith('.md')) {
      for (const m of text.matchAll(/\]\(([^)]+)\)|(?:src|href)="([^"]+)"/g)) {
        const target = (m[1] ?? m[2]).split('#')[0];
        if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), target))) findings.push('Broken local link in ' + rel + ': ' + target);
      }
    }
  }
}
walk(root);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (pkg.dependencies && Object.keys(pkg.dependencies).length) findings.push('Runtime dependencies need review');
if (pkg.name !== lock.name || pkg.version !== lock.version) findings.push('Package and lock metadata differ');
for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) if (pkg.scripts?.[name]) findings.push('Unexpected install lifecycle hook');
if (fs.statSync(path.join(root, 'jevrail')).mode % 8 < 1) findings.push('CLI is not executable');
console.log(JSON.stringify({ status: findings.length ? 'FAIL' : 'PASS', files_checked: files.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
