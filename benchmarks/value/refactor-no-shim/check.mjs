// Hidden check for value-refactor-no-shim. Usage: node check.mjs <repoDir>
// Prints one JSON line {pass, defects, total, detail} and exits 0.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(process.argv[2] ?? '.');
const SKIP = new Set(['.git', 'node_modules', '.claude', '.exo', '__check__']);
const results = [];
const check = (name, fn) => {
  let problem;
  try {
    problem = fn();
  } catch (err) {
    problem = `threw: ${String(err.message ?? err).split('\n')[0]}`;
  }
  results.push({ name, problem: problem || null });
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(repo, f).split(path.sep).join('/');
const files = fs.existsSync(repo) ? walk(repo) : [];
const text = (f) => fs.readFileSync(f, 'utf8');

const group = (f) => {
  const r = rel(f);
  if (/^(src|bin|scripts)\//.test(r)) return 'code';
  if (r.startsWith('test/')) return 'tests';
  if (/^(config|data|\.github)\//.test(r) || r === 'package.json') return 'config';
  return 'docs';
};

function leftovers(groupName, pattern) {
  const hits = [];
  for (const f of files) {
    if (group(f) !== groupName) continue;
    const lines = text(f).split('\n');
    lines.forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${rel(f)}:${i + 1}`);
    });
  }
  return hits.length ? `${hits.length} left: ${hits.slice(0, 4).join(', ')}` : null;
}

function run(args, opts = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repo, encoding: 'utf8', timeout: 10000, ...opts,
  });
}

// 1. The old module is gone.
check('src/models/user.js is deleted', () =>
  fs.existsSync(path.join(repo, 'src/models/user.js')) ? 'src/models/user.js still exists' : null);

// 2-4. Hidden unit tests, one result per test.
const hiddenTest = path.join(repo, '__check__/account.test.mjs');
const tap = fs.existsSync(hiddenTest)
  ? run(['--test', '--test-reporter=tap', hiddenTest]).stdout ?? ''
  : '';
const tapOk = (name) => new RegExp(`^ok \\d+ - ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm').test(tap);
for (const name of [
  'Account keeps the behavior of the old model',
  'the models barrel exports exactly Account and PlanRecord',
  'the registry loads the moved model by its config entry',
]) {
  check(name, () => (tapOk(name) ? null : 'failed or could not load'));
}

// 5-8. No old name anywhere, by kind of file.
const OLD = /UserRecord/;
check('no UserRecord left in code', () => leftovers('code', OLD));
check('no UserRecord left in tests', () => leftovers('tests', OLD));
check('no UserRecord left in docs', () => leftovers('docs', OLD));
check('no UserRecord left in config, data or CI', () => leftovers('config', OLD));

// 9. No doc points at the old path.
check('docs name no models/user path', () =>
  leftovers('docs', /models\/user(?![\w-])/));

// 10. CODEOWNERS entries still resolve.
check('CODEOWNERS paths exist', () => {
  const f = path.join(repo, '.github/CODEOWNERS');
  if (!fs.existsSync(f)) return '.github/CODEOWNERS is missing';
  const dangling = [];
  for (const line of text(f).split('\n')) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const p = entry.split(/\s+/)[0];
    if (!fs.existsSync(path.join(repo, p.replace(/^\//, '')))) dangling.push(p);
  }
  return dangling.length ? `dangling: ${dangling.join(', ')}` : null;
});

// 11-14. Real entry points keep their output.
const EXPORT_CSV = [
  'kind,id,email,name,plan',
  'user,1,ann@example.com,Ann Lee,team',
  'user,2,bo@example.com,Bo Park,free',
  'user,3,cy@example.com,"Cy Roe, Jr.",pro',
  '',
].join('\n');
check('members export prints the same CSV', () => {
  const r = run(['bin/members.mjs', 'export']);
  if (r.status !== 0) return `exit ${r.status}: ${(r.stderr || '').trim().split('\n')[0]}`;
  return r.stdout === EXPORT_CSV ? null : `stdout differs: ${JSON.stringify(r.stdout.slice(0, 80))}`;
});

check('members signup prints the same record', () => {
  const r = run(['bin/members.mjs', 'signup', '--email', ' Bob@Example.com ', '--name', 'Bob']);
  if (r.status !== 0) return `exit ${r.status}: ${(r.stderr || '').trim().split('\n')[0]}`;
  const want = { kind: 'user', id: 4, email: 'bob@example.com', name: 'Bob', plan: 'free' };
  return JSON.stringify(JSON.parse(r.stdout)) === JSON.stringify(want) ? null : `stdout differs: ${r.stdout.trim()}`;
});

check('members signup keeps its error messages', () => {
  const cases = [
    [['--email', 'nope', '--name', 'X'], 'invalid user email: nope'],
    [['--email', 'ann@example.com', '--name', 'Dup'], 'email already registered: ann@example.com'],
    [['--email', 'x@y.co', '--name', 'X', '--plan', 'gold'], 'unknown plan: gold'],
  ];
  for (const [args, message] of cases) {
    const r = run(['bin/members.mjs', 'signup', ...args]);
    if (r.status !== 1 || r.stderr.trim() !== message) {
      return `want exit 1 "${message}", got exit ${r.status} "${(r.stderr || '').trim().split('\n')[0]}"`;
    }
  }
  return null;
});

check('seed-demo prints the same lines', () => {
  const r = run(['scripts/seed-demo.mjs']);
  if (r.status !== 0) return `exit ${r.status}: ${(r.stderr || '').trim().split('\n')[0]}`;
  const want = 'Dana Fox <dana@example.com>\nEli Wu <eli@example.com>\n';
  return r.stdout === want ? null : `stdout differs: ${JSON.stringify(r.stdout.slice(0, 80))}`;
});

// 15. The repo's own suite still passes.
check('npm test passes', () => {
  const r = spawnSync('sh', ['-c', 'node --test test/*.test.js'], {
    cwd: repo, encoding: 'utf8', timeout: 20000,
  });
  return r.status === 0 ? null : `exit ${r.status}`;
});

const failed = results.filter((r) => r.problem);
console.log(JSON.stringify({
  pass: failed.length === 0,
  defects: failed.length,
  total: results.length,
  detail: failed.map((r) => `${r.name}: ${r.problem}`),
}));
