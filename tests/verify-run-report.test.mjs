// verify.mjs writes each run's proofs, checks and manual checks to `<root>/.exo/run-report.md`
// and ends its output on a `REPORT <path>` line.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));

test('a run writes ## Proofs, ## Checks and ## Manual checks and prints the path last', async () => {
  const root = await gitRepository({
    '.gitignore': '.exo/\n',
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': [
      '### Task 1: feat(app): greet',
      'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
      '',
      '## Manual checks',
      '- open the app and read the greeting',
      ''
    ].join('\n'),
    'check.js': "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n"
  });
  git(root, 'commit', '--allow-empty', '-m', 'feat: land', '-m', 'Plan-task: plan/1');

  const args = ['--plan', 'plan.md', '--check-command', 'node check.js'];
  const result = await run(SCRIPT, args, { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const reportPath = path.join(root, '.exo', 'run-report.md');
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.at(-1), `REPORT ${reportPath}`);

  const report = readFileSync(reportPath, 'utf8');
  assert.match(report, /^## Proofs\n/m);
  assert.match(report, /^## Checks\n[\s\S]*^PASS Task 1$[\s\S]*^DONE Task 1: feat\(app\): greet$/m);
  assert.match(report, /^## Manual checks\n- open the app and read the greeting\n/m);
  assert.doesNotMatch(report.split('## Manual checks')[0], /MANUAL/);

  // A second run overwrites the file instead of appending.
  await run(SCRIPT, args, { cwd: root });
  assert.equal(readFileSync(reportPath, 'utf8').match(/^## Checks$/gm).length, 1);
});
