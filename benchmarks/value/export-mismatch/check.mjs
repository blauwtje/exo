// Hidden check for value-export-mismatch. Runs the real entry points,
// `bin/export.mjs` and `bin/dashboard.mjs`, over the month data and over tiny
// hand-worked datasets, then the repository's own `npm test`. Reads the repo
// directly, never diff.patch. Usage: node check.mjs <repoDir>
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.argv[2] ?? '.');
const checkData = path.join(repo, 'check-data');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(checkData, file), 'utf8'));
const { FAULTS } = await import(pathToFileURL(path.join(checkData, 'faults.mjs')).href);
const expected = readJson('expected.json');
const hashes = readJson('data-hashes.json');
const SEED_TESTS = 36;
const MONTHS = Object.keys(expected);
const NAMED = { month: '2026-03', id: 'C004', name: 'Kestrel Analytics' };

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST')));
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'export-mismatch-'));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repo, env, encoding: 'utf8', timeout: 25_000, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${command} ${args.join(' ')}: ${result.error.message}`);
  return result;
}

function node(args) {
  const result = run(process.execPath, args);
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} exited ${result.status}: ${(result.stderr || '').trim().slice(-300)}`);
  return result.stdout;
}

// Quoted CSV: a field may hold commas and doubled quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; } else if (char === '"') quoted = false; else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const toMinor = (text) => {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) throw new Error(`not an amount: ${text}`);
  const minor = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -minor : minor;
};

// An export file as { customerId: [totalMinor, transactions] }.
function readExport(file) {
  const [header, ...body] = parseCsv(fs.readFileSync(file, 'utf8'));
  const column = (name) => header.indexOf(name);
  const [id, count, total] = ['customer_id', 'transactions', 'total_eur'].map(column);
  if ([id, count, total].includes(-1)) throw new Error(`unexpected export header: ${header.join(',')}`);
  return Object.fromEntries(body.map((cells) => [cells[id], [toMinor(cells[total]), Number(cells[count])]]));
}

function exportFor(month, dataDir, label) {
  const out = path.join(tmpRoot, `out-${label}`);
  node(['bin/export.mjs', month, '--data', dataDir, '--out', out]);
  return readExport(path.join(out, `${month}.csv`));
}

function compare(actual, want, names = {}) {
  const problems = [];
  for (const id of Object.keys(want)) {
    if (!(id in actual)) problems.push(`${names[id] ?? id} missing from the export, want ${want[id][0]} over ${want[id][1]}`);
    else if (actual[id][0] !== want[id][0] || actual[id][1] !== want[id][1]) problems.push(`${names[id] ?? id}: ${actual[id][0]} over ${actual[id][1]}, want ${want[id][0]} over ${want[id][1]}`);
  }
  for (const id of Object.keys(actual)) if (!(id in want)) problems.push(`${names[id] ?? id} should not be in the export`);
  return problems;
}

const summarize = (problems) => (problems.length ? `${problems.length} wrong: ${problems.slice(0, 4).join('; ')}` : null);
const want = (month) => Object.fromEntries(Object.entries(expected[month]).map(([id, entry]) => [id, [entry.totalMinor, entry.transactions]]));

const dataDir = path.join(repo, 'data');
const exportsByMonth = {};

// Each case returns an error text or null.
const cases = [
  ['the month data is untouched', () => {
    const found = Object.fromEntries(fs.readdirSync(dataDir, { recursive: true }).filter((file) => fs.statSync(path.join(dataDir, file)).isFile())
      .map((file) => [file.split(path.sep).join('/'), crypto.createHash('sha256').update(fs.readFileSync(path.join(dataDir, file))).digest('hex')]));
    const changed = [...new Set([...Object.keys(found), ...Object.keys(hashes)])].filter((file) => found[file] !== hashes[file]);
    return changed.length ? `data changed: ${changed.join(', ')}` : null;
  }],
  ['the dashboard is untouched', () => {
    const problems = [];
    for (const month of MONTHS) {
      const entries = JSON.parse(node(['bin/dashboard.mjs', month, '--json']));
      problems.push(...compare(Object.fromEntries(entries.map((entry) => [entry.id, [entry.totalMinor, entry.transactions]])), want(month)).map((text) => `${month} ${text}`));
    }
    return summarize(problems);
  }],
  [`${NAMED.name} matches the dashboard in ${NAMED.month}`, () => {
    exportsByMonth[NAMED.month] ??= exportFor(NAMED.month, dataDir, NAMED.month);
    const got = exportsByMonth[NAMED.month][NAMED.id];
    const wantEntry = want(NAMED.month)[NAMED.id];
    return got && got[0] === wantEntry[0] && got[1] === wantEntry[1] ? null : `${NAMED.name}: ${got ? `${got[0]} over ${got[1]}` : 'missing'}, want ${wantEntry[0]} over ${wantEntry[1]}`;
  }],
  ...MONTHS.map((month) => [`every customer matches the dashboard in ${month}`, () => {
    exportsByMonth[month] ??= exportFor(month, dataDir, month);
    return summarize(compare(exportsByMonth[month], want(month)));
  }]),
  ...FAULTS.map((fault, index) => [`small case: ${fault.name}`, () => {
    const dir = path.join(tmpRoot, `data-${index}`);
    for (const [name, text] of Object.entries(fault.files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return summarize(compare(exportFor(fault.month, dir, `fault-${index}`), Object.fromEntries(Object.entries(fault.expect))));
  }]),
  ['npm test passes and keeps its tests', () => {
    const result = run('npm', ['test', '--silent']);
    const count = Number(/^(?:# |ℹ )tests (\d+)/m.exec(result.stdout)?.[1] ?? 0);
    if (result.status !== 0) return `npm test exited ${result.status}`;
    return count >= SEED_TESTS ? null : `npm test ran ${count} tests, the seed has ${SEED_TESTS}`;
  }]
];

const detail = [];
for (const [name, body] of cases) {
  let problem;
  try { problem = body(); } catch (error) { problem = String(error.message ?? error).slice(0, 300); }
  if (problem) detail.push(`${name}: ${problem}`);
}
fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: cases.length, detail }));
