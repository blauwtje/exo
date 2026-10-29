#!/usr/bin/env node

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { environmentMs, parseFlags, UsageError, isMain } from '#script-flags';
import { coversCompanion, criterionCommand, frameOf, isCovered, isPlanDoc, landedTasks, parsePlan, planIdOf, planRoute, taskCommits } from '#plan-tasks';
import { killTree } from '#process-tree';
import { BRANCH_REVIEW_KEY, cachedPass, recordPass, successCriterionPasses, summaryLine } from '#check-cache';
import { changedPaths } from '#size-facts';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { codeRuleFindings } from '#code-rules';
import { proofsReport } from '#proofs-report';
import { transcriptFolder } from '#confine-claude';
import { contextLimit, contextPeaks } from '#context-limits';
import { mcpToolCall } from '#mcp-tool-call';
import { packageHasEntryPoint } from '#package-entry-point';
import { isTestFirst, isTestPath, runnableProof } from '#red-green';
import { boundaryLines, dispatchLines, redLines, writeReviewInput } from './review-input.mjs';
import { REVIEWER_AGENTS, taskDiffOf, taskPaths, taskReviewer } from './pick-reviewer.mjs';
import { findingsDigest } from './merge-reviews.mjs';
import { findOverlaps, formatOverlaps, readChanges } from './review-overlap.mjs';
import { fixedProbes } from './run-probes.mjs';

const USAGE = `Usage: node gate.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>] [--reviews-only]
       node gate.mjs --repair --plan <path> --root <checkout> --pre-fix-sha <sha> --findings <path> --findings-sha256 <hash>
Runs a plan's gate: each landed task's Proof, the Success criterion command and an unplanned-path check.
Prints one PASS, FAIL, WARN, SKIP, SESSION, UNRUN, UNPLANNED or FIX-ONLY line per check,
then one REVIEW Branch line and the OVERLAP lines, one DONE or OPEN line per task,
one MANUAL line per manual check and a last REPORT <root>/.exo/run-report.md line.
--reviews-only prints only the REVIEW and OVERLAP lines, then one DISPATCH line per review to dispatch
(code standard, review rules, plan, checkout, base, reports, scope, findings path, proof files), and runs no proof or gate.
--base also checks the lines each task added against the code rules, into <root>/.exo/code-rules.md.
--reviews-only also prints HEAD.
--repair checks the fixer's return and prints FAIL fixer-uncommitted, FAIL fixer-no-commits, FAIL stale-findings,
FAIL fixer-no-guard (a commit lacks Sweep: or Guard:) or FAIL fixer-guard-not-in-diff, else PASS fixer-committed.
It then rechecks only the repair diff: the Land gate, the tests covering the changed files and each named Guard test,
then prints one DISPATCH Repair line for the fix-diff review and LOOP next=fix|done|stop round=<n>/2.
A third repair pass prints STOP repair-bound. The pass count lives in <root>/.exo/verify-state.json.
Exits 1 on any FAIL or UNPLANNED line.`;
const DEFAULT_BASE = 'main';
const DEFAULT_LAND_GATE = 'npm run check';
const TEST_SCRIPT_GATE = 'npm test';
const TEST_SCRIPT_PASS = 'PASS success-criterion (npm test; no check script)';
const PLAIN_SHELL_WORD = /^[\w@%+=:,./-]+$/;
const TEST_SUITE_PROOF = /^npm test( |$)/;
const TEST_FILES_PROOF = /^node --test( [\w./-]+)+$/;
const PROOF_CONCURRENCY = 3;
const PROOF_TIMEOUT_MS = 540_000;
const GATE_TIMEOUT_MS = 1_800_000;
const FAIL_TAIL_LINES = 20;
const FAIL_TAIL_LINE_LENGTH = 300;
const PASS_REPORT_LINE = /^\s*(?:#\s*Subtest:|ok\b|pass\b|✔|✓)/i;
const FAIL_REPORT_LINE = /^\s*(?:fail\b|not ok\b|✖|✗|×)/i;
const SNAKE_CASE_WORD = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
// why: a POSIX shell returns 127 for a command it cannot find.
const COMMAND_NOT_FOUND = 127;
const REMOVED_ASSERTION = /expect\(|assert/;
const ADDED_SKIP = /\.(?:skip|only)\b/;
const SILENCER = /eslint-disable|@ts-(?:ignore|nocheck|expect-error)|#\s*(?:noqa|type:\s*ignore|pylint:\s*disable)|\/\/\s*nolint|biome-ignore|(?:istanbul|c8) ignore/;
const PROSE_FILE = /\.(?:md|mdx|txt|rst)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = /^(?:---|\+\+\+) (?:[ab]\/)?(.*?)\t?$/;
const WARN_TEXT_LENGTH = 100;
const SELF_HOSTED_SCRIPTS = ['skills/gate/', 'skills/build/review-fixer-prompt.md', 'skills/route-skills/references/code-standard.md'];
const SELF_HOSTED_AGENTS = ['agents/'];
const GATE_SCRIPT = 'skills/gate/scripts/gate.mjs';
const REPAIR_BOUND = 2;
const REPAIR_REVIEW_LINE = 'REVIEW Branch repair: review-branch';
const COMMIT_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';
const GUARD_WITHOUT_REASON = /^none(?!\s*\(\s*[^\s)])/i;
const GUARD_TEST_FILE = /^tests\/[^/]+\.test\.mjs$/;

export function unmarkedMcpTool(command, { code, output }) {
  if (code !== COMMAND_NOT_FOUND) return null;
  const word = command.split(/\s/, 1)[0];
  if (!SNAKE_CASE_WORD.test(word)) return null;
  return new RegExp(`\\b${word}: (?:command )?not found`).test(output) ? word : null;
}

function gitOutput(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function underAny(file, prefixes) {
  return prefixes.some((prefix) => file === prefix || (prefix.endsWith('/') && file.startsWith(prefix)));
}

export function selfHostingGap(root, base = DEFAULT_BASE) {
  const changed = gitOutput(root, ['-c', 'core.quotepath=off', 'diff', '--name-only', `${base}...HEAD`]).split('\n').filter((file) => file !== '');
  return { scripts: changed.filter((file) => underAny(file, SELF_HOSTED_SCRIPTS)), agents: changed.filter((file) => underAny(file, SELF_HOSTED_AGENTS)) };
}

function sharesRepository(root, pluginRoot) {
  if (spawnSync('git', ['-C', pluginRoot, 'rev-parse', '--git-dir'], { stdio: 'ignore' }).status !== 0) return false;
  const commonDir = (dir) => fs.realpathSync(path.resolve(dir, gitOutput(dir, ['rev-parse', '--git-common-dir'])));
  return commonDir(root) === commonDir(pluginRoot);
}

function hostingFor({ root, base, running, pluginRoot }) {
  if (!sharesRepository(root, pluginRoot)) return null;
  const gap = selfHostingGap(root, base);
  const branchScript = path.join(path.resolve(root), GATE_SCRIPT);
  const branchRuns = fs.existsSync(branchScript) && fs.realpathSync(branchScript) !== fs.realpathSync(running);
  return { reexec: gap.scripts.length > 0 && branchRuns ? branchScript : null, note: gap.agents.length > 0 ? `SELF-HOSTED agents=${gap.agents.join(',')}` : null };
}

export function selfHostPlan({ root, base, running, pluginRoot = path.resolve(path.dirname(running), '../../..') }) {
  return hostingFor({ root, base, running, pluginRoot }) ?? { reexec: null, note: null };
}

function reviewedState(root) {
  return [`HEAD ${gitOutput(root, ['rev-parse', 'HEAD'])}`];
}

function bodyField(body, name) {
  return body.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1].trim().replace(/^`|`$/g, '') ?? null;
}

function repairCommits(root, preFixSha) {
  const log = gitOutput(root, ['log', `--format=%h${FIELD_SEPARATOR}%B${COMMIT_SEPARATOR}`, `${preFixSha}..HEAD`]);
  return log.split(COMMIT_SEPARATOR).map((entry) => entry.trim()).filter((entry) => entry !== '').map((entry) => {
    const [sha, body] = entry.split(FIELD_SEPARATOR);
    return { sha, sweep: bodyField(body, 'Sweep'), guard: bodyField(body, 'Guard') };
  });
}

function missingFields({ sweep, guard }) {
  return [sweep === null ? 'Sweep:' : null, guard === null || GUARD_WITHOUT_REASON.test(guard) ? 'Guard:' : null].filter((field) => field !== null);
}

function namedGuards(commits) {
  return commits.map(({ guard }) => guard).filter((guard) => guard !== null && !/^none\b/i.test(guard));
}

function guardLines(commits, diffFiles) {
  const incomplete = commits.filter((commit) => missingFields(commit).length > 0);
  return [
    ...incomplete.map((commit) => `FAIL fixer-no-guard (commit ${commit.sha} lacks ${missingFields(commit).join(' and ')})`),
    ...namedGuards(commits).filter((guard) => !diffFiles.includes(guard)).map((guard) => `FAIL fixer-guard-not-in-diff (${guard} is not in the repair diff)`)
  ];
}

async function repairTestLines(files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const timeoutMs = environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS);
  const lines = [];
  for (const file of files) {
    const run = await runCommand(`node --test ${file}`, timeoutMs, env);
    if (!run.ok) lines.push(...failLines(`repair-test ${file}`, failReason(run), run.output));
  }
  return lines;
}

async function recheckLines({ root, planText, diffFiles, commits }) {
  const landGate = frameOf(parsePlan(planText).frame).landGate;
  const lines = [];
  if (landGate !== null && landGate !== 'none') {
    const run = await runCommand(landGate, environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS), process.env);
    if (!run.ok) lines.push(...failLines(`repair-static ${landGate}`, failReason(run), run.output));
  }
  const guardTests = namedGuards(commits).filter((guard) => GUARD_TEST_FILE.test(guard));
  const tests = [...new Set([...coveringTests(root, diffFiles), ...guardTests])];
  lines.push(...await repairTestLines(tests));
  return lines.length === 0 ? [`PASS repair-recheck (${landGate ?? 'no Land gate'}; ${tests.length} test file${tests.length === 1 ? '' : 's'})`] : lines;
}

function fixDiffDispatch({ root, planPath, preFixSha }) {
  const [branch] = dispatchLines([REPAIR_REVIEW_LINE], { root, planPath, base: preFixSha, head: 'HEAD' });
  return branch.replace('DISPATCH Branch:', 'DISPATCH Repair:').replace('scope=branch', 'scope=fix-diff').replace(/ findings=\S+/, ` findings=${path.join(path.resolve(root), '.exo', 'fix-review.md')}`).replace(/ ledger=\S+/, '');
}

function repairPasses(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.exo', 'verify-state.json'), 'utf8')).repairPasses ?? 0;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

function recordRepairPasses(root, repairPasses) {
  const file = path.join(root, '.exo', 'verify-state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ repairPasses })}\n`);
}

function loopLines(round, failed) {
  if (!failed) return [`LOOP next=done round=${round}/${REPAIR_BOUND}`];
  if (round < REPAIR_BOUND) return [`LOOP next=fix round=${round}/${REPAIR_BOUND}`];
  return ['STOP repair-bound', `LOOP next=stop round=${REPAIR_BOUND}/${REPAIR_BOUND}`];
}

function handbackLines({ root, preFixSha, findings, findingsSha256 }) {
  const lines = [];
  if (findingsDigest(fs.readFileSync(findings, 'utf8')) !== findingsSha256) lines.push(`FAIL stale-findings (a finding line in ${findings} changed since merge-reviews printed ${findingsSha256})`);
  const dirty = execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).split('\n').filter((line) => line !== '' && !line.slice(3).startsWith('.exo/'));
  if (dirty.length > 0) lines.push(`FAIL fixer-uncommitted (${dirty.length} changed path${dirty.length === 1 ? '' : 's'} after the fixer returned)`, ...dirty.map((line) => `  ${line}`));
  const fixed = fixedProbes(fs.readFileSync(findings, 'utf8')).filter((probe) => !probe.unmarked).length;
  const commits = repairCommits(root, preFixSha);
  if (fixed > 0 && commits.length === 0) lines.push(`FAIL fixer-no-commits (${fixed} fixed, no commit since ${preFixSha})`);
  const diffFiles = gitOutput(root, ['-c', 'core.quotepath=off', 'diff', '--name-only', `${preFixSha}..HEAD`]).split('\n').filter((file) => file !== '');
  lines.push(...guardLines(commits, diffFiles));
  return { lines, commits, diffFiles };
}

export async function repairLines({ root, planText, planPath, preFixSha, findings, findingsSha256 }) {
  const passes = repairPasses(root);
  if (passes >= REPAIR_BOUND) return ['STOP repair-bound', `LOOP next=stop round=${REPAIR_BOUND}/${REPAIR_BOUND}`];
  const { lines: problems, commits, diffFiles } = handbackLines({ root, preFixSha, findings, findingsSha256 });
  const lines = problems.length === 0 ? ['PASS fixer-committed'] : problems;
  if (problems.length === 0 && commits.length > 0) {
    lines.push(...await recheckLines({ root, planText, diffFiles, commits }));
    if (!lines.some((line) => line.startsWith('FAIL '))) lines.push(fixDiffDispatch({ root, planPath, preFixSha }));
  }
  recordRepairPasses(root, passes + 1);
  return [...lines, ...loopLines(passes + 1, lines.some((line) => line.startsWith('FAIL ')))];
}

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

function suiteGlobs(scripts) {
  const script = scripts.test ?? '';
  if (!script.startsWith('node --test ')) return [];
  const words = script.match(/"[^"]*"|'[^']*'|\S+/g).slice(2);
  return words.filter((word) => !word.startsWith('-')).map((word) => word.replace(/^["']|["']$/g, ''));
}

function globMatches(glob, file) {
  const pattern = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '(.*/)?');
  return new RegExp(`^${pattern}$`).test(file);
}

export function filesUnderGlobs(command, globs) {
  if (!TEST_FILES_PROOF.test(command)) return false;
  const files = command.split(' ').slice(2).map((file) => file.replace(/^\.\//, ''));
  return files.every((file) => globs.some((glob) => globMatches(glob, file)));
}

export function commandLine(argv) {
  const quoted = (word) => `"${word.replace(/["\\$`]/g, '\\$&')}"`;
  const args = argv.slice(2).map((word) => (PLAIN_SHELL_WORD.test(word) ? word : quoted(word)));
  return ['node', quoted(argv[1]), ...args].join(' ');
}

function repoPathOf(planPath, root) {
  const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  // why: git prints repository paths with / separators on every platform.
  return path.relative(top, fs.realpathSync(planPath)).split(path.sep).join('/');
}

export function findUnplannedPaths(tasks, paths) {
  const declared = tasks.flatMap((task) => task.files.map((file) => file.path));
  return paths.filter((path) => !isCovered(declared, path) && !coversCompanion(declared, path));
}

function isTrailerlessFix({ subject, body }) {
  return /^fix(\([^)]*\))?!?:/.test(subject) && !/^Plan-task: /m.test(body);
}

function isLeadChangelog({ subject, body }) {
  return /^docs\(changelog\):/.test(subject) && !/^Plan-task: /m.test(body);
}

export function splitFixOnlyPaths(paths, commitsByPath) {
  const unplanned = [];
  const fixOnly = [];
  const lead = [];
  for (const path of paths) {
    const commits = commitsByPath.get(path) ?? [];
    const shas = commits.map((commit) => commit.sha.slice(0, 7));
    if (commits.length > 0 && commits.every(isTrailerlessFix)) fixOnly.push({ path, shas });
    else if (path === 'CHANGELOG.md' && commits.length > 0 && commits.every(isLeadChangelog)) lead.push({ path, shas });
    else unplanned.push(path);
  }
  return { unplanned, fixOnly, lead };
}

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

function testLineHits({ file, line, pattern, at }) {
  if (file === null || !isTestPath(file) || !pattern.test(line)) return [];
  return [{ file, at, text: line.slice(1).trim() }];
}

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
      removed.push(...testLineHits({ file, line, pattern: REMOVED_ASSERTION, at: oldLine }));
      oldLeft -= 1;
      oldLine += 1;
    } else if (newLeft > 0 && line.startsWith('+')) {
      added.add(line.slice(1).trim());
      skips.push(...testLineHits({ file, line, pattern: ADDED_SKIP, at: newLine }));
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

function testRepairCommit(task, root, base) {
  const listedTests = task.files.map((file) => file.path).filter(isTestPath);
  return [...commitsTouching(listedTests, root, base).values()].flat().find(isTrailerlessFix);
}

function claimLines(task, { root, planId, base }) {
  const changed = taskPaths(task, root, planId);
  const lines = [];
  if (isTestFirst(task) && !changed.some(isTestPath)) {
    const repair = testRepairCommit(task, root, base);
    lines.push(repair === undefined
      ? `FAIL claims-diff Task ${task.number} (test-first, but its commit adds or changes no test file)`
      : `WARN claims-diff Task ${task.number} (test-first; its test changed only in repair commit ${repair.sha.slice(0, 7)})`);
  }
  return lines;
}

const DEFECT_KINDS = { removed: 'removed assertion', added: 'added skip', silenced: 'silenced check' };

function defectLine(finding) {
  const [, where, kind, text] = /^(.+?:\d+) (removed|added|silenced) (.*)$/.exec(finding);
  return `${where}; defect; ${DEFECT_KINDS[kind]}; ${text}; report`;
}

function testDefectLines(task, { root, planId }) {
  const show = (...args) => execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'show', '--format=', '--no-renames', ...args], { encoding: 'utf8', maxBuffer: Infinity });
  return taskCommits(task, root, planId).flatMap((sha) => {
    const patch = show('-U0', '--no-color', '--no-ext-diff', sha);
    const deleted = show('--name-status', sha).split('\n').flatMap((line) => (line.startsWith('D\t') ? [line.slice(2)] : [])).filter(isTestPath);
    const inDeleted = (finding) => deleted.some((file) => finding.startsWith(`${file}:`));
    return [
      ...deleted.map((file) => `${file}:1; defect; deleted test file; ${file}; report`),
      ...[...weakenedTests(patch), ...silencedChecks(patch)].filter((finding) => !inDeleted(finding)).map(defectLine)
    ];
  });
}

export function codeRulesReport(fails, root, defects = []) {
  const entries = fails.flatMap((finding) => {
    const at = /^(.+?):(\d+) /.exec(finding);
    if (at === null) return [];
    const source = fs.readFileSync(path.join(root, at[1]), 'utf8').split('\n')[Number(at[2]) - 1]?.trim() ?? '';
    if (source === '') return [];
    return [`${finding} defect fix`, `  Probe: ! grep -nF -- '${source.replace(/'/g, "'\\''")}' ${at[1]}`];
  });
  return ['FINDINGS', '', ...entries, ...defects, ''].join('\n');
}

function codeRuleLines(plan, landed, { root, planId, base }) {
  if (base === undefined) return [];
  const reportPath = path.join(path.resolve(root), '.exo', 'code-rules.md');
  fs.rmSync(reportPath, { force: true });
  const fails = new Set();
  const defects = new Set();
  const lines = [];
  for (const task of plan.tasks.filter((entry) => landed.has(entry.number))) {
    testDefectLines(task, { root, planId }).forEach((line) => defects.add(line));
    const found = codeRuleFindings({ root, base, paths: taskPaths(task, root, planId) });
    found.fails.forEach((finding) => fails.add(finding));
    lines.push(...found.warns.map((warn) => `WARN code-rules Task ${task.number} (${warn})`));
  }
  if (fails.size === 0 && defects.size === 0) return lines;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, codeRulesReport([...fails], root, [...defects]));
  return [...lines, `CODE-RULES ${reportPath}`];
}

function namesPath(line, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.-])${escaped}(?![\\w-]|\\.\\w)`).test(line);
}

export function unlandedBlame(tasks, landed, output) {
  const blaming = output.split(/\r?\n/).filter((line) => !PASS_REPORT_LINE.test(line));
  const names = (line, task) => task.files.some((file) => namesPath(line, file.path));
  const open = tasks.filter((task) => !landed.has(task.number));
  if (tasks.some((task) => landed.has(task.number) && blaming.some((line) => names(line, task)))) return [];
  if (blaming.some((line) => FAIL_REPORT_LINE.test(line) && !open.some((task) => names(line, task)))) return [];
  return open.filter((task) => blaming.some((line) => names(line, task))).map((task) => task.number);
}

export function taskStates(tasks, landed) {
  return tasks.map((task) => ({ task: task.number, title: task.title, done: landed.has(task.number) }));
}

export function manualChecks(frame) {
  const section = frame['Manual checks'] ?? '';
  return section.split('\n').filter((line) => line.trim().startsWith('- ')).map((line) => line.trim().slice(2));
}

function runCommand(command, timeoutMs, env = process.env) {
  return new Promise((resolve) => {
    const started = Date.now();
    // why: a detached child leads its own process group, which Windows does not support.
    const child = spawn(command, { shell: true, env, detached: process.platform !== 'win32' });
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

function failReason({ code, signal, timedOutMs }) {
  if (timedOutMs !== undefined) return `timed out after ${timedOutMs / 1000}s`;
  if (signal !== null) return `signal ${signal}`;
  return typeof code === 'number' ? `exit ${code}` : `spawn error ${code}`;
}

export function outputTail(output) {
  return output.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-FAIL_TAIL_LINES).map((line) => `  ${line.slice(0, FAIL_TAIL_LINE_LENGTH)}`);
}

function failLines(check, reason, output) {
  return [`FAIL ${check} (${reason})`, ...outputTail(output)];
}

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

function reviewLines(plan, landed, { root, planId, base }) {
  const lines = [];
  const route = planRoute(plan.tasks).route;
  const reviewers = plan.tasks.filter((entry) => landed.has(entry.number))
    .map((task) => taskReviewer(task, taskPaths(task, root, planId), route, taskDiffOf(task, root, planId)));
  if (reviewers.length > 0) {
    const reviewer = reviewers.find((entry) => entry === REVIEWER_AGENTS.deep) ?? reviewers.find((entry) => !entry.startsWith('none')) ?? reviewers[0];
    const range = `${base ?? DEFAULT_BASE}..HEAD`;
    lines.push(cachedPass(root, BRANCH_REVIEW_KEY) === null ? `REVIEW Branch ${range}: ${reviewer}` : `REVIEW Branch ${range}: none (reviewed on this same tree)`);
  }
  lines.push(...(base === undefined ? ['OVERLAP none'] : formatOverlaps(findOverlaps(readChanges(base, root))).split('\n')));
  return lines;
}

function taskOwners(plan, landed, { root, planId }) {
  const owners = new Map();
  for (const task of plan.tasks.filter((entry) => landed.has(entry.number))) {
    for (const file of taskPaths(task, root, planId)) if (!owners.has(file)) owners.set(file, task.number);
  }
  return owners;
}

export async function runGate(planText, { planPath, checkCommand, root = process.cwd(), base, invocation = commandLine(process.argv), reviewsOnly = false } = {}) {
  const plan = parsePlan(planText);
  const frame = frameOf(plan.frame);
  const planId = planIdOf(planPath);
  const landed = new Set(landedTasks(plan.tasks, root, planId));
  if (reviewsOnly) {
    const printed = reviewLines(plan, landed, { root, planId, base });
    const checkout = path.resolve(root);
    const range = { base: base ?? DEFAULT_BASE, head: 'HEAD' };
    const taskOf = taskOwners(plan, landed, { root, planId });
    recordRepairPasses(checkout, 0);
    const shards = writeReviewInput(frame, { checkout, ...range, redSection: redLines(plan, landed, { checkout, planId }), boundaries: boundaryLines(plan, landed), taskOf });
    return { lines: [...printed, ...dispatchLines(printed, { root, planPath, ...range, shards }), ...reviewedState(checkout)], failed: false };
  }
  const lines = [];
  let failed = false;
  const landGateNone = frame.landGate === 'none' ? 'none' : null;
  const scripts = packageScripts(root);
  const namedGate = checkCommand ?? criterionCommand(frame.successCriterion) ?? landGateNone;
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
    const mcpCall = mcpToolCall(command);
    const check = mcpCall ?? command;
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

  const gateRuns = !gateSkipped && gateMcpCall === null && cachedPass(root, gateCommand) === null;
  const [proofResults, gateRun] = await Promise.all([
    mapLimited(proofRuns, PROOF_CONCURRENCY, (run) => (run.line ? null : runCommand(run.command, environmentMs('EXO_PROOF_TIMEOUT_MS', PROOF_TIMEOUT_MS)))),
    gateRuns ? runCommand(gateCommand, environmentMs('EXO_GATE_TIMEOUT_MS', GATE_TIMEOUT_MS)) : null
  ]);
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
  } else if (!gateRuns) {
    lines.push('SKIP success-criterion (passed on this same tree)');
  } else {
    if (successCriterionPasses(gateRun)) recordPass(root, gateCommand, gateRun.ms);
    if (successCriterionPasses(gateRun) && testScriptGate) {
      lines.push(TEST_SCRIPT_PASS);
      if (!packageHasEntryPoint(root)) lines.push(`Proof: \`${invocation}\` -> ${TEST_SCRIPT_PASS}`);
    } else if (successCriterionPasses(gateRun)) {
      lines.push('PASS success-criterion');
    } else {
      const reason = gateRun.ok ? summaryLine(gateRun.output) : failReason(gateRun);
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
  const planFile = repoPathOf(planPath, root);
  const undeclared = findUnplannedPaths(plan.tasks, changed.filter((changedPath) => changedPath !== planFile));
  const split = splitFixOnlyPaths(undeclared, commitsTouching(undeclared, root, base));
  const { fixOnly, lead } = split;
  const docs = split.unplanned.filter(isPlanDoc);
  const unplanned = split.unplanned.filter((candidate) => !isPlanDoc(candidate));
  if (unplanned.length === 0) {
    lines.push('PASS unplanned-paths');
  } else {
    for (const path of unplanned) lines.push(`UNPLANNED ${path}`);
    failed = true;
  }
  for (const path of docs) lines.push(`DOCS ${path}`);
  for (const { path, shas } of [...fixOnly].sort((a, b) => (a.path < b.path ? -1 : 1))) lines.push(`FIX-ONLY ${path} (${shas.join(',')})`);
  for (const { path, shas } of lead) lines.push(`LEAD ${path} (${shas.join(',')})`);

  const claims = plan.tasks.filter((task) => landed.has(task.number)).flatMap((task) => claimLines(task, { root, planId, base }));
  lines.push(...(claims.length === 0 ? ['PASS claims-diff'] : claims));
  if (claims.some((line) => line.startsWith('FAIL '))) failed = true;

  lines.push(...codeRuleLines(plan, landed, { root, planId, base }));
  lines.push(...reviewLines(plan, landed, { root, planId, base }));
  for (const { task, title, done } of taskStates(plan.tasks, landed)) lines.push(`${done ? 'DONE' : 'OPEN'} Task ${task}: ${title}`);
  for (const check of manualChecks(plan.frame)) lines.push(`MANUAL ${check}`);
  return { lines, failed };
}

function contextSection(planPath, root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    let since;
    try {
      since = Number(git('log', '--diff-filter=A', '--format=%ct', '--', planPath).split('\n').filter(Boolean).pop()) * 1000;
    } catch { }
    if (!Number.isFinite(since) || since <= 0) since = fs.statSync(planPath).mtimeMs;
    const main = path.dirname(path.resolve(root, git('rev-parse', '--git-common-dir')));
    const folders = new Set([fs.realpathSync(main), fs.realpathSync(root)]);
    const rows = [...folders].flatMap((folder) => contextPeaks({ folder: transcriptFolder(folder), since }));
    rows.sort((a, b) => b.peak - a.peak);
    const limit = contextLimit();
    return rows.map(({ label, peak }) => `- ${label}: ${Math.round(peak / 1000)}k${peak >= limit ? ` (over ${Math.round(limit / 1000)}k)` : ''}`);
  } catch (error) {
    return [`- not read: ${error.message.split('\n')[0]}`];
  }
}

function writeRunReport(lines, { planPath, planText, root }) {
  const manual = lines.filter((line) => line.startsWith('MANUAL '));
  const checks = lines.filter((line) => !line.startsWith('MANUAL '));
  const reportPath = path.join(root, '.exo', 'run-report.md');
  const text = [
    '## Proofs', proofsReport({ planPath, planText, root }).trimEnd(), '',
    '## Checks', ...checks, '',
    '## Context', ...contextSection(planPath, root), '',
    '## Manual checks', ...manual.map((line) => `- ${line.slice('MANUAL '.length)}`), ''
  ].join('\n');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, text);
  return reportPath;
}

function resolvedArgs(flags, planPath, root) {
  const named = { ...flags, plan: planPath, root };
  return Object.entries(named).flatMap(([name, value]) => {
    if (value === undefined || value === false) return [];
    return value === true ? [`--${name}`] : [`--${name}`, value];
  });
}

async function printRepair(flags, root, { planPath, planText }) {
  for (const name of ['pre-fix-sha', 'findings', 'findings-sha256']) {
    if (flags[name] === undefined) throw new UsageError(`flag '--${name}' is required with --repair`);
  }
  const lines = await repairLines({ root, planText, planPath, preFixSha: flags['pre-fix-sha'], findings: path.resolve(flags.findings), findingsSha256: flags['findings-sha256'] });
  process.stdout.write(`${lines.join('\n')}\n`);
  if (lines.some((line) => /^(?:FAIL|STOP) /.test(line))) process.exitCode = 1;
}

async function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', 'check-command': 'value', 'reviews-only': 'boolean', repair: 'boolean', 'pre-fix-sha': 'value', findings: 'value', 'findings-sha256': 'value' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  const planPath = path.resolve(flags.plan);
  const planText = fs.readFileSync(planPath, 'utf8');
  const root = flags.root === undefined ? undefined : path.resolve(flags.root);
  if (root !== undefined) process.chdir(root);
  const hosting = selfHostPlan({ root: root ?? process.cwd(), base: flags.base, running: fs.realpathSync(fileURLToPath(import.meta.url)) });
  if (hosting.reexec !== null) {
    process.exitCode = spawnSync(process.execPath, [hosting.reexec, ...resolvedArgs(flags, planPath, root)], { stdio: 'inherit' }).status ?? 1;
    return;
  }
  if (flags.repair === true) return printRepair(flags, root ?? process.cwd(), { planPath, planText });
  const gate = await runGate(planText, { planPath, checkCommand: flags['check-command'], root, base: flags.base, reviewsOnly: flags['reviews-only'] === true });
  const lines = hosting.note === null ? gate.lines : [hosting.note, ...gate.lines];
  const failed = gate.failed;
  process.stdout.write(`${lines.join('\n')}\n`);
  if (flags['reviews-only']) return;
  const reportPath = writeRunReport(lines, { planPath, planText, root: path.resolve('.') });
  process.stdout.write(`REPORT ${reportPath}\n`);
  if (failed) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`gate: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
