// Hidden check for value-proof-e2e: runs the real entry point, bin/expenses.mjs,
// on the repo's own data and a second file, never the internal functions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(process.argv[2] ?? '.');
const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(repo, 'bin', 'expenses.mjs');

function run(args, input) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: repo, input, encoding: 'utf8', timeout: 10_000 });
  return { code: result.status, out: result.stdout ?? '', err: result.stderr ?? '' };
}

// Independent reference: integer cents per category, read from the CSV here.
function splitCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; if (row.some(Boolean)) rows.push(row); row = []; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function expected(file, { sort = 'total', category = null } = {}) {
  const [header, ...body] = splitCsv(fs.readFileSync(path.join(repo, file), 'utf8'));
  const groups = new Map();
  for (const values of body) {
    const row = Object.fromEntries(header.map((name, i) => [name, values[i] ?? '']));
    const name = row.category.trim();
    if (category !== null && name.toLowerCase() !== category) continue;
    const cents = Math.round(Number(row.amount.replace(/[$,\s]/g, '')) * 100);
    const group = groups.get(name) ?? { category: name, count: 0, cents: 0 };
    group.count += 1;
    group.cents += cents;
    groups.set(name, group);
  }
  const list = [...groups.values()];
  const byName = (a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0);
  return list.sort(sort === 'name' ? byName : (a, b) => b.cents - a.cents || byName(a, b));
}

function strictJson(out) {
  try { return JSON.parse(out); } catch { return undefined; }
}
// Lenient on purpose: one defect (say a banner line) fails its own case, not all of them.
function lenientJson(out) {
  const strict = strictJson(out);
  if (strict !== undefined) return strict;
  const start = out.startsWith('[') ? 0 : out.indexOf('\n[') + 1;
  return start > 0 || out.startsWith('[') ? strictJson(out.slice(start)) : undefined;
}

const golden = (name) => {
  for (const dir of [path.join(repo, 'golden'), path.join(here, 'hidden', 'golden')]) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  }
  return null;
};

const Q3 = 'data/2024-q3.csv';
const Q4 = 'check-data/q4.csv';
const cases = [];
const add = (name, fn) => cases.push({ name, fn });

function matchesCents(file, args, ref) {
  const r = run([file, '--format', 'json', ...args]);
  const data = lenientJson(r.out);
  if (r.code !== 0 || !Array.isArray(data)) return `exit ${r.code}, stdout is not a JSON array: ${r.out.slice(0, 80).replace(/\n/g, '\\n')}`;
  if (data.length !== ref.length) return `${data.length} entries, expected ${ref.length}`;
  for (let i = 0; i < ref.length; i += 1) {
    const got = data[i];
    if (got?.category !== ref[i].category || got?.count !== ref[i].count) return `entry ${i} is ${JSON.stringify(got)}, expected ${ref[i].category} x${ref[i].count}`;
    if (got.total !== ref[i].cents / 100) return `${ref[i].category} total ${JSON.stringify(got.total)}, expected ${ref[i].cents / 100}`;
  }
  return null;
}

add('json stdout is pure JSON (q3)', () => {
  const r = run([Q3, '--format', 'json']);
  return r.code === 0 && Array.isArray(strictJson(r.out)) ? null : `exit ${r.code}, stdout does not parse as JSON: ${r.out.slice(0, 80).replace(/\n/g, '\\n')}`;
});
add('json entries have exactly category, count, total', () => {
  const data = lenientJson(run([Q3, '--format', 'json']).out);
  if (!Array.isArray(data) || data.length === 0) return 'no JSON array';
  const bad = data.find((e) => Object.keys(e).sort().join() !== 'category,count,total' || typeof e.category !== 'string' || !Number.isInteger(e.count) || typeof e.total !== 'number');
  return bad ? `bad entry ${JSON.stringify(bad)}` : null;
});
add('json totals equal the reference to the cent (q3)', () => matchesCents(Q3, [], expected(Q3)));
add('json totals equal the reference to the cent, no float noise (q4)', () => matchesCents(Q4, [], expected(Q4)));
add('--format=json form works', () => {
  const a = lenientJson(run([Q4, '--format=json']).out);
  const b = lenientJson(run([Q4, '--format', 'json']).out);
  return Array.isArray(a) && JSON.stringify(a) === JSON.stringify(b) ? null : 'the equals form differs from the space form';
});
add('--sort name is honored in json', () => matchesCents(Q4, ['--sort', 'name'], expected(Q4, { sort: 'name' })));
add('--top 2 is honored in json', () => matchesCents(Q4, ['--top', '2'], expected(Q4).slice(0, 2)));
add('--category is honored in json', () => matchesCents(Q3, ['--category', 'travel'], expected(Q3, { category: 'travel' })));
add('empty selection prints [] and exits 0', () => {
  const r = run([Q3, '--format', 'json', '--category', 'nope']);
  const data = strictJson(r.out);
  return r.code === 0 && Array.isArray(data) && data.length === 0 ? null : `exit ${r.code}, stdout ${JSON.stringify(r.out.slice(0, 80))}`;
});
add('stdin input works with json', () => {
  const r = run(['-', '--format', 'json'], fs.readFileSync(path.join(repo, Q4), 'utf8'));
  const data = lenientJson(r.out);
  return Array.isArray(data) && data.length === expected(Q4).length ? null : `exit ${r.code}, stdout ${JSON.stringify(r.out.slice(0, 80))}`;
});
add('unknown format exits 2 with a message on stderr', () => {
  const r = run([Q3, '--format', 'xml']);
  if (r.code !== 2) return `exit ${r.code}, expected 2`;
  if (r.out.trim() !== '') return `stdout not empty: ${JSON.stringify(r.out.slice(0, 60))}`;
  return /json/.test(r.err) && /text/.test(r.err) ? null : `stderr does not name the formats: ${JSON.stringify(r.err.slice(0, 80))}`;
});
add('default text output is unchanged', () => (run([Q3]).out === golden('text-q3.txt') ? null : 'differs from the original report'));
add('--format text equals the default report', () => {
  const r = run([Q3, '--format', 'text']);
  return r.code === 0 && r.out === golden('text-q3.txt') ? null : `exit ${r.code}, output differs from the default report`;
});
add('text report keeps --top and --sort', () => (run([Q4, '--top', '2', '--sort', 'name']).out === golden('text-q4-top2-name.txt') ? null : 'differs from the original report'));
add('text report keeps the empty-selection message', () => (run([Q3, '--category', 'nope']).out === golden('text-empty.txt') ? null : 'differs from the original report'));
add('README documents --format', () => {
  const readme = fs.existsSync(path.join(repo, 'README.md')) ? fs.readFileSync(path.join(repo, 'README.md'), 'utf8') : '';
  return /--format/.test(readme) && /json/i.test(readme) ? null : 'README does not mention --format json';
});
add('the repo test suite passes', () => {
  const r = spawnSync(process.execPath, ['--test'], { cwd: repo, encoding: 'utf8', timeout: 20_000 });
  return r.status === 0 ? null : `node --test exit ${r.status}`;
});

const detail = [];
for (const { name, fn } of cases) {
  let problem;
  try { problem = fn(); } catch (error) { problem = `threw ${error.message}`; }
  if (problem) detail.push(`${name}: ${problem}`);
}
console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: cases.length, detail }));
