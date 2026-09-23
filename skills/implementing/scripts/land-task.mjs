// Lands one green task: runs the task's `Commit:` block as the plan wrote it,
// checks that the new commit carries the `Plan-task: <n>` trailer, and prints
// the landed set, so the session neither pastes the block nor reads the log.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from '#script-flags';
import { landedTasks, parsePlan } from './plan-tasks.mjs';

/** The plan or the checkout gave no commit to land: exit 1 with an empty stdout. */
export class LandingError extends Error {}

export function commitBlockOf(plan, number) {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  if (task.commitBlock === null) throw new LandingError(`Task ${number} has no Commit: block`);
  if (!task.commitBlock.includes(`"Plan-task: ${number}"`)) {
    throw new LandingError(`the Commit: block of Task ${number} carries no "Plan-task: ${number}" trailer`);
  }
  return task.commitBlock;
}

export function landTask({ planText, number, root }) {
  const plan = parsePlan(planText);
  const block = commitBlockOf(plan, number);
  // The block runs under bash, as the plugin's hooks do; a host without bash
  // fails those hooks before this script runs.
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status !== 0) {
    const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
    throw new LandingError(`the Commit: block of Task ${number} failed:\n${output}`);
  }
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%B'], { encoding: 'utf8' });
  const [sha, ...body] = head.split('\n');
  if (!new RegExp(`^Plan-task: ${number}$`, 'm').test(body.join('\n'))) {
    throw new LandingError(`HEAD ${sha} carries no "Plan-task: ${number}" trailer`);
  }
  return `Committed: ${sha} Task ${number}\nLanded: ${landedTasks(plan.tasks, root).join(', ')}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  process.stdout.write(landTask({ planText, number: Number(flags.task), root: flags.root ?? process.cwd() }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof LandingError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
