import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitRepository, git, REPOSITORY_ROOT, run } from './harness.mjs';

const HANDOFF = path.join(REPOSITORY_ROOT, 'skills/save/scripts/handoff.mjs');
const LESSONS = fileURLToPath(new URL('../skills/learn/scripts/lessons.mjs', import.meta.url));

test('handoff stale does not report origin/main or fs.existsSync as missing paths', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  git(root, 'checkout', '-q', '-b', 'feature');
  const printed = (await run(HANDOFF, ['path', '--cwd', root])).stdout.trim();
  const short = git(root, 'rev-parse', '--short', 'HEAD').trim();
  fs.mkdirSync(path.dirname(printed), { recursive: true });
  fs.writeFileSync(printed, `Written: 2026-01-01, last commit ${short}, branch feature\nRebase on \`origin/main\`, then call \`fs.existsSync\`.\n`);
  const out = (await run(HANDOFF, ['stale', '--cwd', root])).stdout;
  assert.doesNotMatch(out, /^Missing: /m);
});

test('lessons stale does not flag node:path or v22.5 as missing paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-span-'));
  const dir = path.join(root, '.claude', 'lessons');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'rules'));
  fs.writeFileSync(path.join(root, '.claude', 'rules', 'lessons.md'), '- [a](.claude/lessons/a.md) — when it applies\n');
  fs.writeFileSync(path.join(dir, 'a.md'), [
    '---', 'name: Imports', 'description: use node builtins', 'type: feedback', 'seen: 2026-11-01, 2026-11-10', '---',
    'Import `node:path` and require `v22.5` or later.', 'Why: older runtimes lack it.', 'How to apply: when writing scripts.', ''
  ].join('\n'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['add', '-A', '.'], { cwd: root });
  const out = spawnSync(process.execPath, [LESSONS, 'check', '--dir', dir], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(out, /^stale: .*names a missing path/m);
});
