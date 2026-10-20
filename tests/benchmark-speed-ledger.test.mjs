import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkLedger, fingerprint, KEYS, readLedger, renderLedger } from '../benchmarks/speed-ledger.mjs';

const row = (id, title, extra = {}) => {
  const base = Object.fromEntries(KEYS.map((key) => [key, null]));
  const made = { ...base, id, title, area: 'test', targets: [], verdict: 'un', related: [], ...extra };
  return { ...made, fingerprint: fingerprint(made) };
};

function makeRoot(rows, render = renderLedger) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speed-ledger-'));
  fs.mkdirSync(path.join(root, 'benchmarks'));
  fs.writeFileSync(path.join(root, 'benchmarks', 'speed-ledger.jsonl'), rows.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'benchmarks', 'speed-ledger.md'), render(rows));
  return root;
}

test('the fingerprint ignores case, spacing and target order', () => {
  const a = fingerprint({ title: 'Cache  Warm-up', targets: ['b.mjs', 'a.mjs'] });
  assert.equal(a, fingerprint({ title: ' cache warm-up ', targets: ['a.mjs', 'b.mjs'] }));
  assert.notEqual(a, fingerprint({ title: 'cache warm-up', targets: ['a.mjs'] }));
});

test('the committed ledger reads, renders to its md and passes the check', () => {
  const rows = readLedger();
  assert.ok(rows.length >= 65, `the ledger keeps the 65 migrated rows, found ${rows.length}`);
  assert.ok(rows.every((entry) => KEYS.every((key) => key in entry)));
  assert.deepEqual(checkLedger(), []);
});

test('the committed ledger holds all 16 self-improve ideas, each pointing at a results file on disk', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const rows = readLedger();
  const wanted = ['1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '6.1', '6.2'];
  for (const idea of wanted) {
    const prefix = `l${idea.replace('.', '-')}-`;
    const found = rows.filter((entry) => entry.id.startsWith(prefix));
    assert.equal(found.length, 1, `one ledger row for L${idea}`);
    assert.ok(found[0].results, `L${idea} names a results file`);
    assert.ok(fs.existsSync(path.join(root, found[0].results)), `L${idea} results file exists: ${found[0].results}`);
  }
});

test('the rendered md starts generated and keeps the index first', () => {
  const md = renderLedger([row('a', 'A'), row('b', 'B', { related: ['a'] })]);
  assert.match(md.split('\n')[0], /speed-ledger\.jsonl/);
  assert.ok(md.indexOf('## Index') < md.indexOf('## Not landed'));
  assert.match(md, /Related: \[A\]\(#a\)/);
});

test('a clean ledger checks with no problems', () => {
  assert.deepEqual(checkLedger(makeRoot([row('a', 'A'), row('b', 'B')])), []);
});

test('a hand-edited md is a problem', () => {
  const root = makeRoot([row('a', 'A')]);
  fs.appendFileSync(path.join(root, 'benchmarks', 'speed-ledger.md'), 'extra\n');
  assert.match(checkLedger(root).join('\n'), /differs from the render/);
});

test('a repeated id and a repeated fingerprint are listed', () => {
  const problems = checkLedger(makeRoot([row('a', 'A'), row('a', 'A')])).join('\n');
  assert.match(problems, /duplicate id a/);
  assert.match(problems, /duplicate fingerprint/);
});

test('a bad verdict, a missing related id and a missing results path are listed', () => {
  const rows = [row('a', 'A', { verdict: 'maybe', related: ['zzz'], results: 'benchmarks/results/none.md' })];
  const problems = checkLedger(makeRoot(rows)).join('\n');
  assert.match(problems, /invalid verdict maybe/);
  assert.match(problems, /related id zzz/);
  assert.match(problems, /none\.md does not exist/);
});

test('a missing key, a stale fingerprint, and a bad line are listed', () => {
  const root = makeRoot([row('b', 'B'), row('a', 'A')]);
  const file = path.join(root, 'benchmarks', 'speed-ledger.jsonl');
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const { retryWhen, ...short } = JSON.parse(lines[0]);
  fs.writeFileSync(file, [JSON.stringify(short), JSON.stringify({ ...JSON.parse(lines[1]), title: 'Other' }), '{oops'].join('\n') + '\n');
  const problems = checkLedger(root).join('\n');
  assert.match(problems, /missing keys retryWhen/);
  assert.match(problems, /fingerprint does not match/);
  assert.match(problems, /line 3: not JSON/);
});

test('ids out of order are a problem', () => {
  assert.match(checkLedger(makeRoot([row('b', 'B'), row('a', 'A')])).join('\n'), /not sorted by id/);
});

test('a null targets or related, and a missing md, are listed instead of thrown', () => {
  const nulls = makeRoot([row('a', 'A')]);
  const file = path.join(nulls, 'benchmarks', 'speed-ledger.jsonl');
  const made = { ...JSON.parse(fs.readFileSync(file, 'utf8')), targets: null, related: null };
  fs.writeFileSync(file, `${JSON.stringify(made)}\n`);
  const problems = checkLedger(nulls).join('\n');
  assert.match(problems, /\(a\): targets is not an array/);
  assert.match(problems, /\(a\): related is not an array/);
  const bare = makeRoot([row('a', 'A')]);
  fs.rmSync(path.join(bare, 'benchmarks', 'speed-ledger.md'));
  assert.match(checkLedger(bare).join('\n'), /speed-ledger\.md is missing/);
});

test('a wrong-typed field or a non-object line is listed instead of thrown', () => {
  const root = makeRoot([row('a', 'A')]);
  const file = path.join(root, 'benchmarks', 'speed-ledger.jsonl');
  const made = JSON.parse(fs.readFileSync(file, 'utf8'));
  const lines = [{ ...made, title: null }, { ...made, id: 7 }, { ...made, results: 5 }].map((entry) => JSON.stringify(entry));
  fs.writeFileSync(file, `${lines.join('\n')}\nnull\n[]\n`);
  const problems = checkLedger(root).join('\n');
  assert.match(problems, /line 1 \(a\): title is not a string/);
  assert.match(problems, /line 2 \(7\): id is not a string/);
  assert.match(problems, /line 3 \(a\): results is not a string or null/);
  assert.match(problems, /line 4: not a JSON object/);
  assert.match(problems, /line 5: not a JSON object/);
});
