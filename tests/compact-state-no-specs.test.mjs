import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handoffFile } from '../skills/save/scripts/handoff.mjs';

const script = fileURLToPath(new URL('../skills/learn/scripts/corrections.mjs', import.meta.url));

test('a compact session-start in a project without docs/specs still names the handoff', () => {
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-nospecs-config-'));
  const project = path.join(fs.realpathSync(os.tmpdir()), 'compact_nospecs_x', 'app');
  fs.mkdirSync(project, { recursive: true });
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_PROJECT_DIR: project };
  const inherited = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = config;
  const handoff = handoffFile(project);
  if (inherited === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = inherited;
  fs.mkdirSync(path.dirname(handoff), { recursive: true });
  fs.writeFileSync(handoff, 'handoff');
  const result = spawnSync('node', [script, 'session-start'], { encoding: 'utf8', env, input: JSON.stringify({ cwd: project, source: 'compact' }) });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr.includes('ENOENT'), false, result.stderr);
  assert.equal(result.stdout.includes(handoff), true, result.stdout);
});
