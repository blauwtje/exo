#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs, parseFlags, UsageError, isMain } from '#script-flags';
import { criterionCommand, frameOf, isCovered, isPlanDoc, landedTasks, parsePlan, planIdOf, planRoute, taskCommits } from '#plan-tasks';
import { killTree } from '#process-tree';
import { BRANCH_REVIEW_KEY, cachedPass, recordPass } from '#check-cache';
import { changedPaths } from '#size-facts';
import { codeRuleFindings } from '#code-rules';
import { proofsReport } from '#proofs-report';
import { transcriptFolder } from '#confine-claude';
import { contextPeaks, HARD_LIMIT } from '#context-limits';
import { mcpToolCall } from '#mcp-tool-call';
import { packageHasEntryPoint } from '#package-entry-point';
import { isTestPath } from '#red-green';
import { REVIEWER_AGENTS, taskDiffOf, taskPaths, taskReviewer } from './pick-reviewer.mjs';
import { findOverlaps, formatOverlaps, readChanges } from './review-overlap.mjs';

const USAGE = `Usage: node verify.mjs --plan <path> [--root <checkout>] [--base <ref>] [--check-command <cmd>] [--reviews-only]
Runs a plan's gate: each landed task's Proof, the Success criterion command and a stray-path check.
Prints one PASS, FAIL, WARN, SKIP, SESSION, UNRUN, STRAY or FIX-ONLY line per check,
then one REVIEW Branch line and the OVERLAP lines, one DONE or OPEN line per task,
one MANUAL line per manual check and a last REPORT <root>/.exo/run-report.md line.
--reviews-only prints only the REVIEW and OVERLAP lines and runs no proof or gate.
--base also checks the lines each task added against the code rules, into <root>/.exo/code-rules.md.
Exits 1 on any FAIL or STRAY line.`;
const SUMMARY_LINE = /^SUMMARY [^\r\n]*/gm;
const CLEAN_SUMMARY = / FAIL=0 WARN=0 UNRUN=0\b/;
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
// why: a shell reads a backtick pair as command substitution, so a Proof with one is prose, not a command.
const PROSE_PROOF = /`/;
const SNAKE_CASE_WORD = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
// why: a POSIX shell returns 127 for a command it cannot find.
const COMMAND_NOT_FOUND = 127;
const REMOVED_ASSERTION = /expect\(|assert/;
const ADDED_SKIP = /\.(?:skip|only)\b/;
const SILENCER = /eslint-disable|@ts-(?:ignore|nocheck|expect-error)|#\s*(?:noqa|type:\s*ignore|pylint:\s*disable)|\/\/\s*nolint|biome-ignore|(?:istanbul|c8) ignore/;
const PROSE_FILE = /\.(?:md|mdx|txt|rst)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = /^(?:---|\+\+\+) (?:[ab]\/)?(.*)$/;
const WARN_TEXT_LENGTH = 100;

export function runnableProof(proof) {
  if (proof === null || PROSE_PROOF.test(proof)) return null;
  return proof;
}

export function unmarkedMcpTool(command, { code, output }) {
  if (code !== COMMAND_NOT_FOUND) return null;
  const word = command.split(/\s/, 1)[0];
  if (!SNAKE_CASE_WORD.test(word)) return null;
  return new RegExp(`\\b${word}: (?:command )?not found`).test(output) ? word : null;
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

export function findStrayPaths(tasks, paths) {
  const declared = tasks.flatMap((task) => task.files.map((file) => file.path));
  return paths.filter((path) => !isCovered(declared, path));
}

function isTrailerlessFix({ subject, body }) {
  return /^fix(\([^)]*\))?!?:/.test(subject) && !/^Plan-task: /m.test(body);
}

function isLeadChangelog({ subject, body }) {
  return /^docs\(changelog\):/.test(subject) && !/^Plan-task: /m.test(body);
}

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

export function unchangedFiles(files, changed) {
  return files.map((file) => file.path.replace(/^\.\//, '')).filter((wanted) => {
    if (wanted.includes('*')) return !changed.some((path) => globMatches(wanted, path));
    if (wanted.endsWith('/')) return !changed.some((path) => path.startsWith(wanted));
    return !changed.includes(wanted);
  });
}

export function isTestFirst(task) {
  return task.risk !== null || (/^fix\b/.test(task.title) && task.files.some((file) => isTestPath(file.path)));
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

function claimLines(task, root, planId) {
  const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'show', '--format=', '--no-renames', ...args], { encoding: 'utf8', maxBuffer: Infinity });
  const shas = taskCommits(task, root, planId);
  const changed = taskPaths(task, root, planId);
  const lines = [];
  const unchanged = unchangedFiles(task.files, changed);
  if (unchanged.length > 0) lines.push(`WARN claims-diff Task ${task.number} (Files: unchanged in its commit: ${unchanged.join(', ')})`);
  if (isTestFirst(task) && !changed.some(isTestPath)) {
    lines.push(`FAIL claims-diff Task ${task.number} (test-first, but its commit adds or changes no test file)`);
  }
  for (const sha of shas) {
    const patch = git('-U0', '--no-color', '--no-ext-diff', sha);
    for (const finding of [...weakenedTests(patch), ...silencedChecks(patch)]) lines.push(`WARN claims-diff Task ${task.number} (${finding})`);
  }
  return lines;
}

export function codeRulesReport(fails, root) {
  const entries = fails.flatMap((finding) => {
    const at = /^(.+?):(\d+) /.exec(finding);
    if (at === null) return [];
    const source = fs.readFileSync(path.join(root, at[1]), 'utf8').split('\n')[Number(at[2]) - 1]?.trim() ?? '';
    if (source === '') return [];
    return [`${finding} defect fix`, `  Probe: ! grep -nF -- '${source.replace(/'/g, "'\\''")}' ${at[1]}`];
  });
  return ['FINDINGS', '', ...entries, ''].join('\n');
}

function codeRuleLines(plan, landed, { root, planId, base }) {
  if (base === undefined) return [];
  const reportPath = path.join(path.resolve(root), '.exo', 'code-rules.md');
  fs.rmSync(reportPath, { force: true });
  const fails = new Set();
  const lines = [];
  for (const task of plan.tasks.filter((entry) => landed.has(entry.number))) {
    const found = codeRuleFindings({ root, base, paths: taskPaths(task, root, planId) });
    found.fails.forEach((finding) => fails.add(finding));
    lines.push(...found.warns.map((warn) => `WARN code-rules Task ${task.number} (${warn})`));
  }
  if (fails.size === 0) return lines;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, codeRulesReport([...fails], root));
  return [...lines, `CODE-RULES ${reportPath}`];
}

export function summaryLine(output) {
  return output.match(SUMMARY_LINE)?.at(-1) ?? null;
}

export function successCriterionPasses({ ok, output }) {
  const summary = summaryLine(output);
  return ok && (summary === null || CLEAN_SUMMARY.test(summary));
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

function runCommand(command, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    // why: a detached child leads its own process group, which Windows does not support.
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

export async function runGate(planText, { planPath, checkCommand, root = process.cwd(), base, invocation = commandLine(process.argv), reviewsOnly = false } = {}) {
  const plan = parsePlan(planText);
  const frame = frameOf(plan.frame);
  const planId = planIdOf(planPath);
  const landed = new Set(landedTasks(plan.tasks, root, planId));
  if (reviewsOnly) return { lines: reviewLines(plan, landed, { root, planId, base }), failed: false };
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
  const undeclared = findStrayPaths(plan.tasks, changed.filter((changedPath) => changedPath !== planFile));
  const split = splitFixOnlyPaths(undeclared, commitsTouching(undeclared, root, base));
  const { fixOnly, lead } = split;
  const docs = split.strays.filter(isPlanDoc);
  const strays = split.strays.filter((stray) => !isPlanDoc(stray));
  if (strays.length === 0) {
    lines.push('PASS stray-paths');
  } else {
    for (const path of strays) lines.push(`STRAY ${path}`);
    failed = true;
  }
  for (const path of docs) lines.push(`DOCS ${path}`);
  for (const { path, shas } of [...fixOnly].sort((a, b) => (a.path < b.path ? -1 : 1))) lines.push(`FIX-ONLY ${path} (${shas.join(',')})`);
  for (const { path, shas } of lead) lines.push(`LEAD ${path} (${shas.join(',')})`);

  const claims = plan.tasks.filter((task) => landed.has(task.number)).flatMap((task) => claimLines(task, root, planId));
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
    return rows.map(({ label, peak }) => `- ${label}: ${Math.round(peak / 1000)}k${peak >= HARD_LIMIT ? ' (over 100k)' : ''}`);
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

async function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', 'check-command': 'value', 'reviews-only': 'boolean' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' needs a path");
  const planPath = path.resolve(flags.plan);
  const planText = fs.readFileSync(planPath, 'utf8');
  const root = flags.root === undefined ? undefined : path.resolve(flags.root);
  if (root !== undefined) process.chdir(root);
  const { lines, failed } = await runGate(planText, { planPath, checkCommand: flags['check-command'], root, base: flags.base, reviewsOnly: flags['reviews-only'] === true });
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
      process.stderr.write(`verify: ${error.message}\n`);
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
