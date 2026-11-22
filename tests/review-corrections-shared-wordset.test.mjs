import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryOf } from '../skills/learn/scripts/corrections.mjs';

const script = fileURLToPath(new URL('../skills/learn/scripts/corrections.mjs', import.meta.url));

function projectEnv(config, leaf) {
  const project = path.join(fs.realpathSync(os.tmpdir()), 'learn.review_wordset', leaf);
  fs.mkdirSync(project, { recursive: true });
  const name = fs.realpathSync(project).replace(/[^A-Za-z0-9]/g, '-');
  const folder = path.join(config, 'projects', name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  return { config, project, folder, ledger: path.join(config, 'exo', 'learn', `${name}.jsonl`) };
}

function addPrompts(env, rows) {
  for (const row of rows) {
    const line = JSON.stringify({ type: 'user', timestamp: `${row.date}T10:00:00.000Z`, message: { content: row.text } });
    fs.appendFileSync(path.join(env.folder, `${row.session}.jsonl`), `${line}\n`);
  }
  fs.mkdirSync(path.dirname(env.ledger), { recursive: true });
  fs.appendFileSync(env.ledger, rows.map((row) => `${JSON.stringify(entryOf(row))}\n`).join(''));
}

function fillers(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({ date: '2026-01-01', session: `${prefix}-${index}`, text: `${prefix}${index}a ${prefix}${index}b ${prefix}${index}c` }));
}

function run(env, args) {
  const { CLAUDE_PROJECT_DIR: _project, ...inherited } = process.env;
  const result = spawnSync('node', [script, ...args, '--cwd', env.project], { encoding: 'utf8', env: { ...inherited, CLAUDE_CONFIG_DIR: env.config } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const REJECTED = ['r1', 'r2', 'r3'].map((session, index) => ({ date: `2026-01-0${index + 2}`, session, text: 'alpha bravo charlie xray' }));
const LATER = ['n1', 'n2', 'n3'].map((session, index) => ({ date: `2026-02-0${index + 2}`, session, text: 'alpha bravo charlie yankee zulu whiskey' }));

test('a cluster rejected in this project stays rejected when only another project\'s ledger grows', () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'review-wordset-'));
  const here = projectEnv(config, 'app');
  const other = projectEnv(config, 'other');
  addPrompts(here, [...fillers('zq', 200), ...REJECTED]);
  assert.match(run(here, ['candidates']), new RegExp(`^${entryOf(REJECTED[0]).id} "alpha bravo charlie xray"`));
  run(here, ['reject', entryOf(REJECTED[0]).id]);
  addPrompts(here, LATER);
  const before = run(here, ['candidates']);
  assert.equal(before, '', 'baseline: later prompts sharing the rejected words stay hidden');
  addPrompts(other, Array.from({ length: 40 }, (_, index) => ({ date: '2026-03-01', session: `b-${index}`, text: `alpha qb${index}x` })));
  const after = run(here, ['candidates']);
  assert.equal(after, before, 'growth of another project\'s ledger re-proposed the rejected cluster in this project');
});
