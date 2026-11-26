import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const step = fileURLToPath(new URL('../skills/learn/scripts/learn-step.mjs', import.meta.url));
const corrections = fileURLToPath(new URL('../skills/learn/scripts/corrections.mjs', import.meta.url));

const FILLERS = 60;
const TEXTS = ['rename variable totalcount everywhere please', 'remove trailing whitespace from every markdown file'];

function fixture() {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-step-'));
  const project = path.join(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'learn.step_x-')), 'app');
  fs.mkdirSync(project, { recursive: true });
  const folder = path.join(config, 'projects', fs.realpathSync(project).replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(folder, { recursive: true });
  TEXTS.forEach((text, cluster) => ['one', 'two', 'three'].forEach((session, index) => {
    const line = JSON.stringify({ type: 'user', timestamp: `2026-01-0${index + 1}T10:00:00.000Z`, message: { content: text } });
    fs.writeFileSync(path.join(folder, `${session}-${cluster}.jsonl`), `${line}\n`);
  }));
  for (let index = 0; index < FILLERS; index += 1) {
    const line = JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00.000Z', message: { content: `zq${index}a zq${index}b zq${index}c` } });
    fs.writeFileSync(path.join(folder, `filler-${index}.jsonl`), `${line}\n`);
  }
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  delete env.CLAUDE_PROJECT_DIR;
  assert.equal(spawnSync('node', [corrections, 'backfill', '--cwd', project], { env }).status, 0);
  const listing = spawnSync('node', [corrections, 'candidates', '--texts', '--cwd', project], { encoding: 'utf8', env }).stdout;
  const file = path.join(config, 'candidates.txt');
  fs.writeFileSync(file, listing);
  const ids = listing.split('\n').map((line) => line.match(/^(\S+) "/)?.[1]).filter(Boolean);
  return { env, project, file, ids };
}

function pick({ env, project, file }, value) {
  return spawnSync('node', [step, '--pick', value, '--candidates', file, '--cwd', project], { encoding: 'utf8', env });
}

test('a numbered pick keeps the picked ids and rejects the other shown ids', () => {
  const setup = fixture();
  assert.equal(setup.ids.length, 2);
  const result = pick(setup, '2');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `kept: ${setup.ids[1]}\nrejected: ${setup.ids[0]}\n`);
});

test('all keeps every id and none rejects every id', () => {
  const all = fixture();
  assert.equal(pick(all, 'all').stdout, `kept: ${all.ids.join(' ')}\nrejected:\n`);
  const none = fixture();
  assert.equal(pick(none, 'none').stdout, `kept:\nrejected: ${none.ids.join(' ')}\n`);
});

test('a number outside the list and a positional word are refused', () => {
  const setup = fixture();
  assert.equal(pick(setup, '3').status, 2);
  const positional = spawnSync('node', [step, 'all', '--candidates', setup.file], { encoding: 'utf8', env: setup.env });
  assert.equal(positional.status, 2);
});
