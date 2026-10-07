// Lands one green task: refuses before it stages or commits anything when
// the checkout has changed or added a path outside the task's `Files:`, bar
// an untracked one a later, unlanded task names, else runs the task's `Commit:` block as the plan wrote it, its bare trailer
// swapped for one naming the plan, checks that the new commit carries the `Plan-task: <plan-id>/<n>` trailer and that the landed set now
// holds the task, and prints that set and next-task's `Next:` or `Wave:` line, so the session neither pastes the
// block nor reads the log. A compact task lands only when its `Proof:`
// command, or with none the Success-criterion test its build report names,
// passes when this script runs it in the checkout, and the report lists no
// command as failing under Proof; the printout carries that run's exit status
// and last output lines. A
// `Proof: mcp:<tool> <args>`, or one starting with a known MCP tool's short name,
// lands on its `<command>: deferred` line instead and prints `Pending: mcp:<tool> <args>`
// for the session to run. Above eight tasks each `Choice:` line of the
// report is appended to `<plan stem>-decisions.md` beside the plan. `--fix <subject>` bypasses all of that for a
// review-fix or bug-fix commit: it stages every changed path and commits it
// with the given subject, no task, plan or trailer needed. A task whose
// changed exported function signature still has a caller outside its
// `Files:` is refused with a `PLAN DRIFT` line, the one the drift repair reads.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { exportSignatures } from '#export-signatures';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { BLOCK_TASK_LIMIT, frameOf, isolatedCheckout, landedTasks, nextWave, parsePlan, PlanError, planIdOf, planRoute, planTaskTrailer, routeLine, waveLine } from '#plan-tasks';
import { SCRATCH_FOLDER } from '#scratch-path';
import { mcpToolCall } from '#mcp-tool-call';

/** The plan or the checkout gave no commit to land: exit 1 with an empty stdout. */
export class LandingError extends Error {}

/** A landing refusal the plan must repair: printed bare, so its line opens with `PLAN DRIFT`. */
export class PlanDriftError extends LandingError {}

// Single-quoted, with an embedded quote escaped by closing, escaping, and
// reopening the quote, so bash takes a path or title literally even with a
// `$`, backtick or double quote in it.
function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// The `Plan-task:` trailer plus one `Signature:` trailer per caller-breaking
// signature change, in one paragraph so git reads them all as trailers.
function trailersOf(planId, number, signatures) {
  return [planTaskTrailer(planId, number), ...signatures.map((signature) => `Signature: ${signature}`)].join('\n');
}

// A compact task carries no `Commit:` block by design: its heading title is
// the commit subject and its `Files:` field is the `git add` list, so this
// derives the same shape land-task would otherwise read from the plan text.
function deriveCommit(task, number, planId, signatures) {
  if (task.files.length === 0) {
    throw new LandingError(`Task ${number} has no Commit: block and no Files: to derive one from`);
  }
  const addArgs = task.files.map((file) => shellQuote(file.path)).join(' ');
  return `git add ${addArgs}\ngit commit -m ${shellQuote(task.title)} -m ${shellQuote(trailersOf(planId, number, signatures))}`;
}

// A `--root` naming a subdirectory of the checkout, or a copy under another
// name, would stage and commit paths outside the checkout the plan and its
// Files: lines describe. This runs before any command that stages or
// commits, so a mismatch never touches the checkout's git state.
function refuseMismatchedToplevel(root) {
  const resolvedRoot = realpathSync(root);
  const toplevel = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const resolvedToplevel = realpathSync(toplevel);
  if (resolvedToplevel !== resolvedRoot) {
    throw new LandingError(`--root '${root}' is not the checkout toplevel: git rev-parse --show-toplevel there prints '${toplevel}'`);
  }
}

// A review-fix or bug-fix commit names no task and touches whatever the
// repair changed, so `--fix <subject>` skips the Files: scope check and the
// Plan-task trailer entirely: it stages every changed path and commits it
// with the given subject as-is, the same shape the calling skill used to
// spell out as a bare `git add -A && git commit -m` line.
// With a `plan` path, the plan's `Lint:` command first runs on the changed
// script paths and a failure refuses the commit, as a task landing does.
export function fixLand({ root, subject, plan = null }) {
  refuseMismatchedToplevel(root);
  const status = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.trim() === '') {
    throw new LandingError('no changed path to commit');
  }
  if (plan !== null) runLint(frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame).lint, changedPaths(root), root);
  execFileSync('git', ['-C', root, 'add', '-A'], { encoding: 'utf8' });
  execFileSync('git', ['-C', root, 'commit', '-m', subject], { encoding: 'utf8' });
  const sha = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  return `Committed: ${sha}\n`;
}

// spec writes a `Commit:` block's trailer as the bare `Plan-task: <n>`, which
// names no plan; the block runs with that trailer swapped for the one that does.
export function commitBlockOf(plan, number, planId, signatures = []) {
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  if (task.commitBlock !== null) {
    if (!task.commitBlock.includes(`"Plan-task: ${number}"`)) {
      throw new LandingError(`the Commit: block of Task ${number} carries no "Plan-task: ${number}" trailer`);
    }
    return task.commitBlock.replace(`"Plan-task: ${number}"`, shellQuote(trailersOf(planId, number, signatures)));
  }
  if (task.compact) return deriveCommit(task, number, planId, signatures);
  throw new LandingError(`Task ${number} has no Commit: block`);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `<command>: <outcome>`, backticked or bare, optionally as a list item; a
// bare command runs to the last colon, so `npm run test:unit: pass` keeps its
// script name.
const ANY_OUTCOME_LINE = /^\s*(?:[-*]\s+)?(?:`([^`]+)`|(.+)):\s*(.*?)\s*$/;
// The build report's own field names, never a command.
const REPORT_FIELDS = new Set(['Landed', 'Proof', 'Unresolved']);
// A Proof run past this counts as failed; it stays under the 600-second cap of
// the Bash call that runs land-task, as wait-report's 540 seconds does.
const PROOF_TIMEOUT_MS = 540_000;
// The last non-empty output lines of the Proof run that the printout or the
// refusal carries.
const PROOF_TAIL_LINES = 20;
// A test-first report's `Test first:` and `Red: <command>: fail` lines come before `Proof:`;
// the red run's `fail` is the step before the edit, never a command outcome, so the lines read
// drop each of them and the more indented lines under it, the assertion and observed value.
const RED_FIELD_LINE = /^\s*(?:[-*]\s+)?(?:Test first|Red):/;
// The command whose outcome proves the task: the plan's `Proof:`, or for an
// older compact plan with none, the first command the report gives an outcome
// for, which is the Success-criterion test build-task wrote or picked.
function provedCommand(task, lines, reportPath) {
  if (task.proof !== null) return task.proof.replace(/^`(.*)`$/, '$1');
  for (const line of lines) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command !== undefined && match[3] !== '' && !REPORT_FIELDS.has(command)) return command;
  }
  throw new LandingError(`Task ${task.number}: no Proof: command, and the build report has no "<test>: pass" line${expectedLayout(task, reportPath)}`);
}

const FAILED_OUTCOME = /^fail(?:ed|s|ing)?\b/i;
const BARE_FAILED_OUTCOME = /^fail(?:ed)?(?:\s*\(.*\))?$/i;
const PROOF_FIELD_LINE = /^\s*(?:[-*]\s+)?Proof:\s*(.*)$/;
// A field line that closes the Proof section; `Choice:` lines follow it too.
const SECTION_END_LINE = /^\s*(?:[-*]\s+)?(?:Landed|Unresolved|Report|Choice):/;

// The report's Proof section: the lines after its `Proof:` field (plus any
// command on that line itself), or with no such field the report's opening
// lines, up to the next field line, so `Unresolved:` prose naming a failure
// never counts as an outcome line.
function proofSectionOf(lines) {
  const start = lines.findIndex((line) => PROOF_FIELD_LINE.test(line));
  const section = start === -1 ? lines : [lines[start].match(PROOF_FIELD_LINE)[1], ...lines.slice(start + 1)];
  const end = section.findIndex((line, index) => (start === -1 || index > 0) && SECTION_END_LINE.test(line));
  return end === -1 ? section : section.slice(0, end);
}

// A compact task's green is its `Proof:` pass, yet a build report that lists
// any other test or suite command as failing is a red checkout: landing it
// would commit a task the builder itself saw break something.
function refuseFailedCommand(task, lines) {
  for (const line of proofSectionOf(lines)) {
    const match = line.match(ANY_OUTCOME_LINE);
    const command = match?.[1] ?? match?.[2];
    if (command === undefined || REPORT_FIELDS.has(command)) continue;
    // A bare line is as likely the proof command's own output ("ok 3 - parser: fails on empty input"),
    // so it counts only as a bare "fail" or "fail (...)"; a backticked command keeps any failing word.
    const failing = match[1] === undefined ? BARE_FAILED_OUTCOME : FAILED_OUTCOME;
    if (!failing.test(match[3])) continue;
    throw new LandingError(`Task ${task.number}: the build report lists "${command}: ${match[3]}" under Proof, no clear pass`);
  }
}

// What every report refusal ends with, so one round fixes every report fault:
// the layout the report must have under Proof, filled with the task's command.
function expectedLayout(task, reportPath, command = null) {
  const written = command ?? (task.proof === null ? '<test command>' : task.proof.replace(/^`(.*)`$/, '$1'));
  const outcome = mcpProofOf(task) === null ? 'pass' : 'deferred';
  return `\nExpected under Proof: in ${reportPath}:\n${written}: ${outcome}`;
}

function reportLinesOf(task, reportText, reportPath) {
  if (reportText === null) {
    const wanted = task.proof === null ? 'a test for the Success criterion' : `"${task.proof}"`;
    throw new LandingError(`Task ${task.number}: no build report at '${reportPath}' to prove ${wanted}${expectedLayout(task, reportPath)}`);
  }
  const lines = reportText.replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  let redIndent = null;
  for (const line of lines) {
    const indent = line.length - line.trimStart().length;
    if (redIndent !== null && line.trim() !== '' && indent > redIndent) continue;
    redIndent = RED_FIELD_LINE.test(line) ? indent : null;
    if (redIndent === null) kept.push(line);
  }
  return kept;
}

// Each `<command>: <outcome>` line the report gives `command`, lowercased.
function outcomesOf(command, lines) {
  const outcomeLine = new RegExp(`^(\\s*)(?:[-*]\\s+)?(?:Proof:\\s*)?\`?${escapeRegExp(command)}\`?:\\s*(.*?)\\s*$`);
  return lines.flatMap((line, index) => {
    const match = line.match(outcomeLine);
    return match === null ? [] : [{ outcome: match[2].toLowerCase(), indent: match[1].length, index }];
  });
}

// A `Proof: mcp:<tool> <args>`, or one starting with a known MCP tool's short
// name, names a tool of an MCP server only the session holds, so this returns
// that call in its `mcp:` form, or null for a Bash proof.
export function mcpProofOf(task) {
  if (task.proof === null) return null;
  return mcpToolCall(task.proof.replace(/^`(.*)`$/, '$1'));
}

// The builder holds no MCP tool, so an MCP Proof lands on the report's
// `<command>: deferred` line, the command as the plan wrote it or in its `mcp:`
// form, never a pass it could not have seen; the session runs the tool after
// the landing, so this returns the `mcp:` form.
export function deferredProofOf(task, call, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const written = provedCommand(task, lines, reportPath);
  const outcomes = [...new Set([written, call])].flatMap((command) => outcomesOf(command, lines).map((entry) => ({ ...entry, command })));
  if (outcomes.length === 0) {
    throw new LandingError(`Task ${task.number}: the build report has no "${written}: deferred" line${expectedLayout(task, reportPath, written)}`);
  }
  const undeferred = outcomes.find(({ outcome }) => !/^deferred\b/.test(outcome));
  if (undeferred !== undefined) {
    throw new LandingError(`Task ${task.number}: the build report reads "${undeferred.command}: ${undeferred.outcome}", yet only the session runs an MCP tool Proof; report it deferred`);
  }
  refuseFailedCommand(task, lines);
  return call;
}

// The Bash command land-task runs as the task's Proof, once the report lists
// no command as failing under Proof: the builder saw that break, whatever the
// Proof's own run shows.
function proofCommandOf(task, reportText, reportPath) {
  const lines = reportLinesOf(task, reportText, reportPath);
  const command = provedCommand(task, lines, reportPath);
  refuseFailedCommand(task, lines);
  return command;
}

// A task is done only on proof from the real product, never on the report's
// word: the Proof runs in the checkout under bash, as the Land gate does, with
// stderr merged into stdout so the tail keeps their order. A nonzero exit, a
// signal or the timeout refuses the landing with the output's last lines; a
// pass returns its exit status and those lines for the printout.
function runProof(task, command, root) {
  const proofRun = spawnSync('bash', ['-e', '-c', `exec 2>&1\n${command}`], {
    cwd: root, encoding: 'utf8', timeout: PROOF_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  });
  const tail = (proofRun.stdout ?? '').split(/\r?\n/).filter((line) => line.trim() !== '').slice(-PROOF_TAIL_LINES).map((line) => `  ${line}`);
  if (proofRun.status === 0) return [`${command}: pass (exit 0)`, ...tail].join('\n');
  let reason = `exit ${proofRun.status}`;
  if (proofRun.error?.code === 'ETIMEDOUT') reason = `timed out after ${PROOF_TIMEOUT_MS / 1000}s`;
  else if (proofRun.error !== undefined) reason = `spawn error ${proofRun.error.message}`;
  else if (proofRun.signal !== null) reason = `signal ${proofRun.signal}`;
  throw new LandingError([`Task ${task.number}: the Proof: command "${command}" failed (${reason}):`, ...tail].join('\n'));
}

// `<plan stem>-decisions.md` beside the plan.
function decisionsPathOf(planPath) {
  const { dir, name } = path.parse(planPath);
  return path.join(dir, `${name}-decisions.md`);
}

const CHOICE_LINE = /^\s*(?:[-*]\s+)?Choice:\s*(.+?)\s*$/;

// Above BLOCK_TASK_LIMIT tasks each `Choice:` line of the build report
// becomes one `Task <n> <short sha>: <choice>` line of the decision log.
function appendDecisions({ planPath, reportText, taskCount, number, sha }) {
  if (planPath === undefined || reportText === null || taskCount <= BLOCK_TASK_LIMIT) return;
  const choices = reportText.replace(/\r\n/g, '\n').split('\n').flatMap((line) => {
    const match = line.match(CHOICE_LINE);
    return match === null ? [] : [`Task ${number} ${sha}: ${match[1]}\n`];
  });
  if (choices.length > 0) fs.appendFileSync(decisionsPathOf(planPath), choices.join(''));
}

// Every path the checkout has changed or added since HEAD, tracked or not: a
// `Commit:` block's own `git add` (the derived Files: list for a compact
// task, or a plan-written `git add .`) stages an untracked path alongside the
// task's files, so an untracked stray is as real as a tracked one. The
// checkout's own `${SCRATCH_FOLDER}/` scratch folder (the build report
// land-task itself reads) is never a stray: a host that has not yet run
// `scratch-exclude.mjs` still leaves it untracked, so it is dropped here
// rather than trusted to `--exclude-standard`. Likewise the plan file itself,
// when `planPath` sits inside `root`: spec hands its brief straight
// to build without committing it, so the plan the run is landing from can
// still be untracked in the very checkout it lands into. The decision log
// beside the plan is exempt for the same reason: land-task writes it after
// the commit and never commits it.
function untrackedPaths(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n');
}

function changedPaths(root, planPath) {
  const tracked = execFileSync('git', ['-C', root, 'diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const scratchPrefix = `${SCRATCH_FOLDER}/`;
  const exempt = planPath === undefined ? [] : [planPath, decisionsPathOf(planPath)].map((file) => path.relative(path.resolve(root), path.resolve(file)));
  return [...new Set([...tracked.split('\n'), ...untrackedPaths(root)])]
    .filter((line) => line !== '' && !line.startsWith(scratchPrefix) && !exempt.includes(line));
}

// A task lands only the paths its `Files:` lines name: a build that also
// touched or added another path is not this task's, whatever its proof, so
// this stops the Commit: block before it stages or commits anything.
// A `Files:` entry ending in `/` names a folder and covers every path under it.
function isCovered(entries, changed) {
  return entries.some((entry) => entry === changed || (entry.endsWith('/') && changed.startsWith(entry)));
}

// A `git add` of `.`, `-A`, `--all` or `:/` stages every untracked path.
const STAGES_ALL = /\bgit\s+add\b[^\n]*\s(?:\.|-A|--all|:\/)(?=\s|$)/m;

// The inline route writes every task's files before it lands the first, so
// an untracked path a later, unlanded task's `Files:` names is not a stray:
// it waits, unstaged, for its own landing. A path only an earlier or landed
// task names, a tracked change, or a Commit: block that stages everything
// still refuses.
function waitingPaths(plan, task, root, planPath) {
  if (task.commitBlock !== null && STAGES_ALL.test(task.commitBlock)) return () => false;
  const later = plan.tasks.filter((entry) => entry.number > task.number);
  if (later.length === 0) return () => false;
  const landed = landedTasks(plan.tasks, root, planIdOf(planPath));
  const laterEntries = later.filter((entry) => !landed.includes(entry.number)).flatMap((entry) => entry.files.map((file) => file.path));
  const untracked = new Set(untrackedPaths(root));
  return (changed) => untracked.has(changed) && isCovered(laterEntries, changed);
}

function strayPaths(plan, task, root, planPath) {
  const entries = task.files.map((file) => file.path);
  const outside = changedPaths(root, planPath).filter((changed) => !isCovered(entries, changed));
  if (outside.length === 0) return outside;
  const waiting = waitingPaths(plan, task, root, planPath);
  return outside.filter((changed) => !waiting(changed));
}

// The file's source at HEAD, or null when HEAD holds no such file.
function sourceAtHead(root, file) {
  const shown = spawnSync('git', ['-C', root, 'show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return shown.status === 0 ? shown.stdout : null;
}

// Tracked script files outside `inFiles` that hold `name` as a whole word; a
// comment or a same-named local counts too, which costs one plan repair.
function outsideCallers(root, name, inFiles) {
  const pathspecs = [...SCRIPT_EXTENSIONS].map((extension) => `*${extension}`);
  const found = spawnSync('git', ['-C', root, 'grep', '-l', '-w', '-F', '-e', name, '--', ...pathspecs], { encoding: 'utf8' });
  // git grep exits 1 when nothing matches.
  if (found.error !== undefined || found.status > 1) {
    throw new LandingError(`git grep for callers of ${name} failed: ${found.error?.message ?? found.stderr.trim()}`);
  }
  return found.stdout.split('\n').filter((file) => file !== '' && !isCovered([...inFiles], file));
}

// A call written against the old list fails against the new one when it must
// now pass more arguments, or passes more than the list now holds; a rename,
// an added default or an added rest parameter breaks no call.
function breaksCallers(before, after) {
  return after.required > before.required || after.total < before.total || (before.hasRest && !after.hasRest);
}

// Each exported function whose parameter list the task changed so that it
// breaks callers, as the `<file>:<name>(<old>) -> (<new>)` text the commit's
// `Signature:` trailer carries. One that still has a caller outside `Files:`,
// even when its proof and suite stay green, sends the task back to the plan.
function signatureChanges(task, root) {
  const inFiles = new Set(task.files.map((file) => file.path));
  const changes = [];
  const drifts = [];
  for (const file of inFiles) {
    if (file.endsWith('/') || !SCRIPT_EXTENSIONS.has(path.extname(file))) continue;
    const before = sourceAtHead(root, file);
    const workingPath = path.join(root, file);
    if (before === null || !fs.existsSync(workingPath)) continue;
    const after = exportSignatures(fs.readFileSync(workingPath, 'utf8'));
    for (const [name, oldParameters] of exportSignatures(before)) {
      const newParameters = after.get(name);
      if (newParameters === undefined || !breaksCallers(oldParameters, newParameters)) continue;
      const change = `${file}:${name}(${oldParameters.text}) -> (${newParameters.text})`.replace(/\s+/g, ' ');
      changes.push(change);
      const callers = outsideCallers(root, name, inFiles);
      if (callers.length > 0) drifts.push(`PLAN DRIFT: Task ${task.number}: ${change}; callers outside Files: ${callers.join(', ')}`);
    }
  }
  if (drifts.length > 0) throw new PlanDriftError(drifts.join('\n'));
  return changes;
}

// A `Lint: <command>` line in the plan's `## Plan basis` runs once on the
// task's own `Files:` paths (a `--fix` commit's changed paths) that are
// scripts and still exist, spawned without a shell, so the task lands on its Proof plus lint, not the test suite; a
// script the task deleted never reaches the linter as a missing path. A plan
// without the line, with `Lint: none`, or a task with no existing script path
// lints nothing.
function runLint(lint, files, root) {
  if (lint === null || lint === 'none') return;
  const paths = files
    .filter((file) => !file.endsWith('/') && SCRIPT_EXTENSIONS.has(path.extname(file)) && fs.existsSync(path.join(root, file)));
  if (paths.length === 0) return;
  const [command, ...args] = [...lint.split(/\s+/), ...paths];
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`.trim();
    throw new LandingError(`Lint "${lint}" failed:\n${output}`);
  }
}

// A `Land gate: <command>` line in the plan's `## Plan basis` runs once more
// right before the commit, so a check spec wrote against the plan's own
// layout still holds on whatever the build left; a plan without the line, or
// with `Land gate: none`, gates on nothing, as land-task always has.
function runLandGate(landGate, root) {
  if (landGate === null || landGate === 'none') return false;
  const gate = spawnSync('bash', ['-e', '-c', landGate], { cwd: root, encoding: 'utf8' });
  if (gate.status !== 0) {
    const output = `${gate.stdout ?? ''}${gate.stderr ?? ''}${gate.error?.message ?? ''}`.trim();
    throw new LandingError(`Land gate "${landGate}" failed:\n${output}`);
  }
  return true;
}

// The record verify.mjs reads to skip what this landing just ran and passed:
// the landed commit's tree, the gate command and the task's Proof. It holds
// only the latest landing, so an earlier task's Proof, passed on an older
// tree, is never skipped; a later landing or edit changes the tree, and
// verify then reruns everything. Lift the one-landing limit by keying proofs
// per tree.
function writeLandGateRecord({ root, planId, gate, proofCommand }) {
  const tree = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  const proofs = proofCommand === null ? [] : [proofCommand];
  fs.mkdirSync(path.join(root, SCRATCH_FOLDER), { recursive: true });
  fs.writeFileSync(path.join(root, SCRATCH_FOLDER, `land-gate-${planId}.json`), `${JSON.stringify({ tree, gate, proofs })}\n`);
}

function refuseStrayPaths(plan, task, root, planPath) {
  const stray = strayPaths(plan, task, root, planPath);
  if (stray.length > 0) {
    throw new LandingError(`Task ${task.number} changed a path outside Files: ${stray.map((file) => `\`${file}\``).join(', ')}`);
  }
}

function checkReport(task, reportText, reportPath) {
  const mcpCall = task.compact ? mcpProofOf(task) : null;
  const pending = mcpCall === null ? null : deferredProofOf(task, mcpCall, reportText, reportPath);
  const proofCommand = task.compact && pending === null ? proofCommandOf(task, reportText, reportPath) : null;
  return { proofCommand, pending };
}

// The stray-path and report checks landTask runs first, alone: nothing runs
// the Proof, commits, lints, gates or records, so a builder can run it before
// it reports.
export function checkTask({ planText, number, root, reportText = null, reportPath = '--report', planPath }) {
  refuseMismatchedToplevel(root);
  const plan = parsePlan(planText);
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  refuseStrayPaths(plan, task, root, planPath);
  checkReport(task, reportText, reportPath);
  return `Report OK: Task ${number}\n`;
}

export function landTask({ planText, number, root, reportText = null, reportPath = '--report', planPath }) {
  refuseMismatchedToplevel(root);
  const plan = parsePlan(planText);
  const planId = planIdOf(planPath);
  const task = plan.tasks.find((entry) => entry.number === number);
  if (task === undefined) throw new UsageError(`no Task ${number} in the plan`);
  refuseStrayPaths(plan, task, root, planPath);
  const block = commitBlockOf(plan, number, planId, signatureChanges(task, root));
  // A long-format task's `Run:` steps may expect a failure (a test-first
  // step), judged against their `Expected:` lines, which this script does not
  // parse, so only a compact task's report is read here.
  const { proofCommand, pending } = checkReport(task, reportText, reportPath);
  const proof = proofCommand === null ? null : runProof(task, proofCommand, root);
  const frame = frameOf(plan.frame);
  runLint(frame.lint, task.files.map((file) => file.path), root);
  const gateRan = runLandGate(frame.landGate, root);
  // The block runs under bash, as the plugin's hooks do; a host without bash
  // fails those hooks before this script runs.
  const commit = spawnSync('bash', ['-e', '-c', block], { cwd: root, encoding: 'utf8' });
  if (commit.status !== 0) {
    const output = `${commit.stdout ?? ''}${commit.stderr ?? ''}${commit.error?.message ?? ''}`.trim();
    throw new LandingError(`the Commit: block of Task ${number} failed:\n${output}`);
  }
  const head = execFileSync('git', ['-C', root, 'log', '-1', '--format=%h%n%s%n%B'], { encoding: 'utf8' });
  const [sha, subject, ...body] = head.split('\n');
  const trailer = planTaskTrailer(planId, number);
  if (!body.includes(trailer)) {
    throw new LandingError(`HEAD ${sha} carries no "${trailer}" trailer`);
  }
  // bash expands the block, so a `$` or backquote in its subject can commit a
  // subject the plan does not give.
  const expectedSubject = task.commitSubject ?? task.title;
  if (subject !== expectedSubject) {
    throw new LandingError(`HEAD ${sha} carries "${trailer}", yet its subject reads "${subject}" and the plan gives "${expectedSubject}"`);
  }
  if (gateRan) writeLandGateRecord({ root, planId, gate: frame.landGate, proofCommand });
  const landed = landedTasks(plan.tasks, root, planId);
  appendDecisions({ planPath, reportText, taskCount: plan.tasks.length, number, sha });
  const proofLines = proof === null ? '' : `Proof: ${proof}\n`;
  const pendingLine = pending === null ? '' : `Pending: ${pending}\n`;
  const route = planRoute(plan.tasks);
  // The inline route builds in the run checkout, never in a wave's worktrees.
  const wave = nextWave(plan.tasks, landed, route.route === 'inline' || isolatedCheckout(root) ? null : frame.worktreeSetup, frame.parallel);
  return `Committed: ${sha} Task ${number}\n${proofLines}${pendingLine}Landed: ${landed.join(', ')}\n${routeLine(route)}\n${waveLine(wave)}\n`;
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', task: 'value', root: 'value', report: 'value', fix: 'value', check: 'boolean' });
  const root = flags.root ?? process.cwd();
  if (flags.fix !== undefined) {
    process.stdout.write(fixLand({ root, subject: flags.fix, plan: flags.plan ?? null }));
    return;
  }
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!/^\d+$/.test(flags.task ?? '')) throw new UsageError("flag '--task' needs a task number");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  // The implementer prompt's `Report to:` path, so a wave's per-task worktree
  // finds its own report with no extra flag.
  const reportPath = flags.report ?? path.join(root, '.exo', `implementer-${flags.task}.md`);
  const reportText = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : null;
  const run = flags.check === true ? checkTask : landTask;
  process.stdout.write(run({ planText, number: Number(flags.task), root, reportText, reportPath, planPath: flags.plan }));
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof PlanDriftError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    } else if (error instanceof LandingError || error instanceof PlanError) {
      process.stderr.write(`land-task: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
