import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { REVIEWER_AGENTS } from '../skills/verify/scripts/pick-reviewer.mjs';
import { git, run } from './harness.mjs';
import { gitRepository, SCRIPT, CLEAN_CHECK } from './verify-gate-fixture.mjs';

const TASK = (number, risk = ' ') => `### Task ${number}: feat(app): t${number}\nDepends on: none | Files: \`src/t${number}.js\` | Data: none${risk}| Proof: node -e "process.exit(0)"\n`;

async function branchRun(plan, count, shared = false) {
  const files = { 'plan.md': plan, 'check.js': CLEAN_CHECK };
  for (let number = 1; number <= count; number += 1) files[`src/t${number}.js`] = 'export {};\n';
  const root = await gitRepository(files);
  const base = git(root, 'rev-parse', 'HEAD');
  for (let number = 1; number <= count; number += 1) {
    await writeFile(path.join(root, 'src', `t${shared ? 1 : number}.js`),`export const value = ${number};\n`);
    git(root, 'add', '-A');
    git(root, 'commit', '-m', `feat: t${number}`, '-m', `Plan-task: plan/${number}`);
  }
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  return { root, base, lines: result.stdout.split('\n') };
}

test('three landed tasks print one REVIEW Branch line over base..HEAD and no per-task line', async () => {
  const { base, lines } = await branchRun([TASK(1), TASK(2), TASK(3)].join('\n'), 3);
  assert.deepEqual(lines.filter((line) => line.startsWith('REVIEW')), [`REVIEW Branch ${base}..HEAD: ${REVIEWER_AGENTS.light}`]);
});

test('a task with Risk: security boundary makes the branch reviewer the deep one', async () => {
  const { base, lines } = await branchRun([TASK(1), TASK(2, ' | Risk: security boundary '), TASK(3)].join('\n'), 3);
  assert.deepEqual(lines.filter((line) => line.startsWith('REVIEW')), [`REVIEW Branch ${base}..HEAD: ${REVIEWER_AGENTS.deep}`]);
});

test('a review record with a verdict no longer prints REVIEWED', async () => {
  const { root, base } = await branchRun(TASK(1), 1);
  const sha = git(root, 'rev-parse', 'HEAD');
  await mkdir(path.join(root, '.exo'), { recursive: true });
  await writeFile(path.join(root, '.exo', `review-${sha.slice(0, 7)}.md`), 'Verdict: CLEAN\n');
  const result = await run(SCRIPT, ['--plan', 'plan.md', '--base', base, '--check-command', 'node check.js'], { cwd: root });
  assert.ok(!result.stdout.includes('REVIEWED'), result.stdout);
  assert.ok(result.stdout.includes(`REVIEW Branch ${base}..HEAD: `), result.stdout);
});

test('the OVERLAP review stays beside the branch line', async () => {
  const plan = [TASK(1), TASK(2).replace('src/t2.js', 'src/t1.js')].join('\n');
  const { lines } = await branchRun(plan, 2, true);
  assert.ok(lines.some((line) => line.startsWith('REVIEW Branch ')), lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith('OVERLAP src/t1.js')), lines.join('\n'));
});
