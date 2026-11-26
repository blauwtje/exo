#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { parseFlags, UsageError, isMain, USAGE_EXIT } from '#script-flags';
import { defaultBranch } from '#git';
import { settingValue } from '#settings-store';
import { SHIP_WAIT_MS, SHIP_TIMEOUT_EXIT } from '#shared-values';

const USAGE = 'usage: ship.mjs --route <push|open-pr|pr-merge> [--title <t>] [--body <f>] [--issue <n>] [--method <m>] | --merge <n...> | --routes';
const ROUTES = ['push', 'open-pr', 'pr-merge'];
const METHODS = ['squash', 'merge', 'rebase'];
const WAIT_MS = SHIP_WAIT_MS;
const TIMEOUT_EXIT = SHIP_TIMEOUT_EXIT;
const MISSING_GH = 'missing tool: gh on PATH; install it from https://cli.github.com';

class StepError extends Error {
  constructor(step, message, code = 1) {
    super(message);
    this.step = step;
    this.code = code;
  }
}

function cli(command, args, timeout) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout });
  if (command === 'gh' && result.error?.code === 'ENOENT') {
    console.error(MISSING_GH);
    process.exit(1);
  }
  const text = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { ok: result.status === 0, timedOut: result.error?.code === 'ETIMEDOUT', stdout: (result.stdout ?? '').trim(), error: text.split('\n').pop() || result.error?.message || '' };
}

const git = (...args) => cli('git', args);
const gh = (...args) => cli('gh', args);

function currentBranch() {
  return git('branch', '--show-current').stdout;
}

function printRoutes() {
  const setting = settingValue('ship');
  if (setting !== 'ask') return console.log(`route: ${setting} (set)`);
  if (!git('remote', 'get-url', 'origin').ok) return console.log('no origin remote; no route can run');
  const base = defaultBranch(process.cwd());
  const onBranch = base !== null && currentBranch() !== base && spawnSync('gh', ['auth', 'status']).status === 0;
  const menu = onBranch
    ? ['- **(A) Push and merge**: merge on GitHub once tests pass.', '- **(B) Open PR**: GitHub review; you merge.', '- **(C) Keep local**: nothing leaves this computer.', '', 'Recommended: (A), because it merges only after tests pass.']
    : ['- **(A) Push**: send the commits to GitHub.', '- **(B) Keep local**: nothing leaves this computer.', '', 'Recommended: (A), because it backs the commits up.'];
  console.log(['**Where should the commits go?**', 'Your new commits are only on this computer.', '', ...menu].join('\n'));
}

function waitForChecks(number, subject) {
  const result = cli('gh', ['pr', 'checks', String(number), '--watch', '--fail-fast'], WAIT_MS);
  if (result.timedOut) throw new StepError('wait', `checks still running after ${WAIT_MS / 60000} minutes`, TIMEOUT_EXIT);
  if (!result.ok) throw new StepError('wait', `checks failed: ${subject}`);
}

function gate(number) {
  const view = () => JSON.parse(gh('pr', 'view', String(number), '--json', 'mergeStateStatus,state').stdout || '{}');
  let { mergeStateStatus: status, state } = view();
  if (state !== 'OPEN') throw new StepError('gate', `state=${state}`);
  if (status === 'BEHIND') {
    gh('pr', 'update-branch', String(number));
    waitForChecks(number, `#${number}`);
    ({ mergeStateStatus: status } = view());
  }
  if (status === 'DIRTY') throw new StepError('gate', 'DIRTY: conflicts with the base');
  if (!['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(status)) throw new StepError('gate', `mergeStateStatus=${status}`);
}

function mergePullRequest(number, method) {
  gate(number);
  const merge = gh('pr', 'merge', String(number), `--${method}`);
  if (!merge.ok) throw new StepError('merge', merge.error);
  const state = JSON.parse(gh('pr', 'view', String(number), '--json', 'state,url').stdout);
  if (state.state !== 'MERGED') throw new StepError('confirm', `state=${state.state}`);
  return `${state.url} merged`;
}

function openPullRequest(branch, base, flags) {
  const existing = gh('pr', 'view', branch, '--json', 'number,url');
  if (existing.ok) return JSON.parse(existing.stdout);
  const created = gh('pr', 'create', '--base', base, '--head', branch, '--title', flags.title, '--body-file', flags.body);
  if (!created.ok) throw new StepError('create', created.error);
  return JSON.parse(gh('pr', 'view', branch, '--json', 'number,url').stdout);
}

function route(flags, branch, base) {
  if (flags.issue !== undefined && !new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\s+#${flags.issue}\\b`, 'i').test(fs.readFileSync(flags.body, 'utf8'))) {
    throw new StepError('create', `body-missing-closes-${flags.issue}`);
  }
  const tracked = git('rev-parse', '--abbrev-ref', '@{upstream}').ok;
  const push = git(...(branch === base && tracked ? ['push', '--follow-tags'] : ['push', '-u', 'origin', branch]));
  if (!push.ok) throw new StepError('push', push.error);
  if (flags.route === 'push') return `${branch} pushed`;
  const pullRequest = openPullRequest(branch, base, flags);
  if (flags.route === 'open-pr') return `${pullRequest.url} open`;
  waitForChecks(pullRequest.number, pullRequest.url);
  return mergePullRequest(pullRequest.number, flags.method ?? 'squash');
}

function readFlags(argv) {
  if (argv[0] === '--routes') return { routes: true };
  if (argv[0] === '--merge') {
    const numbers = argv.slice(1);
    if (numbers.length === 0 || !numbers.every((number) => /^\d+$/.test(number))) throw new UsageError('--merge needs pull request numbers');
    return { merge: numbers };
  }
  const flags = parseFlags(argv, { route: 'value', title: 'value', body: 'value', issue: 'value', method: 'value' }, { usage: USAGE });
  if (!ROUTES.includes(flags.route)) throw new UsageError(`--route must be one of ${ROUTES.join(', ')}`);
  if (flags.route !== 'push' && (!flags.title || !flags.body)) throw new UsageError(`route '${flags.route}' needs --title and --body`);
  if (flags.issue !== undefined && (!flags.body || !/^\d+$/.test(flags.issue))) throw new UsageError('--issue needs a number and --body');
  if (flags.method !== undefined && !METHODS.includes(flags.method)) throw new UsageError(`unknown method '${flags.method}'`);
  return flags;
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = USAGE_EXIT;
    return;
  }
  if (flags.routes) return printRoutes();
  if (flags.merge) {
    for (const number of flags.merge) {
      try {
        console.log(mergePullRequest(number, 'squash'));
      } catch (error) {
        if (!(error instanceof StepError)) throw error;
        console.log(`#${number} stopped ${error.step} ${error.message}`);
        process.exitCode = 1;
      }
    }
    return;
  }
  const branch = currentBranch();
  const base = defaultBranch(process.cwd());
  if (flags.route !== 'push' && (base === null || branch === base)) {
    console.error(`usage: ship.mjs: route '${flags.route}' needs a branch other than the default branch`);
    process.exitCode = USAGE_EXIT;
    return;
  }
  try {
    console.log(route(flags, branch, base));
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    console.log(`${branch} stopped ${error.step} ${error.message}`);
    process.exitCode = error.code;
  }
}

if (isMain(import.meta.url)) main();
