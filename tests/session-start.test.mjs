import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const HOOK = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'hooks', 'session-start.mjs');
const RULES = fs.readFileSync(path.join(path.dirname(HOOK), 'session-rules.md'), 'utf8').trimEnd();

function runHook({ source, runDirectory }) {
  const home = tempDir('exo-session-start-');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const name of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR']) delete env[name];
  if (runDirectory) env.EXO_RUN_DIR = runDirectory;
  const input = JSON.stringify({ session_id: 's1', source, cwd: home });
  return spawnSync(process.execPath, [HOOK], { env, input, encoding: 'utf8' });
}

test('a detached run session exits with no context', () => {
  const run = runHook({ source: 'startup', runDirectory: tempDir('exo-run-dir-') });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
});

test('a human session prints context and a resume skips the rules', () => {
  const startup = runHook({ source: 'startup' });
  assert.ok(JSON.parse(startup.stdout).hookSpecificOutput.additionalContext.includes(RULES));
  const resume = runHook({ source: 'resume' });
  assert.ok(!JSON.parse(resume.stdout).hookSpecificOutput.additionalContext.includes(RULES));
});
