// verify.mjs sends code-rule violations of the landed tasks to the fixer through `.exo/code-rules.md`.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { mergeReviews } from '../skills/verify/scripts/merge-reviews.mjs';
import { commitFiles, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/verify/scripts/verify.mjs', import.meta.url));
const PLAN = [
  '### Task 1: feat(app): greet',
  'Depends on: none | Files: `src/app.js` | Data: none | Proof: node -e "process.exit(0)"',
  ''
].join('\n');
const CHECK = "console.log('SUMMARY FAIL=0 WARN=0 UNRUN=0');\n";

async function landed(source) {
  const root = await gitRepository({
    '.gitignore': '.exo/\n',
    'src/app.js': 'export const greet = () => "hi";\n',
    'plan.md': PLAN,
    'check.js': CHECK
  });
  const base = git(root, 'rev-parse', 'HEAD');
  await commitFiles(root, { 'src/app.js': source }, 'feat(app): greet\n\nPlan-task: plan/1');
  return { root, base };
}

const COMMENTED = '// say hello\nexport const greet = () => "hi";\n';
const ARGS = ['--plan', 'plan.md', '--check-command', 'node check.js'];

test('an added comment is written to .exo/code-rules.md as a fix finding with a probe', async () => {
  const { root, base } = await landed(COMMENTED);
  const result = await run(SCRIPT, [...ARGS, '--base', base], { cwd: root });
  const report = path.join(root, '.exo', 'code-rules.md');
  assert.match(result.stdout, new RegExp(`^CODE-RULES ${report}$`, 'm'));
  assert.doesNotMatch(result.stdout, /^FAIL code-rules/m);
  const lines = readFileSync(report, 'utf8').split('\n');
  assert.equal(lines[0], 'FINDINGS');
  const at = lines.findIndex((line) => /^src\/app\.js:1 comment .* defect fix$/.test(line));
  assert.ok(at > 0, lines.join('\n'));
  assert.match(lines[at + 1], /^ {2}Probe: ! grep -nF -- '\/\/ say hello' src\/app\.js$/);
  const merged = mergeReviews([{ name: 'code-rules', text: readFileSync(report, 'utf8') }]);
  assert.equal(merged.counts.defect, 1);
  assert.equal(merged.counts.fix, 1);
});

test('a run without --base skips the code-rule check', async () => {
  const { root } = await landed(COMMENTED);
  const result = await run(SCRIPT, ARGS, { cwd: root });
  assert.doesNotMatch(result.stdout, /^CODE-RULES/m);
  assert.equal(existsSync(path.join(root, '.exo', 'code-rules.md')), false);
});

test('clean added code prints no CODE-RULES line and drops a stale report', async () => {
  const { root, base } = await landed('export const greet = () => "hello";\n');
  const result = await run(SCRIPT, [...ARGS, '--base', base], { cwd: root });
  assert.doesNotMatch(result.stdout, /^CODE-RULES/m);
  assert.equal(existsSync(path.join(root, '.exo', 'code-rules.md')), false);
});

test('a function over 20 lines prints a WARN code-rules line and no report', async () => {
  const body = Array.from({ length: 22 }, (_, index) => `  total += ${index};`);
  const source = ['export function sum() {', '  let total = 0;', ...body, '  return total;', '}', ''].join('\n');
  const { root, base } = await landed(source);
  const result = await run(SCRIPT, [...ARGS, '--base', base], { cwd: root });
  assert.match(result.stdout, /^WARN code-rules Task 1 \(src\/app\.js:1 max-lines-per-function /m);
  assert.doesNotMatch(result.stdout, /^(?:CODE-RULES|FAIL code-rules)/m);
});
