#!/usr/bin/env node
// Runs a lean-workflow plan's gate: each landed task's own Proof command
// (except one equal to the gate command, a repeat of an earlier Proof, or running
// the test suite or only test files its globs cover when the gate is the default
// `npm run check` or its `npm test` stand-in, each of which runs that suite), the first
// backticked command of the plan's Success criterion (else `none` for `Land gate:
// none`, else `npm run check`, or `npm test` when `package.json` has a `test` script
// and no `check` script, whose PASS line is followed by a ready `Proof:` line quoting
// this command when `package.json` names no `bin` and no `scripts.start`; any other Land gate is the per-task gate, never
// the final check), and a
// stray-path check that the diff touched nothing outside a task's declared
// Files, save the plan file itself. Ends on one `REVIEW Task <n> <shas>: <reviewer>` line per landed
// task (deep reviewer for `Risk: security boundary`, light for another Risk, a script file or a path under a `skills`, `agents`, `rules` or `hooks` folder or named `CLAUDE.md` or `AGENTS.md`,
// else `none (text only)`; `none (inline route)` for an inline-route task without Risk), then the
// `OVERLAP` lines of review-overlap.mjs, so a caller knows who reviews what. Reads the plan through #plan-tasks, the same
// module land-task.mjs uses, so both agree on which task actually landed.
//
//   node verify.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>]
//
// Prints one PASS, FAIL, WARN, SKIP, SESSION, UNRUN, STRAY or FIX-ONLY line per check, then one REVIEW (or REVIEWED, when `.exo/review-<sha7>.md` holds a verdict) line per landed task and the OVERLAP lines,
// then one DONE or OPEN line per task and one MANUAL line per `## Manual
// checks` bullet, so the run ends on every task and the checks only the user can make,
// and a last `REPORT <path>` line naming `<root>/.exo/run-report.md`, overwritten each run with
// the `## Proofs`, `## Checks` and `## Manual checks` of that run.
// A FAIL line for a Proof or the Success criterion names why in brackets, the
// signal that killed the command, its exit code, or the unclean SUMMARY line of
// a Success criterion that exited 0, and is followed by the last
// lines of that command's output, each indented two spaces, so every check line
// still starts at the left margin.
// A gate or Proof command already passed on this working tree, per `<git common dir>/exo/check-cache.json` (#check-cache), prints a SKIP line, not a rerun; each pass here is recorded there.
// The Success criterion passes on exit code 0, and when its output holds a
// `SUMMARY ` line, as exo's own `npm run check` prints, that line must also read
// FAIL=0 WARN=0 UNRUN=0.
// A Proof or Success criterion command written `mcp:<tool> <args>`, or starting
// with a known MCP tool's short name, names an MCP tool, which only the session
// can call: it is never spawned and prints a SESSION line naming the call in its
// `mcp:` form, which is neither PASS nor FAIL, so the gate is not passed until
// the session runs that tool call.
// Any other Proof whose first word is a snake_case name the shell cannot find
// names that likely MCP tool and the `mcp:<tool>` form on its FAIL line.
// A failed Success criterion whose output blames only unlanded tasks' declared Files,
// as on a run scoped to some of the plan's tasks, prints a SKIP line naming them, not FAIL.
// A claims-diff check compares each landed task's claims with its commits' diff: a FAIL line
// for a `Files:` path no commit of the task changed, and for a test-first task (`Risk:`, or a
// `fix` with a test file in `Files:`) whose commits change no test file; a WARN line, which
// does not fail, for each assertion a test file loses, each `.skip` or `.only` it gains and
// each lint, type or coverage suppression comment any non-prose file gains.
// A changed path outside every task's Files that only trailer-less `fix(...)` commits in
// base..HEAD touched prints `FIX-ONLY <path> (<short shas>)`, newest first, after the PASS or
// STRAY lines: a report line, not drift, so it does not fail. A path any task-trailer or non-fix
// commit touched, or one with no commit in the range, stays a STRAY line.
// Exits 1 on any FAIL or STRAY line; `Land gate: none` with no Success criterion
// command prints UNRUN, not PASS, and does not fail.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs, parseFlags, UsageError, isMain } from '#script-flags';
import { frameOf, landedTasks, parsePlan, planIdOf, planRoute, taskCommits } from '#plan-tasks';
import { killTree } from '#process-tree';
import { cachedPass, recordPass } from '#check-cache';
import { changedPaths } from '#size-facts';
import { proofsReport } from '#proofs-report';
import { mcpToolCall } from '#mcp-tool-call';
import { packageHasEntryPoint } from '#package-entry-point';
import { TEST_FILE, taskDiffOf, taskPaths, taskReviewer } from './pick-reviewer.mjs';
import { findOverlaps, formatOverlaps, readChanges } from './review-overlap.mjs';

// The count line exo's `npm run check` ends on, e.g. `SUMMARY PASS=3 FAIL=0 WARN=0 UNRUN=0`.
const SUMMARY_LINE = /^SUMMARY [^\r\n]*/gm;
const CLEAN_SUMMARY = / FAIL=0 WARN=0 UNRUN=0\b/;
const DEFAULT_LAND_GATE = 'npm run check';
// The default gate of a package with a `test` script and no `check` script.
const TEST_SCRIPT_GATE = 'npm test';
const TEST_SCRIPT_PASS = 'PASS success-criterion (npm test; no check script)';
// An argument a shell reads as one word unquoted.
const PLAIN_SHELL_WORD = /^[\w@%+=:,./-]+$/;
// A Proof that starts the whole test suite: `npm test`.
const TEST_SUITE_PROOF = /^npm test( |$)/;
// A Proof naming only test files: `node --test <file>...`, each a plain path.
const TEST_FILES_PROOF = /^node --test( [\w./-]+)+$/;
// Per-task Proofs spawned at once; a few overlap without starving the machine.
const PROOF_CONCURRENCY = 3;
// Deadlines: a Proof or the gate past its own is killed and fails closed.
// EXO_PROOF_TIMEOUT_MS and EXO_GATE_TIMEOUT_MS override them for a test.
const PROOF_TIMEOUT_MS = 540_000;
const GATE_TIMEOUT_MS = 1_800_000;
// Output lines kept under a failed check's FAIL line: enough for a stack trace or
// a test summary, few enough that the report stays readable.
const FAIL_TAIL_LINES = 20;
// A longer output line is cut, so one minified or base64 line cannot flood the report.
const FAIL_TAIL_LINE_LENGTH = 300;
const BACKTICKED_COMMAND = /`([^`]+)`/;
// An output line reporting a pass, or opening a TAP subtest, names a path without blaming it.
const PASS_REPORT_LINE = /^\s*(?:#\s*Subtest:|ok\b|pass\b|✔|✓)/i;
// An output line reporting one failed check.
const FAIL_REPORT_LINE = /^\s*(?:fail\b|not ok\b|✖|✗|×)/i;
// A Proof: value that carries a backtick reads as prose describing the
// check (for example "npm run validate, whose output holds no `[FAIL]`
// line"), not a command; running it through a shell would hand the shell
// that backtick pair as its own command substitution.
const PROSE_PROOF = /`/;
// A bare snake_case first word, the shape of an MCP tool's short name.
const SNAKE_CASE_WORD = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
// The exit code a POSIX shell returns for a command it cannot find.
const COMMAND_NOT_FOUND = 127;
// A line a test file loses that asserts, and a line it gains that skips or isolates a test.
const REMOVED_ASSERTION = /expect\(|assert/;
const ADDED_SKIP = /\.(?:skip|only)\b/;
// A line that switches a check off in place: a lint, type or coverage suppression comment.
const SILENCER = /eslint-disable|@ts-(?:ignore|nocheck|expect-error)|#\s*(?:noqa|type:\s*ignore|pylint:\s*disable)|\/\/\s*nolint|biome-ignore|(?:istanbul|c8) ignore/;
const PROSE_FILE = /\.(?:md|mdx|txt|rst)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = /^(?:---|\+\+\+) (?:[ab]\/)?(.*)$/;
// A WARN line quotes at most this much of the changed line.
const WARN_TEXT_LENGTH = 100;

/** A task's Proof: as a command to run, or null when a backtick marks it as prose instead. */
export function runnableProof(proof) {
  if (proof === null || PROSE_PROOF.test(proof)) return null;
  return proof;
}

/**
 * The first word of an unmarked Proof the shell could not find, when that word is
 * snake_case and so likely an MCP tool's short name, else null.
 */
export function unmarkedMcpTool(command, { code, output }) {
  if (code !== COMMAND_NOT_FOUND) return null;
  const word = command.split(/\s/, 1)[0];
  if (!SNAKE_CASE_WORD.test(word)) return null;
  return new RegExp(`\\b${word}: (?:command )?not found`).test(output) ? word : null;
}

/** The `scripts` of the root's `package.json`, or {} when it has none or there is no `package.json`; a malformed one throws. */
function packageScripts(root) {
  let manifest;
  try {
    manifest = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  return JSON.parse(manifest).scripts ?? {};
}

/** The globs `scripts.test` hands `node --test`, or [] when it runs no such command. */
function suiteGlobs(scripts) {
  const script = scripts.test ?? '';
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

/**
 * The command that ran this script, rebuilt from `argv` in the form SKILL.md gives:
 * `node "<script>"`, then each argument bare, or double-quoted when a shell would split
 * or expand it. A shell expansion the caller typed, such as `"$(pwd)"`, shows expanded.
 */
export function commandLine(argv) {
  const quoted = (word) => `"${word.replace(/["\\$`]/g, '\\$&')}"`;
  const args = argv.slice(2).map((word) => (PLAIN_SHELL_WORD.test(word) ? word : quoted(word)));
  return ['node', quoted(argv[1]), ...args].join(' ');
}

/**
 * The plan file's path from the repository root of `root`, with `/` separators as git prints
 * paths, so the stray check can tell the run's own input from an edit; a plan outside the
 * repository yields a `../` path that matches no changed path.
 */
function repoPathOf(planPath, root) {
  const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  return path.relative(top, fs.realpathSync(planPath)).split(path.sep).join('/');
}

/** A changed path outside every task's declared Files is a stray edit; a Files entry ending in `/` covers every path under it, as in land-task.mjs. */
export function findStrayPaths(tasks, paths) {
  const declared = tasks.flatMap((task) => task.files.map((file) => file.path));
  return paths.filter((path) => !declared.some((entry) => entry === path || (entry.endsWith('/') && path.startsWith(entry))));
}

/** The fix commit shape: a `fix` subject and no `Plan-task: ` trailer line. */
function isTrailerlessFix({ subject, body }) {
  return /^fix(\([^)]*\))?!?:/.test(subject) && !/^Plan-task: /m.test(body);
}

/** The lead's CHANGELOG commit shape: a `docs(changelog)` subject and no `Plan-task: ` trailer line. */
function isLeadChangelog({ subject, body }) {
  return /^docs\(changelog\):/.test(subject) && !/^Plan-task: /m.test(body);
}

/**
 * Splits stray `paths` by their commits. `commitsByPath` maps a path to the `{ sha, subject, body }`
 * commits in the range that touch it, newest first. A path with commits, every one a trailer-less
 * `fix`, is fix-only, with the short shas of those commits; `CHANGELOG.md` with only trailer-less
 * `docs(changelog)` commits is the lead's, same shape; any other stray path stays a stray.
 */
export function splitFixOnlyPaths(paths, commitsByPath) {
  const strays = [];
  const fixOnly = [];
  const lead = [];
  for (const path of paths) {
    const commits = commitsByPath.get(path) ?? [];
    const shas = commits.map((commit) => commit.sha.slice(0, 7));
    if (commits.length > 0 && commits.every(isTrailerlessFix)) fixOnly.push({ path, shas });
    else if (path === 'CHANGELOG.md' && commits.length > 0 && commits.every(isLeadChangelog)) lead.push({ path, shas });
    else strays.push(path);
  }
  return { strays, fixOnly, lead };
}

/** The commits in `base..HEAD` that touch each of `paths`, newest first, as `splitFixOnlyPaths` reads them. */
function commitsTouching(paths, root, base) {
  const commitsByPath = new Map();
  if (base === undefined) return commitsByPath;
  for (const path of paths) {
    const log = execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'log', '--no-renames', '--format=%x01%H%x00%B', `${base}..HEAD`, '--', path], { encoding: 'utf8', maxBuffer: Infinity });
    commitsByPath.set(path, log.split('\x01').filter((entry) => entry !== '').map((entry) => {
      const [sha, body] = entry.split('\0');
      return { sha, subject: body.split('\n')[0], body };
    }));
  }
  return commitsByPath;
}

/** The paths of `files` that no path in `changed` covers; a `*` path reads as a glob, a path ending `/` as a folder. */
export function unchangedFiles(files, changed) {
  return files.map((file) => file.path.replace(/^\.\//, '')).filter((wanted) => {
    if (wanted.includes('*')) return !changed.some((path) => globMatches(wanted, path));
    if (wanted.endsWith('/')) return !changed.some((path) => path.startsWith(wanted));
    return !changed.includes(wanted);
  });
}

/** Whether the plan marks a task test-first: a `Risk:` field, or a `fix` that lists a test file in `Files:`. */
export function isTestFirst(task) {
  return task.risk !== null || (/^fix\b/.test(task.title) && task.files.some((file) => TEST_FILE.test(file.path)));
}

/**
 * What a patch (`git show -U0`) does to the tests it touches: `path:line removed ...` for each
 * assertion line a test file loses (unless the same line is added back, as a moved test does),
 * `path:line added ...` for each `.skip` or `.only` line it gains.
 */
export function weakenedTests(patch) {
  const added = new Set();
  const removed = [];
  const skips = [];
  let file = null;
  let oldLine = 0;
  let newLine = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const line of patch.split('\n')) {
    const hunk = oldLeft === 0 && newLeft === 0 ? line.match(HUNK_HEADER) : null;
    const header = oldLeft === 0 && newLeft === 0 ? line.match(FILE_HEADER) : null;
    if (hunk !== null) {
      [oldLine, newLine] = [Number(hunk[1]), Number(hunk[3])];
      [oldLeft, newLeft] = [Number(hunk[2] ?? 1), Number(hunk[4] ?? 1)];
    } else if (header !== null) {
      if (header[1] !== '/dev/null') file = header[1];
    } else if (oldLeft > 0 && line.startsWith('-')) {
      if (TEST_FILE.test(file) && REMOVED_ASSERTION.test(line)) removed.push({ file, at: oldLine, text: line.slice(1).trim() });
      oldLeft -= 1;
      oldLine += 1;
    } else if (newLeft > 0 && line.startsWith('+')) {
      added.add(line.slice(1).trim());
      if (TEST_FILE.test(file) && ADDED_SKIP.test(line)) skips.push({ file, at: newLine, text: line.slice(1).trim() });
      newLeft -= 1;
      newLine += 1;
    }
  }
  const quote = (text) => `\`${text.slice(0, WARN_TEXT_LENGTH)}\``;
  return [
    ...removed.filter(({ text }) => !added.has(text)).map(({ file: path, at, text }) => `${path}:${at} removed ${quote(text)}`),
    ...skips.map(({ file: path, at, text }) => `${path}:${at} added ${quote(text)}`)
  ];
}

/** `path:line silenced ...` for each line a patch (`git show -U0`) adds that carries a suppression comment, outside prose files. */
export function silencedChecks(patch) {
  const findings = [];
  let file = null;
  let oldLeft = 0;
  let newLeft = 0;
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const idle = oldLeft === 0 && newLeft === 0;
    const hunk = idle ? line.match(HUNK_HEADER) : null;
    const header = idle ? line.match(FILE_HEADER) : null;
    if (hunk !== null) {
      [oldLeft, newLeft, newLine] = [Number(hunk[2] ?? 1), Number(hunk[4] ?? 1), Number(hunk[3])];
    } else if (header !== null) {
      if (header[1] !== '/dev/null') file = header[1];
    } else if (oldLeft > 0 && line.startsWith('-')) {
      oldLeft -= 1;
    } else if (newLeft > 0 && line.startsWith('+')) {
      if (!PROSE_FILE.test(file) && SILENCER.test(line)) findings.push(`${file}:${newLine} silenced \`${line.slice(1).trim().slice(0, WARN_TEXT_LENGTH)}\``);
      newLeft -= 1;
      newLine += 1;
    }
  }
  return findings;
}

/**
 * The claims-diff lines for one landed task: a FAIL line for a test-first task whose commits
 * change no test file, a WARN line for `Files:` paths its commits left unchanged, each
 * test weakened and each check silenced in them. Empty when its claims hold.
 */
function claimLines(task, root, planId) {
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'show', '--format=', '--no-renames', ...args], { encoding: 'utf8', maxBuffer: Infinity });
  const shas = taskCommits(task, root, planId);
  const changed = taskPaths(task, root, planId);
  const lines = [];
  const unchanged = unchangedFiles(task.files, changed);
  if (unchanged.length > 0) lines.push(`WARN claims-diff Task ${task.number} (Files: unchanged in its commit: ${unchanged.join(', ')})`);
  if (isTestFirst(task) && !changed.some((path) => TEST_FILE.test(path))) {
    lines.push(`FAIL claims-diff Task ${task.number} (test-first, but its commit adds or changes no test file)`);
  }
  for (const sha of shas) {
    const patch = git('-U0', '--no-color', '--no-ext-diff', sha);
    for (const finding of [...weakenedTests(patch), ...silencedChecks(patch)]) lines.push(`WARN claims-diff Task ${task.number} (${finding})`);
  }
  return lines;
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

/** Whether `line` names `file` as a whole path, so `src/case.js` never matches `src/title-case.js`. */
function namesPath(line, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w-]|\\.\\w)`).test(line);
}

/**
 * The unlanded task numbers a failed Success criterion's `output` blames, or [] when the failure
 * may lie in landed work. A line blames a task when it names one of the task's declared Files and
 * reports no pass. It is [] when a line blames a landed task, or a line reporting a failure
 * (`fail`, `not ok`, `✖`) names no unlanded task's file, since such a failure may be landed work's.
 */
export function unlandedBlame(tasks, landed, output) {
  const blaming = output.split(/\r?\n/).filter((line) => !PASS_REPORT_LINE.test(line));
  const names = (line, task) => task.files.some((file) => namesPath(line, file.path));
  const open = tasks.filter((task) => !landed.has(task.number));
  if (tasks.some((task) => landed.has(task.number) && blaming.some((line) => names(line, task)))) return [];
  if (blaming.some((line) => FAIL_REPORT_LINE.test(line) && !open.some((task) => names(line, task)))) return [];
  return open.filter((task) => blaming.some((line) => names(line, task))).map((task) => task.number);
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
 * Runs `command` through a shell to `{ ok, code, signal, output }`, `output` its stdout
 * and stderr together; past `timeoutMs` it is killed and `timedOutMs` is set. When the shell cannot start, `code` holds the spawn error's code instead of an exit code.
 */
function runCommand(command, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { shell: true, detached: process.platform !== 'win32' });
    let output = '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      killTree(child.pid);
      finish({ ok: false, code: null, signal: null, timedOutMs: timeoutMs, output, ms: Date.now() - started });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => finish({ ok: false, code: error.code ?? error.message, signal: null, output }));
    child.on('close', (code, signal) => finish({ ok: code === 0, code, signal, output, ms: Date.now() - started }));
  });
}

/** Why a command failed: the signal that killed it, else its exit code, else its spawn error. */
function failReason({ code, signal, timedOutMs }) {
  if (timedOutMs !== undefined) return `timed out after ${timedOutMs / 1000}s`;
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
 * The plan's checks, one PASS/FAIL/SKIP/SESSION/UNRUN/STRAY/FIX-ONLY line each, then the REVIEWER
 * line. `planPath` names the plan whose id its landed trailers carry; `root`
 * names the checkout the gate reads landed commits and runs
 * commands in; `base` the revision the diff and stray check compare against.
 */
export async function runGate(planText, { planPath, checkCommand, root = process.cwd(), base, invocation = commandLine(process.argv) } = {}) {
  const plan = parsePlan(planText);
  const frame = frameOf(plan.frame);
  const planId = planIdOf(planPath);
  const landed = new Set(landedTasks(plan.tasks, root, planId));
  const lines = [];
  let failed = false;
  const landGateNone = frame.landGate === 'none' ? 'none' : null;
  const scripts = packageScripts(root);
  const namedGate = checkCommand ?? criterionCommand(frame.successCriterion) ?? landGateNone;
  // With no gate named and no `check` script, the package's own `npm test` is the default gate.
  const testScriptGate = namedGate === null && scripts.check === undefined && scripts.test !== undefined;
  const gateCommand = namedGate ?? (testScriptGate ? TEST_SCRIPT_GATE : DEFAULT_LAND_GATE);
  const gateSkipped = gateCommand === 'none';
  const gateMcpCall = mcpToolCall(gateCommand);

  const proofRuns = [];
  const queued = new Set();
  const globs = suiteGlobs(scripts);
  for (const task of plan.tasks) {
    if (!landed.has(task.number) || task.proof === null) continue;
    const command = runnableProof(task.proof);
    if (command === null) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: not a single \`command\`)` });
      continue;
    }
    // An MCP tool call compares in its `mcp:` form, so a prefixed and an unprefixed
    // spelling of one call count as the same check.
    const mcpCall = mcpToolCall(command);
    const check = mcpCall ?? command;
    // A Proof that is the gate command, or runs the test suite or files its globs
    // cover under the default gate or its `npm test` stand-in (each runs that suite), repeats what the gate runs once below. A
    // custom gate may run no tests, so a suite Proof still runs under it.
    const suiteUnderDefault = (gateCommand === DEFAULT_LAND_GATE || testScriptGate) && (TEST_SUITE_PROOF.test(command) || filesUnderGlobs(command, globs));
    if (!gateSkipped && (check === (gateMcpCall ?? gateCommand) || suiteUnderDefault)) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: is the gate command or a test-suite run the default gate covers, which the gate runs once below)` });
      continue;
    }
    if (cachedPass(root, command) !== null) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: passed on this same tree)` });
      continue;
    }
    if (queued.has(check)) {
      proofRuns.push({ line: `SKIP Task ${task.number} (Proof: repeats an earlier task's Proof, which runs once)` });
      continue;
    }
    queued.add(check);
    if (mcpCall !== null) {
      proofRuns.push({ line: `SESSION Task ${task.number} (Proof: ${mcpCall}; run it as an MCP tool call)` });
      continue;
    }
    proofRuns.push({ number: task.number, command });
  }

  // Proofs run up to PROOF_CONCURRENCY at once; their lines keep task order.
  const proofResults = await mapLimited(proofRuns, PROOF_CONCURRENCY, (run) => (run.line ? null : runCommand(run.command, environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS))));
  proofRuns.forEach((run, index) => {
    if (run.line) {
      lines.push(run.line);
      return;
    }
    const proofRun = proofResults[index];
    if (proofRun.ok) {
      recordPass(root, run.command, proofRun.ms);
      lines.push(`PASS Task ${run.number}`);
    } else {
      const tool = unmarkedMcpTool(run.command, proofRun);
      const reason = tool === null ? failReason(proofRun) : `${failReason(proofRun)}, ${tool} looks like an MCP tool; write the Proof as mcp:${tool}`;
      lines.push(...failLines(`Task ${run.number}`, reason, proofRun.output));
      failed = true;
    }
  });

  if (gateSkipped) {
    lines.push('UNRUN success-criterion (Land gate: none)');
  } else if (gateMcpCall !== null) {
    lines.push(`SESSION success-criterion (${gateMcpCall}; run it as an MCP tool call)`);
  } else if (cachedPass(root, gateCommand) !== null) {
    lines.push('SKIP success-criterion (passed on this same tree)');
  } else {
    const gateRun = await runCommand(gateCommand, environmentMs('EXO_GATE_TIMEOUT_MS', GATE_TIMEOUT_MS));
    // The SUMMARY rule binds any gate whose output prints a SUMMARY line, whatever
    // the command; a gate that prints none, as another project's `npm run check`
    // does, is judged on its exit code alone. A run that exits 0 yet fails names its
    // SUMMARY line as the reason.
    if (successCriterionPasses(gateRun)) recordPass(root, gateCommand, gateRun.ms);
    if (successCriterionPasses(gateRun) && testScriptGate) {
      // A ready Proof line for build's report, quoting this command and a line it printed,
      // only for a library, so a suite never stands in for the product.
      lines.push(TEST_SCRIPT_PASS);
      if (!packageHasEntryPoint(root)) lines.push(`Proof: \`${invocation}\` -> ${TEST_SCRIPT_PASS}`);
    } else if (successCriterionPasses(gateRun)) {
      lines.push('PASS success-criterion');
    } else {
      const reason = gateRun.ok ? summaryLine(gateRun.output) : failReason(gateRun);
      // A run scoped to some tasks fails a criterion that covers the rest; with only
      // unlanded tasks blamed, the landed ones still go on to the branch review.
      const blamed = unlandedBlame(plan.tasks, landed, gateRun.output);
      if (blamed.length > 0) {
        lines.push(`SKIP success-criterion (out of scope: ${reason} names only files of unlanded Task ${blamed.join(', ')})`, ...outputTail(gateRun.output));
      } else {
        lines.push(...failLines('success-criterion', reason, gateRun.output));
        failed = true;
      }
    }
  }

  const changed = changedPaths({ base });
  // The plan file committed on the branch is the run's input, not drift.
  const planFile = repoPathOf(planPath, root);
  const undeclared = findStrayPaths(plan.tasks, changed.filter((changedPath) => changedPath !== planFile));
  const { strays, fixOnly, lead } = splitFixOnlyPaths(undeclared, commitsTouching(undeclared, root, base));
  if (strays.length === 0) {
    lines.push('PASS stray-paths');
  } else {
    for (const path of strays) lines.push(`STRAY ${path}`);
    failed = true;
  }
  for (const { path, shas } of [...fixOnly].sort((a, b) => (a.path < b.path ? -1 : 1))) lines.push(`FIX-ONLY ${path} (${shas.join(',')})`);
  for (const { path, shas } of lead) lines.push(`LEAD ${path} (${shas.join(',')})`);

  const claims = plan.tasks.filter((task) => landed.has(task.number)).flatMap((task) => claimLines(task, root, planId));
  lines.push(...(claims.length === 0 ? ['PASS claims-diff'] : claims));
  if (claims.some((line) => line.startsWith('FAIL '))) failed = true;

  // One REVIEW line per landed task, REVIEWED when its last commit's review record holds a verdict.
  const route = planRoute(plan.tasks).route;
  for (const task of plan.tasks.filter((entry) => landed.has(entry.number))) {
    const shas = taskCommits(task, root, planId);
    const record = shas.length === 0 ? null : path.join(path.resolve(root ?? '.'), '.exo', `review-${shas[0].slice(0, 7)}.md`);
    if (record !== null && fs.existsSync(record) && /\b(CLEAN|FINDINGS|BLOCKED)\b/.test(fs.readFileSync(record, 'utf8'))) {
      lines.push(`REVIEWED Task ${task.number} ${record}`);
    } else {
      lines.push(`REVIEW Task ${task.number} ${shas.join(',')}: ${taskReviewer(task, taskPaths(task, root, planId), route, taskDiffOf(task, root, planId))}`);
    }
  }
  // With no base there is no range of commits to read.
  lines.push(...(base === undefined ? ['OVERLAP none'] : formatOverlaps(findOverlaps(readChanges(base, root))).split('\n')));
  for (const { task, title, done } of taskStates(plan.tasks, landed)) lines.push(`${done ? 'DONE' : 'OPEN'} Task ${task}: ${title}`);
  for (const check of manualChecks(plan.frame)) lines.push(`MANUAL ${check}`);
  return { lines, failed };
}

/**
 * Overwrites `<root>/.exo/run-report.md` with the run's `## Proofs`, `## Checks` (the printed
 * lines but MANUAL) and `## Manual checks`, and returns its path.
 */
function writeRunReport(lines, { planPath, planText, root }) {
  const manual = lines.filter((line) => line.startsWith('MANUAL '));
  const checks = lines.filter((line) => !line.startsWith('MANUAL '));
  const reportPath = path.join(root, '.exo', 'run-report.md');
  const text = [
    '## Proofs', proofsReport({ planPath, planText, root }).trimEnd(), '',
    '## Checks', ...checks, '',
    '## Manual checks', ...manual.map((line) => `- ${line.slice('MANUAL '.length)}`), ''
  ].join('\n');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, text);
  return reportPath;
}

async function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', 'check-command': 'value' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  // Resolved before the chdir below, so a relative --plan keeps naming the caller's file.
  const planPath = path.resolve(flags.plan);
  const planText = fs.readFileSync(planPath, 'utf8');
  const root = flags.root === undefined ? undefined : path.resolve(flags.root);
  if (root !== undefined) process.chdir(root);
  const { lines, failed } = await runGate(planText, { planPath, checkCommand: flags['check-command'], root, base: flags.base });
  process.stdout.write(`${lines.join('\n')}\n`);
  const reportPath = writeRunReport(lines, { planPath, planText, root: path.resolve('.') });
  process.stdout.write(`REPORT ${reportPath}\n`);
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
