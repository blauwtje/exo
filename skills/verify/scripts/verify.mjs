#!/usr/bin/env node
// Runs a lean-workflow plan's gate: each landed task's own Proof command
// (except one equal to the gate command, or running the test suite when the
// gate is the default `npm run check`, which runs that suite), the first
// backticked command of the plan's Success criterion (else its Land gate, else
// `npm run check`), and a
// stray-path check that the diff touched nothing outside a task's declared
// Files. Ends on one REVIEWER: <agent name> line, picked from
// the size of the diff against base, so a caller knows which agent reviews
// the change without asking. Reads the plan through #plan-tasks, the same
// module land-task.mjs uses, so both agree on which task actually landed.
//
//   node verify.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>]
//
// Prints one PASS, FAIL, SKIP, UNRUN or STRAY line per check, then the REVIEWER line,
// then one DONE or OPEN line per task and one MANUAL line per `## Manual
// checks` bullet, so the run ends on every task and the checks only the user can make.
// A land-task record `.exo/land-gate-<plan id>.json` for the HEAD tree skips the gate and each Proof it names with a SKIP line.
// Exits 1 on any FAIL or STRAY line; `Land gate: none` prints UNRUN, not PASS,
// and does not fail.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf, landedTasks, parsePlan, planIdOf } from '#plan-tasks';
import { changedPaths, measureSizeFacts } from '#size-facts';
import { SCRATCH_FOLDER } from '#scratch-path';
import { pickReviewer } from './pick-reviewer.mjs';

const CHECK_SUMMARY = /SUMMARY.*FAIL=0 WARN=0 UNRUN=0/;
const DEFAULT_LAND_GATE = 'npm run check';
// A Proof that starts the test suite: `npm test` or `node --test ...`.
const TEST_SUITE_PROOF = /^(npm test|node --test)( |$)/;
// Per-task Proofs spawned at once; a few overlap without starving the machine.
const PROOF_CONCURRENCY = 3;
const BACKTICKED_COMMAND = /`([^`]+)`/;
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

/** The first backticked command in the plan's Success criterion text, or null when it has none. */
export function criterionCommand(successCriterion) {
  return successCriterion?.match(BACKTICKED_COMMAND)?.[1] ?? null;
}

/** Every task of the plan as `{ task, done }`, done when its landed commit exists. */
export function taskStates(tasks, landed) {
  return tasks.map((task) => ({ task: task.number, title: task.title, done: landed.has(task.number) }));
}

/** The bullets of the plan's `## Manual checks` section, one string each. */
export function manualChecks(frame) {
  const section = frame['Manual checks'] ?? '';
  return section.split('\n').filter((line) => line.trim().startsWith('- ')).map((line) => line.trim().slice(2));
}

/**
 * What land-task passed on the tree now checked out: its `.exo/land-gate-<planId>.json`
 * `{ gate, proofs }`, or null when the file is absent or unreadable, the HEAD tree differs,
 * or a tracked file has changed since. An untracked file is not checked, the same
 * limit land-task's own gate run had.
 */
function landedGateRecord(root, planId) {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(root, SCRATCH_FOLDER, `land-gate-${planId}.json`), 'utf8'));
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    if (record.tree !== git('rev-parse', 'HEAD^{tree}')) return null;
    if (git('status', '--porcelain', '--untracked-files=no') !== '') return null;
    return record;
  } catch {
    return null;
  }
}

function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', () => resolve({ ok: false, output }));
    child.on('close', (code) => resolve({ ok: code === 0, output }));
  });
}

/** `items` mapped through the async `work`, at most `limit` running at once, results in item order. */
async function mapLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * The plan's checks, one PASS/FAIL/SKIP/UNRUN/STRAY line each, then the REVIEWER
 * line. `planPath` names the plan whose id its landed trailers carry; `root`
 * names the checkout the gate reads landed commits and runs
 * commands in; `base` the revision the diff and stray check compare against.
 */
export async function runGate(planText, { planPath, checkCommand, root = process.cwd(), base } = {}) {
  const plan = parsePlan(planText);
  const frame = frameOf(plan.frame);
  const planId = planIdOf(planPath);
  const landed = new Set(landedTasks(plan.tasks, root, planId));
  const record = landedGateRecord(root, planId);
  const lines = [];
  let failed = false;
  const landGateNone = frame.landGate === 'none' ? 'none' : null;
  const gateCommand = checkCommand ?? landGateNone ?? criterionCommand(frame.successCriterion) ?? frame.landGate ?? DEFAULT_LAND_GATE;
  const gateSkipped = gateCommand === 'none';

  const proofRuns = [];
  for (const task of plan.tasks) {
    if (!landed.has(task.number) || task.proof === null) continue;
    const command = runnableProof(task.proof);
    if (command === null) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: not a single \`command\`)` });
      continue;
    }
    // A Proof that is the gate command, or runs the test suite under the default
    // gate (which runs that suite), repeats what the gate runs once below. A
    // custom gate may run no tests, so a suite Proof still runs under it.
    const suiteUnderDefault = gateCommand === DEFAULT_LAND_GATE && TEST_SUITE_PROOF.test(command);
    if (!gateSkipped && (command === gateCommand || suiteUnderDefault)) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)` });
      continue;
    }
    if (record?.proofs.includes(command)) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: land-task passed it on this same tree)` });
      continue;
    }
    proofRuns.push({ number: task.number, command });
  }

  // Proofs run up to PROOF_CONCURRENCY at once; their lines keep task order.
  const proofResults = await mapLimited(proofRuns, PROOF_CONCURRENCY, (run) => (run.skipLine ? null : runCommand(run.command)));
  proofRuns.forEach((run, index) => {
    if (run.skipLine) {
      lines.push(run.skipLine);
      return;
    }
    const { ok } = proofResults[index];
    lines.push(`${ok ? 'PASS' : 'FAIL'} Task ${run.number}`);
    failed ||= !ok;
  });

  if (gateSkipped) {
    lines.push('UNRUN success-criterion (Land gate: none)');
  } else if (record?.gate === gateCommand) {
    lines.push('SKIP success-criterion (land-task ran the gate on this same tree)');
  } else {
    const { ok: checkOk, output } = await runCommand(gateCommand);
    // The SUMMARY convention binds only exo's own default gate; a plan that
    // names its own Land gate is judged on that command's exit status alone,
    // since another project's check never prints exo's SUMMARY line.
    const criterionOk = checkOk && (gateCommand !== DEFAULT_LAND_GATE || successCriterionPasses(output));
    lines.push(`${criterionOk ? 'PASS' : 'FAIL'} success-criterion`);
    failed ||= !criterionOk;
  }

  const strays = findStrayPaths(plan.tasks, changedPaths({ base }));
  if (strays.length === 0) {
    lines.push('PASS stray-paths');
  } else {
    for (const path of strays) lines.push(`STRAY ${path}`);
    failed = true;
  }

  lines.push(`REVIEWER: ${pickReviewer(measureSizeFacts({ base }))}`);
  for (const { task, title, done } of taskStates(plan.tasks, landed)) lines.push(`${done ? 'DONE' : 'OPEN'} Task ${task}: ${title}`);
  for (const check of manualChecks(plan.frame)) lines.push(`MANUAL ${check}`);
  return { lines, failed };
}

async function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', 'check-command': 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  const planText = fs.readFileSync(flags.plan, 'utf8');
  if (flags.root !== undefined) process.chdir(flags.root);
  const { lines, failed } = await runGate(planText, { planPath: flags.plan, checkCommand: flags['check-command'], root: flags.root, base: flags.base });
  process.stdout.write(`${lines.join('\n')}\n`);
  if (failed) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`verify: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
