import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanForegroundDispatches } from '../verify/checks/foreground-dispatch.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function scan(files) {
  const root = tempDir('foreground-dispatch-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return scanForegroundDispatches(createRepository(root));
}

test('the shipped lead-run text tells no Agent call to run in the foreground', () => {
  assert.deepEqual(scanForegroundDispatches(createRepository(ROOT)), { flagged: [] });
});

test('a skill line that sends agents in the foreground is flagged with its line', () => {
  const result = scan({ 'skills/spec/SKILL.md': 'Steps\n- Send both in the foreground, in one message.\n' });
  assert.deepEqual(result.flagged, ['skills/spec/SKILL.md:2']);
});

test('run_in_background false is flagged in a hook string and a script string', () => {
  const result = scan({
    'hooks/rules.md': '- Dispatch each agent with `run_in_background: false`.\n',
    'skills/spec/scripts/next.mjs': "const line = 'Dispatch agents with run_in_background=false';\n",
  });
  assert.deepEqual(result.flagged, ['skills/spec/scripts/next.mjs:1', 'hooks/rules.md:1']);
});

test('a Bash foreground line is not an Agent call', () => {
  const result = scan({ 'agents/worker.md': '- Run the proof in the foreground with Bash `timeout: 600000`.\n' });
  assert.deepEqual(result.flagged, []);
});

test('a foreground dispatch line under a forked skill passes and the same line under a plain skill is flagged', () => {
  const line = '- Send the tasks to the runner with `run_in_background: false`.\n';
  const result = scan({
    'skills/forked/SKILL.md': '---\nname: forked\ncontext: fork\n---\nBody\n',
    'skills/forked/references/loop.md': line,
    'skills/plain/SKILL.md': '---\nname: plain\n---\nBody\n',
    'skills/plain/references/loop.md': line,
  });
  assert.deepEqual(result.flagged, ['skills/plain/references/loop.md:1']);
});

test('the build skill folder is skipped by name without a fork and another unforked skill is flagged', () => {
  const line = '- Send the tasks to the runner with `run_in_background: false`.\n';
  const result = scan({
    'skills/build/SKILL.md': '---\nname: build\n---\nBody\n',
    'skills/build/references/run-loop.md': line,
    'skills/other/SKILL.md': '---\nname: other\n---\nBody\n',
    'skills/other/references/loop.md': line,
  });
  assert.deepEqual(result.flagged, ['skills/other/references/loop.md:1']);
});
