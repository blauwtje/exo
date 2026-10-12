#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { UsageError, parseFlags, isMain } from '#script-flags';
import { settingValue } from '#settings-store';
import { inRun, recordDecision } from '#run-decision';
import { attributionProblem, branchNameProblem, subjectProblem } from '#commit-text';
import { returnToDefault } from './return-to-default.mjs';

export const USAGE_EXIT = 2;
export const DIRTY_EXIT = 4;
const ROUTES = new Set(['push', 'open-pr', 'pr-merge']);
const METHODS = new Set(['squash', 'merge', 'rebase']);
const MAX_BEHIND_UPDATES = 2;
const PR_NUMBER = /^[1-9][0-9]*$/;
const WAIT_CHECKS = fileURLToPath(new URL('./wait-checks.mjs', import.meta.url));
const SHIP_GATE = fileURLToPath(new URL('./ship-gate.mjs', import.meta.url));

class StepError extends Error {
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
  if (argv.includes('--routes')) {
    if (argv.length !== 1) throw new UsageError('--routes takes no other arguments');
    return { routes: true };
  }
  const verdictAt = argv.indexOf('--verdict-current');
  if (verdictAt !== -1) {
    const patchId = argv[verdictAt + 1];
    if (argv.length !== 2 || !patchId) throw new UsageError('--verdict-current needs one patch-id');
    return { verdictCurrent: patchId };
  }
  const mergeAt = argv.indexOf('--merge');
  if (mergeAt !== -1) {
    const numbers = argv.slice(mergeAt + 1);
    if (argv.slice(0, mergeAt).length > 0 || numbers.length === 0 || !numbers.every((number) => PR_NUMBER.test(number))) {
      throw new UsageError('--merge needs one or more pull request numbers, and does not combine with other flags');
    }
    return { merge: numbers };
  }
  const flags = parseFlags(argv, { route: 'value', title: 'value', body: 'value', issue: 'value', method: 'value' });
  if (!flags.route) throw new UsageError('needs --route <push|open-pr|pr-merge>');
  if (!ROUTES.has(flags.route)) throw new UsageError(`unknown route '${flags.route}'`);
  if (flags.route !== 'push' && (!flags.title || !flags.body)) {
    throw new UsageError(`route '${flags.route}' needs --title and --body`);
  }
  if (flags.issue !== undefined && !flags.body) throw new UsageError('--issue needs --body');
  if (flags.issue !== undefined && !/^\d+$/.test(flags.issue)) throw new UsageError('--issue needs a number');
  if (flags.method !== undefined && !METHODS.has(flags.method)) throw new UsageError(`unknown method '${flags.method}'`);
  return flags;
}

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

function hasOrigin() {
  return runGit(['remote', 'get-url', 'origin']).ok;
}

function inWorktree() {
  const gitDir = runGit(['rev-parse', '--git-dir']);
  const commonDir = runGit(['rev-parse', '--git-common-dir']);
  if (!gitDir.ok || !commonDir.ok) return false;
  return path.resolve(gitDir.stdout.trim()) !== path.resolve(commonDir.stdout.trim());
}

function ghAuthOk() {
  return runGh(['auth', 'status']).ok;
}

const CONTEXT = 'Your new commits are only on this computer.';
const MENU_FULL = [
  '**Where should the commits go?**',
  CONTEXT,
  '',
  '- **(A) Push and merge**: merge on GitHub once tests pass.',
  '- **(B) Open PR**: GitHub review; you merge.',
  '- **(C) Keep local**: nothing leaves this computer.',
  '',
  'Recommended: (A), because it merges only after tests pass.'
];
const MENU_PUSH_ONLY = [
  '**Where should the commits go?**',
  CONTEXT,
  '',
  '- **(A) Push**: send the commits to GitHub.',
  '- **(B) Keep local**: nothing leaves this computer.',
  '',
  'Recommended: (A), because it backs the commits up.'
];

function setRouteBlocked(onDefault, ghOk) {
  if (onDefault) return 'on the default branch';
  if (!ghOk) return 'gh auth status failed';
  return null;
}

function unaskedLine() {
  if (settingValue('ship') !== 'ask' || !hasOrigin() || inRun()) return 'Unasked: none';
  const base = defaultBranch();
  const branch = currentBranch();
  return base !== null && branch !== '' && branch !== base ? 'Unasked: push' : 'Unasked: none';
}

function printRoutes() {
  printRouteMenu();
  console.log(unaskedLine());
}

function printRouteMenu() {
  const setting = settingValue('ship');
  if (setting === 'local') {
    console.log('route: local (set)');
    return;
  }
  if (!hasOrigin()) {
    console.log('no origin remote; no route can run');
    return;
  }
  const base = defaultBranch();
  if (base === null) {
    if (setting === 'push') {
      console.log('route: push (set)');
      return;
    }
    if (setting !== 'ask') console.log(`ship=${setting} cannot run: default branch unknown`);
    printMenu(MENU_PUSH_ONLY, setting === 'ask');
    return;
  }
  const onDefault = currentBranch() === base && !inWorktree();
  const ghOk = ghAuthOk();
  if (setting !== 'ask') {
    const blocked = setting === 'push' ? null : setRouteBlocked(onDefault, ghOk);
    if (blocked === null) {
      console.log(`route: ${setting} (set)`);
      return;
    }
    console.log(`ship=${setting} cannot run: ${blocked}`);
  }
  printMenu(!onDefault && ghOk ? MENU_FULL : MENU_PUSH_ONLY, setting === 'ask');
}

function printMenu(menu, asked) {
  if (asked && inRun()) {
    recordDecision('ship', 'local', 'a run never asks which route ships');
    console.log('route: local (run)');
    return;
  }
  for (const line of menu) console.log(line);
}

function currentPatchId() {
  const base = defaultBranch();
  if (base === null) return null;
  const diff = execFileSync('git', ['diff', `origin/${base}...HEAD`], { encoding: 'utf8' });
  const patchId = execFileSync('git', ['patch-id', '--stable'], { encoding: 'utf8', input: diff });
  return patchId.trim().split(/\s+/)[0] || null;
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

// why: GitHub closes an issue on merge only for its closing keywords (close, fix, resolve and their forms).
function closesIssue(body, issue) {
  return new RegExp(`\\b(close[sd]?|fix(e[sd])?|resolve[sd]?):?\\s+#${issue}\\b`, 'i').test(body);
}

function existingPullRequest(branch) {
  const result = runGh(['pr', 'view', branch, '--json', 'number,url,state']);
  if (!result.ok) return null;
  const pullRequest = JSON.parse(result.stdout);
  return pullRequest.state === 'OPEN' ? pullRequest : null;
}

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

function pullRequestView(number) {
  const result = runGh(['pr', 'view', String(number), '--json', 'number,url,state,headRefName']);
  if (!result.ok) throw new StepError('gate', `gh=${result.error}`);
  return JSON.parse(result.stdout);
}

function runSibling(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  return { code: result.status ?? 1, line: firstLine(result.stdout ?? '') };
}

function waitForChecks(number, url) {
  announce('wait', number);
  const result = runSibling(WAIT_CHECKS, ['--pr', String(number)]);
  if (result.code === 0) return;
  throw new StepError('wait', result.line.replace(/^checks:\s*/, ''), { subject: url });
}

function gateOnce(number) {
  return runSibling(SHIP_GATE, ['--pr', String(number)]).line;
}

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

function runMergeList(numbers) {
  process.stderr.write(`ship: order ${numbers.join(' ')}\n`);
  const order = runSibling(SHIP_GATE, ['--order', ...numbers]);
  if (order.code !== 0) {
    console.log(`stopped order ${order.line}`);
    process.exitCode = 1;
    return;
  }

  let exitCode = 0;
  const merged = [];
  for (const number of order.line.split(' ')) {
    try {
      const pullRequest = pullRequestView(number);
      runGate(number, pullRequest.url);
      mergePullRequest(number, 'squash', pullRequest.url);
      console.log(confirmMerge(number, pullRequest.url));
      merged.push(pullRequest.headRefName);
    } catch (error) {
      if (!(error instanceof StepError)) throw error;
      console.log(`${error.subject ?? `#${number}`} stopped ${error.step} ${error.message}`);
      exitCode = Math.max(exitCode, error.code === DIRTY_EXIT ? DIRTY_EXIT : 1);
    }
  }
  if (merged.length > 0) console.log(returnToDefault({ base: defaultBranch(), merged }).line);
  process.exitCode = exitCode;
}

function refuseBadText(flags, branch) {
  if (flags.route === 'push') return;
  let body;
  try {
    body = fs.readFileSync(flags.body, 'utf8');
  } catch {
    throw new StepError('create', `body-unreadable ${flags.body}`);
  }
  const problem = subjectProblem(flags.title) ?? attributionProblem(`${flags.title}\n${body}`) ?? branchNameProblem(branch);
  if (problem !== null) throw new StepError('create', `text-refused: ${problem}`);
}

function run(flags, branch, base) {
  refuseBadText(flags, branch);
  if (flags.issue !== undefined) {
    announce('create', flags.issue);
    const body = fs.readFileSync(flags.body, 'utf8');
    if (!closesIssue(body, flags.issue)) throw new StepError('create', `body-missing-closes-${flags.issue}`);
  }

  announce('push');
  if (base === null && flags.route !== 'push') throw new StepError('push', 'default-branch=unknown');
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
  const confirmed = confirmMerge(pullRequest.number, pullRequest.url);
  return `${confirmed}\n${returnToDefault({ base, merged: [branch] }).line}`;
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: ship.mjs --route <push|open-pr|pr-merge> [--title <t>] [--body <f>] [--issue <n>] [--method <m>] | --merge <n...> | --routes | --verdict-current <patch-id>: ${error.message}`);
    process.exitCode = USAGE_EXIT;
    return;
  }

  if (flags.routes) {
    printRoutes();
    return;
  }

  if (flags.verdictCurrent) {
    console.log(currentPatchId() === flags.verdictCurrent ? 'current' : 'stale');
    return;
  }

  if (flags.merge) {
    runMergeList(flags.merge);
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

if (isMain(import.meta.url)) {
  main();
}
