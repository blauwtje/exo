import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { harvest, harvestedCase, scrub } from '../benchmarks/harvest-cases.mjs';

const scrubOptions = { home: '/Users/jane', user: 'jane' };

function cell(folder, { grade, output }) {
  fs.mkdirSync(folder, { recursive: true });
  const caseDef = { id: 'c1', task: 'Fix /Users/jane/app for jane@corp.io', grade: { type: 'rubric', rubric: 'see /Users/jane/x' } };
  fs.writeFileSync(path.join(folder, 'case.json'), JSON.stringify(caseDef));
  fs.writeFileSync(path.join(folder, 'result.json'), JSON.stringify({ result: output }));
  fs.writeFileSync(path.join(folder, 'grade.json'), JSON.stringify({ grade, evidence: 'jane said so' }));
}

test('scrub removes paths, emails, tokens, addresses and the user name', () => {
  const text = scrub('jane at /Users/jane/code mailed jane@corp.io key sk-abcdefghij12345 from 10.1.2.3', scrubOptions);
  assert.equal(text, 'user at ~/code mailed user@example.com key [token] from 0.0.0.0');
});

test('harvest writes a scrubbed case folder per failed cell only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-'));
  const out = path.join(root, 'cases');
  cell(path.join(root, 'run', 'bad'), { grade: 'fail', output: 'wrong in /Users/jane/app' });
  cell(path.join(root, 'run', 'good'), { grade: 'pass', output: 'right' });
  const written = harvest({ target: path.join(root, 'run'), out, dryRun: false, scrubOptions });
  assert.deepEqual(written, [path.join(out, 'harvest-bad')]);
  const folder = written[0];
  const definition = JSON.parse(fs.readFileSync(path.join(folder, 'case.json'), 'utf8'));
  assert.equal(definition.ready, true);
  const files = ['case.json', 'prompt.md', 'input/failed-answer.md'];
  const everything = files.map((file) => fs.readFileSync(path.join(folder, file), 'utf8')).join('\n');
  assert.doesNotMatch(everything, /jane|corp\.io/);
  assert.match(everything, /~\/app/);
});

test('dry run writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-'));
  cell(path.join(root, 'run', 'bad'), { grade: 'fail', output: 'wrong' });
  const written = harvest({ target: path.join(root, 'run'), out: path.join(root, 'cases'), dryRun: true, scrubOptions });
  assert.equal(written.length, 1);
  assert.equal(fs.existsSync(path.join(root, 'cases')), false);
});

test('a single-cell target gets a non-empty distinct id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-'));
  cell(path.join(root, 'a', 'exo', '1'), { grade: 'fail', output: 'wrong' });
  cell(path.join(root, 'b', 'exo', '1'), { grade: 'fail', output: 'wrong' });
  const first = harvest({ target: path.join(root, 'a', 'exo', '1'), out: path.join(root, 'cases'), dryRun: true, scrubOptions });
  const second = harvest({ target: path.join(root, 'b', 'exo', '1'), out: path.join(root, 'cases'), dryRun: true, scrubOptions });
  assert.match(path.basename(first[0]), /^harvest-.+/);
  assert.notEqual(first[0], second[0]);
});

test('grade fields and provenance ref are scrubbed', () => {
  const definition = harvestedCase({
    relative: 'a/exo/1',
    caseDef: { id: '/Users/jane/app', task: 't', grade: { type: 'contains', expected: '/Users/jane/app', patterns: ['jane@corp.io', 'x'] } },
    grade: {},
    scrubOptions
  });
  assert.doesNotMatch(JSON.stringify(definition), /jane|corp\.io/);
});

test('the case id goes through the scrub', () => {
  const definition = harvestedCase({
    relative: 'jdoe/c',
    caseDef: { task: '', grade: {}, id: '' },
    grade: {},
    scrubOptions: { home: '/h/jdoe', user: 'jdoe' }
  });
  assert.ok(!definition.id.includes('jdoe'));
});

test('a home shorter than two characters leaves the text intact', () => {
  assert.equal(scrub('/tmp/a b', { home: '', user: 'jane' }), '/tmp/a b');
  assert.equal(scrub('/tmp/a b', { home: '/', user: 'jane' }), '/tmp/a b');
});

test('the command line reads its flag values', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-cli-'));
  cell(path.join(root, 'run', 'bad'), { grade: 'fail', output: 'wrong' });
  const script = path.join(import.meta.dirname, '..', 'benchmarks', 'harvest-cases.mjs');
  const out = path.join(root, 'cases');
  const run = spawnSync(process.execPath, [script, path.join(root, 'run'), '--out', out], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.existsSync(path.join(out, 'harvest-bad', 'case.json')));
  const dry = spawnSync(process.execPath, [script, '--dry-run', '--out', path.join(root, 'none'), path.join(root, 'run')], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(!fs.existsSync(path.join(root, 'none')));
});
