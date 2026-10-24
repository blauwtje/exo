import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gate } from '../skills/improve/scripts/gate.mjs';

const script = fileURLToPath(new URL('../skills/improve/scripts/gate.mjs', import.meta.url));
const key = (area, lever = 'l', target = 't') => ({ area, lever, target });
const good = { key: key('a'), parts: [key('a')], files: ['src/x.js'], evidence: 'src/x.js:12 loops twice', expected: 0.1 };

function setup({ ideas = [], log, cfg = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const dir = path.join(root, '.exo', 'improve');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 't.json'), JSON.stringify({ scope: ['src'], readOnly: ['src/score.js'], sd: 0.01, direction: 'lower', ...cfg }));
  if (ideas.length) fs.writeFileSync(path.join(dir, 't.ideas.jsonl'), `${ideas.map((i) => JSON.stringify(i)).join('\n')}\n`);
  if (log) fs.writeFileSync(path.join(dir, 'run.log'), log);
  return root;
}
const run = (root, idea) => gate({ root, tag: 't', idea });
const line = (area, extra = {}) => ({ round: 1, key: `${area}/l/t`, parts: [`${area}/l/t`], delta: 0, flat: false, crash: false, ...extra });

test('passes a fresh in-scope idea with evidence', () => assert.equal(run(setup(), good).ok, true));

test('rejects duplicate key, including a duplicate part', () => {
  const root = setup({ ideas: [line('a')] });
  assert.match(run(root, good).reason, /duplicate/);
  const other = { ...good, key: key('a', 'x'), parts: [key('a', 'x'), key('a')] };
  assert.match(run(root, other).reason, /duplicate/);
});

test('a crashed key is not banned', () => assert.equal(run(setup({ ideas: [line('a', { crash: true })] }), good).ok, true));

test('rejects out-of-scope and read-only files', () => {
  const root = setup();
  assert.match(run(root, { ...good, files: ['lib/y.js'] }).reason, /out of scope/);
  assert.match(run(root, { ...good, files: ['src/score.js'] }).reason, /out of scope/);
});

test('rejects missing evidence and bad bundles', () => {
  const root = setup();
  assert.match(run(root, { ...good, evidence: 'seems slow' }).reason, /evidence/);
  assert.equal(run(root, { ...good, evidence: 'see row 3' }).ok, true);
  assert.match(run(root, { ...good, parts: [key('a'), key('a', '2'), key('a', '3'), key('a', '4')] }).reason, /1 to 3/);
  assert.match(run(root, { ...good, parts: [key('b')] }).reason, /share/);
});

test('three flat rounds redirect to an untouched area', () => {
  const flat = ['b', 'c', 'd'].map((area) => line(area, { flat: true }));
  const root = setup({ ideas: flat });
  assert.match(run(root, { ...good, key: key('b', 'new'), parts: [key('b', 'new')] }).reason, /untouched/);
  assert.equal(run(root, good).ok, true);
});

test('rejects an idea whose targeted cases have less headroom than 2*sd, whatever it expects', () => {
  const log = 'c1 ratio=0.10\nc2 ratio=0.95\n';
  const root = setup({ log, cfg: { sd: 0.2 } });
  const idea = (target, expected) => ({ ...good, key: key('a', 'l', target), parts: [key('a', 'l', target)], expected });
  assert.match(run(root, idea('c1', 0.01)).reason, /headroom/);
  assert.equal(run(root, idea('c2', 0.01)).ok, true);
  assert.equal(run(root, idea('src/x.js', 0.01)).ok, true);
  assert.match(run(setup({ log: 'c1 ratio=0.10\nc2 ratio=0.10\n', cfg: { sd: 0.2 } }), idea('src/x.js', 5)).reason, /headroom/);
  assert.equal(run(setup({ log: 'nothing here\n', cfg: { sd: 0.2 } }), idea('c1', 5)).ok, true);
});

test('a glob scope entry matches files, a bare directory keeps matching its tree', () => {
  const root = setup({ cfg: { scope: ['src/*.ts', 'docs'], readOnly: [] } });
  assert.equal(run(root, { ...good, files: ['src/parse.ts'] }).ok, true);
  assert.equal(run(root, { ...good, files: ['docs/a/b.md'] }).ok, true);
  assert.match(run(root, { ...good, files: ['src/deep/parse.ts'] }).reason, /out of scope/);
  assert.match(run(root, { ...good, files: ['src/parse.js'] }).reason, /out of scope/);
});

test('a trailing-star scope entry does not cover files below its directory', () => {
  const root = setup({ cfg: { scope: ['src/*'], readOnly: [] } });
  assert.equal(run(root, { ...good, files: ['src/b.ts'] }).ok, true);
  assert.match(run(root, { ...good, files: ['src/deep/a.ts'] }).reason, /out of scope/);
});

test('cli prints PASS or REJECT with the exit code', () => {
  const root = setup();
  const file = path.join(root, 'idea.json');
  fs.writeFileSync(file, JSON.stringify(good));
  const pass = spawnSync('node', [script, '--root', root, '--tag', 't', '--idea', file], { encoding: 'utf8' });
  assert.deepEqual([pass.status, pass.stdout.trim()], [0, 'PASS']);
  fs.writeFileSync(file, JSON.stringify({ ...good, evidence: 'no' }));
  const reject = spawnSync('node', [script, '--root', root, '--tag', 't', '--idea', file], { encoding: 'utf8' });
  assert.equal(reject.status, 1);
  assert.match(reject.stdout, /^REJECT /);
});

test('a bracket class in a scope entry matches as git pathspec does', () => {
  const root = setup({ cfg: { scope: ['src/x[0-9].ts'], readOnly: [] } });
  assert.equal(run(root, { ...good, files: ['src/x1.ts'] }).ok, true);
  assert.match(run(root, { ...good, files: ['src/xa.ts'] }).reason, /out of scope/);
});

test('a scope entry git refuses is a REJECT line, not a stack trace', () => {
  const root = setup({ cfg: { scope: ['../outside'], readOnly: [] } });
  assert.match(run(root, good).reason, /^scope check failed: /);
  const file = path.join(root, 'idea.json');
  fs.writeFileSync(file, JSON.stringify(good));
  const result = spawnSync('node', [script, '--root', root, '--tag', 't', '--idea', file], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^REJECT scope check failed: /);
  assert.equal(result.stderr, '');
});
