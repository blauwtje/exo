#!/usr/bin/env node
// The shipping route as one script, so the picked route runs push, open a
// pull request, or wait, gate and merge one, without a separate model call
// per step. It calls its sibling scripts as child processes rather than
// reimplement their contracts.
//
//   node ship.mjs --route push|open-pr|pr-merge [--title <subject>]
//                 [--body <file>] [--issue <n>] [--method squash|merge|rebase]
//
// open-pr and pr-merge need --title and --body, and refuse to run on the
// default branch. Each step prints `ship: <step> [#<n>]` on stderr as it
// starts; stdout carries only the one result line a route ends on.
//
// Steps run in order, stopping at the first that fails: body check, push,
// create, wait, gate, merge, confirm. Once a pull request is known, a stop
// names it instead of the branch. A stop exits 1, except a gate verdict of
// DIRTY, which exits 4; a usage error exits 2.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UsageError, parseFlags } from '#script-flags';

export const USAGE_EXIT = 2;
export const DIRTY_EXIT = 4;
const ROUTES = new Set(['push', 'open-pr', 'pr-merge']);
const METHODS = new Set(['squash', 'merge', 'rebase']);
const MAX_BEHIND_UPDATES = 2;
const WAIT_CHECKS = fileURLToPath(new URL('./wait-checks.mjs', import.meta.url));
const SHIP_GATE = fileURLToPath(new URL('./ship-gate.mjs', import.meta.url));

class StepError extends Error {
  // `subject` overrides the branch name a stop line opens with, once a step
  // has a pull request of its own to name instead; DIRTY outranks a plain stop.
  constructor(step, reason, { subject, code = 1 } = {}) {
    super(reason);
    this.step = step;
    this.subject = subject;
    this.code = code;
  }
}

function announce(step, number) {
  process.stderr.write(`ship: ${step}${number === undefined ? '' : ` #${number}`}\n`);
}

function readFlags(argv) {
  const flags = parseFlags(argv, { route: 'value', title: 'value', body: 'value', issue: 'value', method: 'value' });
  if (!flags.route) throw new UsageError('needs --route <push|open-pr|pr-merge>');
  if (!ROUTES.has(flags.route)) throw new UsageError(`unknown route '${flags.route}'`);
  if (flags.route !== 'push' && (!flags.title || !flags.body)) {
    throw new UsageError(`route '${flags.route}' needs --title and --body`);
  }
  if (flags.issue !== undefined && !flags.body) throw new UsageError('--issue needs --body');
  if (flags.method !== undefined && !METHODS.has(flags.method)) throw new UsageError(`unknown method '${flags.method}'`);
  return flags;
}

/** `<name>` with the `origin/` remote stripped, or null when no remote HEAD is set. */
function defaultBranch() {
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return ref.replace(/^origin\//, '');
  } catch {
    return null;
  }
}

function currentBranch() {
  return execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
}

function firstLine(text) {
  return (text.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim();
}

function runGit(args) {
  try {
    return { ok: true, stdout: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, error: firstLine(`${error.stderr ?? ''}`) };
  }
}

function runGh(args) {
  try {
    return { ok: true, stdout: execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { ok: false, error: firstLine(`${error.stderr ?? ''}`) };
  }
}

/** True when `body` closes `issue` in the vocabulary GitHub links a pull request on. */
function closesIssue(body, issue) {
  return new RegExp(`(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${issue}\\b`, 'i').test(body);
}

/** The branch's open pull request, read fresh so a rerun after a resolved stop gates again. */
function existingPullRequest(branch) {
  const result = runGh(['pr', 'view', branch, '--json', 'number,url,state']);
  if (!result.ok) return null;
  const pullRequest = JSON.parse(result.stdout);
  return pullRequest.state === 'OPEN' ? pullRequest : null;
}

/** Labels, milestone and project titles copied from the issue a pull request closes. */
function issueFields(issue) {
  const result = runGh(['issue', 'view', String(issue), '--json', 'labels,milestone,projectItems']);
  if (!result.ok) throw new StepError('create', `gh=${result.error}`);
  const data = JSON.parse(result.stdout);
  return {
    labels: (data.labels ?? []).map((label) => label.name),
    milestone: data.milestone?.title,
    projects: (data.projectItems ?? []).map((item) => item.title).filter(Boolean)
  };
}

function createPullRequest(branch, base, flags) {
  const fields = flags.issue !== undefined ? issueFields(flags.issue) : { labels: [], milestone: undefined, projects: [] };
  const args = ['pr', 'create', '--base', base, '--head', branch, '--title', flags.title, '--body-file', flags.body];
  for (const label of fields.labels) args.push('--label', label);
  if (fields.milestone) args.push('--milestone', fields.milestone);
  for (const project of fields.projects) args.push('--project', project);
  const result = runGh(args);
  if (!result.ok) throw new StepError('create', `gh=${result.error}`);
  const url = firstLine(result.stdout);
  const number = Number(url.match(/\/pull\/(\d+)/)?.[1]);
  return { number, url };
}

/** Runs a sibling script as a child process and reads its one stdout line and exit code. */
function runSibling(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  return { code: result.status ?? 1, line: firstLine(result.stdout ?? '') };
}

function waitForChecks(number, url) {
  announce('wait', number);
  const result = runSibling(WAIT_CHECKS, ['--pr', String(number)]);
  if (result.code === 0) return; // "checks: pass" or "checks: none"
  throw new StepError('wait', result.line.replace(/^checks:\s*/, ''), { subject: url });
}

/** One gate read, MERGE, BEHIND, DIRTY or STOP <x>, exactly as ship-gate.mjs prints it. */
function gateOnce(number) {
  return runSibling(SHIP_GATE, ['--pr', String(number)]).line;
}

/** Gates `number`, updating a BEHIND branch and gating again, at most twice, then stopping. */
function runGate(number, url) {
  announce('gate', number);
  let verdict = gateOnce(number);
  let updates = 0;
  while (verdict === 'BEHIND' && updates < MAX_BEHIND_UPDATES) {
    const update = runGh(['pr', 'update-branch', String(number)]);
    if (!update.ok) throw new StepError('gate', `gh=${update.error}`, { subject: url });
    updates += 1;
    waitForChecks(number, url);
    announce('gate', number);
    verdict = gateOnce(number);
  }
  if (verdict === 'MERGE') return;
  if (verdict === 'DIRTY') throw new StepError('gate', 'DIRTY', { subject: url, code: DIRTY_EXIT });
  const reason = verdict.startsWith('STOP ') ? verdict.slice('STOP '.length) : verdict;
  throw new StepError('gate', reason, { subject: url });
}

function mergePullRequest(number, method, url) {
  announce('merge', number);
  const result = runGh(['pr', 'merge', String(number), `--${method}`]);
  if (!result.ok) throw new StepError('merge', result.error, { subject: url });
}

function confirmMerge(number, url) {
  announce('confirm', number);
  const result = runGh(['pr', 'view', String(number), '--json', 'state,mergedAt,url']);
  if (!result.ok) throw new StepError('confirm', `gh=${result.error}`, { subject: url });
  const data = JSON.parse(result.stdout);
  if (data.state !== 'MERGED') throw new StepError('confirm', `state=${data.state}`, { subject: url });
  return `${data.url} merged`;
}

function run(flags, branch, base) {
  if (flags.issue !== undefined) {
    announce('create', flags.issue);
    const body = fs.readFileSync(flags.body, 'utf8');
    if (!closesIssue(body, flags.issue)) throw new StepError('create', `body-missing-closes-${flags.issue}`);
  }

  announce('push');
  if (base === null) throw new StepError('push', 'default-branch=unknown');
  const push = runGit(branch === base ? ['push', '--follow-tags'] : ['push', '-u', 'origin', branch]);
  if (!push.ok) throw new StepError('push', push.error);
  if (flags.route === 'push') return `${branch} pushed`;

  announce('create', flags.issue);
  const pullRequest = existingPullRequest(branch) ?? createPullRequest(branch, base, flags);
  if (flags.route === 'open-pr') return `${pullRequest.url} open`;

  const method = flags.method ?? 'squash';
  waitForChecks(pullRequest.number, pullRequest.url);
  runGate(pullRequest.number, pullRequest.url);
  mergePullRequest(pullRequest.number, method, pullRequest.url);
  return confirmMerge(pullRequest.number, pullRequest.url);
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: ship.mjs --route <push|open-pr|pr-merge> [--title <t>] [--body <f>] [--issue <n>] [--method <m>]: ${error.message}`);
    process.exitCode = USAGE_EXIT;
    return;
  }

  const branch = currentBranch();
  const base = defaultBranch();
  if (flags.route !== 'push' && base !== null && branch === base) {
    console.error(`usage: ship.mjs: route '${flags.route}' refuses to run on the default branch '${base}'`);
    process.exitCode = USAGE_EXIT;
    return;
  }

  try {
    console.log(run(flags, branch, base));
    process.exitCode = 0;
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    console.log(`${error.subject ?? branch} stopped ${error.step} ${error.message}`);
    process.exitCode = error.code;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}
