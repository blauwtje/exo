#!/usr/bin/env node
// Runs a lean-workflow plan's gate: each landed task's own Proof command,
// the plan's Land gate (or `npm run check` when the plan names none), and a
// stray-path check that the diff touched nothing outside a task's declared
// Files. Ends on one REVIEWER: sonnet or REVIEWER: opus line, picked from
// the size of the diff against base, so a caller knows which model reviews
// the change without asking. Reads the plan through #plan-tasks, the same
// module land-task.mjs uses, so both agree on which task actually landed.
//
//   node verify.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>]
//
// Prints one PASS, FAIL, SKIP or STRAY line per check, then the REVIEWER line.
// Exits 1 when any check is not PASS.

import { spawnSync } from 'node:child_process';
import fs, { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { parseFlags, UsageError } from '#script-flags';
import { frameOf, landedTasks, parsePlan } from '#plan-tasks';
import { changedPaths, measureSizeFacts } from '#size-facts';
import { pickReviewer } from './pick-reviewer.mjs';

const CHECK_SUMMARY = /SUMMARY.*FAIL=0 WARN=0 UNRUN=0/;
const DEFAULT_LAND_GATE = 'npm run check';
// A Proof: value that carries a backtick reads as prose describing the
// check (for example "npm run validate, whose output holds no `[FAIL]`
// line"), not a command; running it through a shell would hand the shell
// that backtick pair as its own command substitution.
const PROSE_PROOF = /`/;

/** A task's Proof: as a command to run, or null when a backtick marks it as prose instead. */
export function runnableProof(proof) {
  if (proof === null || PROSE_PROOF.test(proof)) return null;
  return proof;
}

/** A changed path outside every task's declared Files is a stray edit. */
export function findStrayPaths(tasks, paths) {
  const declared = new Set(tasks.flatMap((task) => task.files.map((file) => file.path)));
  return paths.filter((path) => !declared.has(path));
}

/** `npm run check`'s own clean line: exo's default Land gate, when the plan names none. */
export function successCriterionPasses(output) {
  return CHECK_SUMMARY.test(output);
}

function runCommand(command) {
  const result = spawnSync(command, { shell: true, encoding: 'utf8' });
  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/**
 * The plan's checks, one PASS/FAIL/SKIP/STRAY line each, then the REVIEWER
 * line. `root` names the checkout the gate reads landed commits and runs
 * commands in; `base` the revision the diff and stray check compare against.
 */
export function runGate(planText, { checkCommand, root = process.cwd(), base } = {}) {
  const plan = parsePlan(planText);
  const frame = frameOf(plan.frame);
  const landed = new Set(landedTasks(plan.tasks, root));
  const lines = [];
  let failed = false;

  for (const task of plan.tasks) {
    if (!landed.has(task.number) || task.proof === null) continue;
    const command = runnableProof(task.proof);
    if (command === null) {
      lines.push(`SKIP Task ${task.number} (Proof: not a single \`command\`)`);
      continue;
    }
    const { ok } = runCommand(command);
    lines.push(`${ok ? 'PASS' : 'FAIL'} Task ${task.number}`);
    failed ||= !ok;
  }

  const gateCommand = checkCommand ?? frame.landGate ?? DEFAULT_LAND_GATE;
  const gateSkipped = gateCommand === 'none';
  const { ok: checkOk, output } = gateSkipped ? { ok: true, output: '' } : runCommand(gateCommand);
  // The SUMMARY convention binds only exo's own default gate; a plan that
  // names its own Land gate is judged on that command's exit status alone,
  // since another project's check never prints exo's SUMMARY line.
  const criterionOk = gateSkipped || (checkOk && (gateCommand !== DEFAULT_LAND_GATE || successCriterionPasses(output)));
  lines.push(`${criterionOk ? 'PASS' : 'FAIL'} success-criterion`);
  failed ||= !criterionOk;

  const strays = findStrayPaths(plan.tasks, changedPaths({ base }));
  if (strays.length === 0) {
    lines.push('PASS stray-paths');
  } else {
    for (const path of strays) lines.push(`STRAY ${path}`);
    failed = true;
  }

  lines.push(`REVIEWER: ${pickReviewer(measureSizeFacts({ base }))}`);
  return { lines, failed };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', 'check-command': 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (flags.root !== undefined) process.chdir(flags.root);
  const { lines, failed } = runGate(planText, { checkCommand: flags['check-command'], root: flags.root, base: flags.base });
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
