import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryOf } from '../skills/learn/scripts/corrections.mjs';

const script = fileURLToPath(new URL('../evals/skill-corrections.mjs', import.meta.url));
const CORRECTION = 'stop adding semicolons everywhere please';

const user = (text) => ({ type: 'user', timestamp: '2026-03-01T10:00:00.000Z', message: { content: text } });
const skillCall = (skill) => ({ type: 'assistant', timestamp: '2026-03-01T10:00:00.000Z', message: { content: [{ type: 'tool_use', id: `t-${skill}`, name: 'Skill', input: { skill } }] } });

test('prints how many sessions of each skill were followed by a correction', () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-corrections-'));
  const project = path.join(fs.realpathSync(os.tmpdir()), 'skill.corrections_x', 'app');
  fs.mkdirSync(project, { recursive: true });
  const name = fs.realpathSync(project).replace(/[^A-Za-z0-9]/g, '-');
  const folder = path.join(config, 'projects', name);
  fs.mkdirSync(folder, { recursive: true });
  const write = (file, entries) => fs.writeFileSync(file, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
  write(path.join(folder, 'one.jsonl'), [user('please build it'), skillCall('exo:build'), user(CORRECTION)]);
  write(path.join(folder, 'two.jsonl'), [user('please build it'), skillCall('exo:build'), user('thanks, looks good')]);
  const sessions = ['one', 'two', 'three', 'four'];
  const filler = Array.from({ length: 60 }, (_, index) => entryOf({ date: '2026-01-01', session: `filler-${index}`, text: `zq${index}a zq${index}b zq${index}c` }));
  const repeated = sessions.slice(2).concat('one').map((session) => entryOf({ date: '2026-03-01', session, text: CORRECTION }));
  const ledger = path.join(config, 'exo', 'learn', `${name}.jsonl`);
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  write(ledger, [...filler, ...repeated]);
  const { CLAUDE_PROJECT_DIR: _project, ...inherited } = process.env;
  const result = spawnSync('node', [script], { encoding: 'utf8', cwd: project, env: { ...inherited, CLAUDE_CONFIG_DIR: config } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'exo:build: corrected in 1 of 2 sessions\n');
});
