#!/usr/bin/env node
// Runs a lean-workflow plan's gate: each landed task's own Proof command
// (except one equal to the gate command, a repeat of an earlier Proof, or running
// the test suite or only test files its globs cover when the gate is the default
// `npm run check`, which runs that suite), the first
// backticked command of the plan's Success criterion (else `none` for `Land gate:
// none`, else `npm run check`; any other Land gate is the per-task gate, never
// the final check), and a
// stray-path check that the diff touched nothing outside a task's declared
// Files. Ends on one REVIEWER: <agent name> line, picked from
// risk (a landed task's `Risk:`, a manifest change or a signature change
// since base), so a caller knows which agent reviews
// the change without asking. Reads the plan through #plan-tasks, the same
// module land-task.mjs uses, so both agree on which task actually landed.
//
//   node verify.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>]
//
// Prints one PASS, FAIL, SKIP, UNRUN or STRAY line per check, then the REVIEWER line,
// then one DONE or OPEN line per task and one MANUAL line per `## Manual
// checks` bullet, so the run ends on every task and the checks only the user can make.
// A FAIL line for a Proof or the Success criterion names why in brackets, the
// signal that killed the command, its exit code, or the unclean SUMMARY line of
// a Success criterion that exited 0, and is followed by the last
// lines of that command's output, each indented two spaces, so every check line
// still starts at the left margin.
// A land-task record `.exo/land-gate-<plan id>.json` for the HEAD tree skips the gate and each Proof it names with a SKIP line.
// The Success criterion passes on exit code 0, and when its output holds a
// `SUMMARY ` line, as exo's own `npm run check` prints, that line must also read
// FAIL=0 WARN=0 UNRUN=0.
// Exits 1 on any FAIL or STRAY line; `Land gate: none` with no Success criterion
// command prints UNRUN, not PASS, and does not fail.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf, landedTasks, parsePlan, planIdOf } from '#plan-tasks';
import { changedPaths } from '#size-facts';
import { SCRATCH_FOLDER } from '#scratch-path';
import { pickReviewer, signatureChangedSince, touchesManifest } from './pick-reviewer.mjs';

// The count line exo's `npm run check` ends on, e.g. `SUMMARY PASS=3 FAIL=0 WARN=0 UNRUN=0`.
const SUMMARY_LINE = /^SUMMARY [^\r\n]*/gm;
const CLEAN_SUMMARY = / FAIL=0 WARN=0 UNRUN=0\b/;
const DEFAULT_LAND_GATE = 'npm run check';
// A Proof that starts the whole test suite: `npm test`.
const TEST_SUITE_PROOF = /^npm test( |$)/;
// A Proof naming only test files: `node --test <file>...`, each a plain path.
const TEST_FILES_PROOF = /^node --test( [\w./-]+)+$/;
// Per-task Proofs spawned at once; a few overlap without starving the machine.
const PROOF_CONCURRENCY = 3;
// Output lines kept under a failed check's FAIL line: enough for a stack trace or
// a test summary, few enough that the report stays readable.
const FAIL_TAIL_LINES = 20;
// A longer output line is cut, so one minified or base64 line cannot flood the report.
const FAIL_TAIL_LINE_LENGTH = 300;
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

/** The globs `package.json` `scripts.test` hands `node --test`, or [] when there is no `package.json` or it runs no such command; a malformed one throws. */
function suiteGlobs(root) {
  let manifest;
  try {
    manifest = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const script = JSON.parse(manifest).scripts?.test ?? '';
  if (!script.startsWith('node --test ')) return [];
  const words = script.match(/"[^"]*"|'[^']*'|\S+/g).slice(2);
  return words.filter((word) => !word.startsWith('-')).map((word) => word.replace(/^["']|["']$/g, ''));
}

// `*` stays inside one folder, `**` crosses folders; no other glob syntax is read, so an
// exotic glob matches nothing and its Proof runs once more.
function globMatches(glob, file) {
  const pattern = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '(.*/)?');
  return new RegExp(`^${pattern}$`).test(file);
}

/** True when the Proof is `node --test <files>` and every file matches one of `globs`. */
export function filesUnderGlobs(command, globs) {
  if (!TEST_FILES_PROOF.test(command)) return false;
  const files = command.split(' ').slice(2).map((file) => file.replace(/^\.\//, ''));
  return files.every((file) => globs.some((glob) => globMatches(glob, file)));
}

/** A changed path outside every task's declared Files is a stray edit. */
export function findStrayPaths(tasks, paths) {
  const declared = new Set(tasks.flatMap((task) => task.files.map((file) => file.path)));
  return paths.filter((path) => !declared.has(path));
}

/** The last `SUMMARY ` line of `output`, or null when it prints none. */
export function summaryLine(output) {
  return output.match(SUMMARY_LINE)?.at(-1) ?? null;
}

/**
 * Whether a Success criterion run `{ ok, output }` passed. Without a SUMMARY line
 * its exit code alone decides, since another project's check never prints one. With
 * one, that line must also be clean, since exo's own `npm run check` exits 0 on a WARN or UNRUN.
 */
export function successCriterionPasses({ ok, output }) {
  const summary = summaryLine(output);
  return ok && (summary === null || CLEAN_SUMMARY.test(summary));
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

/**
 * Runs `command` through a shell to `{ ok, code, signal, output }`, `output` its stdout
 * and stderr together. When the shell cannot start, `code` holds the spawn error's code instead of an exit code.
 */
function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ ok: false, code: error.code ?? error.message, signal: null, output }));
    child.on('close', (code, signal) => resolve({ ok: code === 0, code, signal, output }));
  });
}

/** Why a command failed: the signal that killed it, else its exit code, else its spawn error. */
function failReason({ code, signal }) {
  if (signal !== null) return `signal ${signal}`;
  return typeof code === 'number' ? `exit ${code}` : `spawn error ${code}`;
}

/** The last FAIL_TAIL_LINES non-empty lines of `output`, each cut to FAIL_TAIL_LINE_LENGTH characters and indented two spaces. */
export function outputTail(output) {
  return output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-FAIL_TAIL_LINES).map((line) => `  ${line.slice(0, FAIL_TAIL_LINE_LENGTH)}`);
}

/** A failed check's FAIL line, naming `reason`, then the tail of its output. */
function failLines(check, reason, output) {
  return [`FAIL ${check} (${reason})`, ...outputTail(output)];
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
  const gateCommand = checkCommand ?? criterionCommand(frame.successCriterion) ?? landGateNone ?? DEFAULT_LAND_GATE;
  const gateSkipped = gateCommand === 'none';

  const proofRuns = [];
  const queued = new Set();
  const globs = suiteGlobs(root);
  for (const task of plan.tasks) {
    if (!landed.has(task.number) || task.proof === null) continue;
    const command = runnableProof(task.proof);
    if (command === null) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: not a single \`command\`)` });
      continue;
    }
    // A Proof that is the gate command, or runs the test suite or files its globs
    // cover under the default gate (which runs that suite), repeats what the gate runs once below. A
    // custom gate may run no tests, so a suite Proof still runs under it.
    const suiteUnderDefault = gateCommand === DEFAULT_LAND_GATE && (TEST_SUITE_PROOF.test(command) || filesUnderGlobs(command, globs));
    if (!gateSkipped && (command === gateCommand || suiteUnderDefault)) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)` });
      continue;
    }
    if (record?.proofs.includes(command)) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: land-task passed it on this same tree)` });
      continue;
    }
    if (queued.has(command)) {
      proofRuns.push({ skipLine: `SKIP Task ${task.number} (Proof: repeats an earlier task's Proof, which runs once)` });
      continue;
    }
    queued.add(command);
    proofRuns.push({ number: task.number, command });
  }

  // Proofs run up to PROOF_CONCURRENCY at once; their lines keep task order.
  const proofResults = await mapLimited(proofRuns, PROOF_CONCURRENCY, (run) => (run.skipLine ? null : runCommand(run.command)));
  proofRuns.forEach((run, index) => {
    if (run.skipLine) {
      lines.push(run.skipLine);
      return;
    }
    const proofRun = proofResults[index];
    if (proofRun.ok) {
      lines.push(`PASS Task ${run.number}`);
    } else {
      lines.push(...failLines(`Task ${run.number}`, failReason(proofRun), proofRun.output));
      failed = true;
    }
  });

  if (gateSkipped) {
    lines.push('UNRUN success-criterion (Land gate: none)');
  } else if (record?.gate === gateCommand) {
    lines.push('SKIP success-criterion (land-task ran the gate on this same tree)');
  } else {
    const gateRun = await runCommand(gateCommand);
    // The SUMMARY rule binds any gate whose output prints a SUMMARY line, whatever
    // the command; a gate that prints none, as another project's `npm run check`
    // does, is judged on its exit code alone. A run that exits 0 yet fails names its
    // SUMMARY line as the reason.
    if (successCriterionPasses(gateRun)) {
      lines.push('PASS success-criterion');
    } else {
      const reason = gateRun.ok ? summaryLine(gateRun.output) : failReason(gateRun);
      lines.push(...failLines('success-criterion', reason, gateRun.output));
      failed = true;
    }
  }

  const changed = changedPaths({ base });
  const strays = findStrayPaths(plan.tasks, changed);
  if (strays.length === 0) {
    lines.push('PASS stray-paths');
  } else {
    for (const path of strays) lines.push(`STRAY ${path}`);
    failed = true;
  }

  const riskTasks = plan.tasks.some((task) => landed.has(task.number) && task.risk !== null);
  // With no base there is no range of commits to read.
  const signatureChanged = base !== undefined && signatureChangedSince(base, root);
  lines.push(`REVIEWER: ${pickReviewer({ riskTasks, manifestChanged: touchesManifest(changed), signatureChanged })}`);
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
