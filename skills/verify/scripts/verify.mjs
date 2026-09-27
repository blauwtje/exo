#!/usr/bin/env node
// Runs a lean-workflow plan's gate: each landed task's own Proof command,
// the plan's success criterion, and a stray-path check that the working
// tree changed nothing outside the Files a task named. Ends on one
// REVIEWER: sonnet or REVIEWER: opus line, picked from the size of the
// working-tree diff, so a caller knows which model reviews the change
// without asking.
//
//   node verify.mjs --plan <path> [--check-command <cmd>]
//
// Prints one PASS, FAIL or STRAY line per check, then the REVIEWER line.
// Exits 1 when any check is not PASS.

import { spawnSync } from 'node:child_process';
import fs, { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { parseFlags, UsageError } from '#script-flags';
import { changedPaths, measureSizeFacts } from '#size-facts';
import { pickReviewer } from './pick-reviewer.mjs';

const TASK_HEADING = /^### Task (\d+):/;
const CHECK_SUMMARY = /SUMMARY.*FAIL=0 WARN=0 UNRUN=0/;

/** One task's number, declared Files and Proof command, read off its `Files: ... | Proof: ...` line. */
export function parseTasks(planText) {
  const tasks = [];
  let current = null;
  for (const line of planText.split('\n')) {
    const heading = TASK_HEADING.exec(line);
    if (heading !== null) {
      current = { number: Number(heading[1]), files: [], proof: null };
      tasks.push(current);
      continue;
    }
    if (current === null) continue;
    const filesMatch = line.match(/\|\s*Files:\s*(.*?)\s*\|/);
    if (filesMatch !== null) {
      current.files = [...filesMatch[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    }
    const proofMatch = line.match(/\|\s*Proof:\s*(.*)$/);
    if (proofMatch !== null) current.proof = proofMatch[1].trim();
  }
  return tasks;
}

/** A changed path outside every task's declared Files is a stray edit. */
export function findStrayPaths(tasks, paths) {
  const declared = new Set(tasks.flatMap((task) => task.files));
  return paths.filter((path) => !declared.has(path));
}

/** `npm run check`'s clean line, so the gate reads the same SUMMARY the workflow does. */
export function successCriterionPasses(output) {
  return CHECK_SUMMARY.test(output);
}

function runCommand(command) {
  const result = spawnSync(command, { shell: true, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** The plan's checks, one PASS/FAIL/STRAY line each, then the REVIEWER line. */
export function runGate(planText, { checkCommand }) {
  const tasks = parseTasks(planText);
  const lines = [];
  let failed = false;

  for (const task of tasks) {
    if (task.proof === null) continue;
    const { ok } = runCommand(task.proof);
    lines.push(`${ok ? 'PASS' : 'FAIL'} Task ${task.number}`);
    failed ||= !ok;
  }

  const { ok: checkOk, output } = runCommand(checkCommand);
  lines.push(`${checkOk && successCriterionPasses(output) ? 'PASS' : 'FAIL'} success-criterion`);
  failed ||= !checkOk || !successCriterionPasses(output);

  const strays = findStrayPaths(tasks, changedPaths());
  if (strays.length === 0) {
    lines.push('PASS stray-paths');
  } else {
    for (const path of strays) lines.push(`STRAY ${path}`);
    failed = true;
  }

  lines.push(`REVIEWER: ${pickReviewer(measureSizeFacts())}`);
  return { lines, failed };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', 'check-command': 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  const planText = fs.readFileSync(flags.plan, 'utf8');
  const checkCommand = flags['check-command'] ?? 'npm run check';
  const { lines, failed } = runGate(planText, { checkCommand });
  process.stdout.write(`${lines.join('\n')}\n`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`verify: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
