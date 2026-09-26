// The hand-run decision in skills/run-plan/references/workspace.md, scripted.
// `decide` only reads git state (and, for the `workspace` setting, carries out
// a pick that needs no name); `pick` performs the mutating git commands a
// chosen or asked-for place needs. Every rule below cites the workspace.md
// section it encodes.
//
// Rule 1, "Outside git, never": with no git repository at `dir`, nothing
// commits and the reason says so, unless `--plan-repository` marks `dir` as a
// plan's own `Repository:` folder, in which case an empty folder (or one
// holding only `docs`) is `init`, anything else is `stop`, and a `dir` nested
// inside a parent repository is `stop` naming both paths.
// Rule 2, "In a chosen place, never": a linked worktree, or a branch other
// than the default whose pull request is not already merged, is
// `commit-here <where>` naming that worktree or branch; a branch whose pull
// request already merged counts as the default branch instead.
// Rule 3, "Set, never": a `workspace` setting of `branch`, `worktree` or
// `current` carries out that pick immediately (an explicit `--name` supplies
// the branch name a `branch` or `worktree` pick needs) and reports where it
// commits.
// Rule 4, "Otherwise first": prints the `ask` line and the three-choice menu,
// current branch first when `--current-recommended` says the root CLAUDE.md
// or AGENTS.md already answers the question, because judging that prose is
// the calling skill's job, not this script's.
//
// Carrying out the pick, for both Rule 3 and a `--pick` after `ask`: `current`
// stays; `branch` runs `git switch -c <name>`, from `origin/<default>` after
// `git fetch origin` when the run sits on a merged branch; `worktree` runs
// `git worktree add ../<repo>-<slug> -b <name>`. A `--pick` is disallowed
// once the repository already resolves to `commit-here`, `init` or `stop`,
// because asking again inside a run that already sits where the user chose
// is the overcorrection workspace.md warns against.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseFlags, UsageError } from './script-flags.mjs';
import { settingValue } from './settings-store.mjs';

export class WorkspaceError extends Error {}

function git(dir, args) {
  return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
}

function gitLine(dir, args) {
  const result = git(dir, args);
  return result.status === 0 ? result.stdout.trim() : null;
}

function realOrSelf(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

function prMerged(dir, branch) {
  const result = spawnSync('gh', ['pr', 'list', '--head', branch, '--state', 'merged', '--json', 'number'], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) return false;
  try {
    return JSON.parse(result.stdout).length > 0;
  } catch {
    return false;
  }
}

function defaultBranch(dir, currentBranch) {
  const ref = gitLine(dir, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (ref === null) return currentBranch;
  return ref.replace(/^origin\//, '');
}

// Rule 1's folder-not-yet-a-repository branch: `init`, or `stop` naming what blocks it.
function outsideGitDecision(dir, planRepository) {
  if (!planRepository) return { kind: 'stop', reason: `${dir} is not a git repository` };
  const entries = fs.readdirSync(dir).filter((entry) => entry !== '.' && entry !== '..');
  if (entries.length === 0 || (entries.length === 1 && entries[0] === 'docs')) {
    return { kind: 'init' };
  }
  return { kind: 'stop', reason: `${dir} holds ${entries.sort().join(', ')}; an init would capture files the plan never named` };
}

// Rule 2: a linked worktree or a non-default, non-merged branch is already a chosen place.
function chosenPlace(dir) {
  const gitDir = gitLine(dir, ['rev-parse', '--git-dir']);
  const commonDir = gitLine(dir, ['rev-parse', '--git-common-dir']);
  if (realOrSelf(gitDir) !== realOrSelf(commonDir)) {
    return { kind: 'commit-here', where: gitLine(dir, ['rev-parse', '--show-toplevel']) };
  }
  const currentBranch = gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = defaultBranch(dir, currentBranch);
  if (currentBranch !== branch && !prMerged(dir, currentBranch)) {
    return { kind: 'commit-here', where: currentBranch };
  }
  return null;
}

/** Perform `value` (`current`, `branch` or `worktree`) and return where it commits. */
export function applyPick(value, { dir, name }) {
  if (value === 'current') {
    const currentBranch = gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    return currentBranch;
  }
  if (name === undefined) throw new WorkspaceError(`--pick ${value} needs --name <branch-name>`);
  if (value === 'branch') {
    const currentBranch = gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = defaultBranch(dir, currentBranch);
    if (currentBranch !== branch && prMerged(dir, currentBranch)) {
      const fetch = git(dir, ['fetch', 'origin']);
      if (fetch.status !== 0) throw new WorkspaceError(fetch.stderr.trim());
      const switched = git(dir, ['switch', '-c', name, `origin/${branch}`]);
      if (switched.status !== 0) throw new WorkspaceError(switched.stderr.trim());
      return name;
    }
    const switched = git(dir, ['switch', '-c', name]);
    if (switched.status !== 0) throw new WorkspaceError(switched.stderr.trim());
    return name;
  }
  if (value === 'worktree') {
    const toplevel = gitLine(dir, ['rev-parse', '--show-toplevel']);
    const slug = name.replace(/\//g, '-');
    const target = path.join(path.dirname(toplevel), `${path.basename(toplevel)}-${slug}`);
    const added = git(dir, ['worktree', 'add', target, '-b', name]);
    if (added.status !== 0) throw new WorkspaceError(added.stderr.trim());
    return target;
  }
  throw new WorkspaceError(`unknown pick '${value}'`);
}

const MENU = {
  branchFirst: [
    '1. **Branch (Recommended)**: a new branch here',
    '2. **Worktree**: a separate folder, checkout untouched',
    '3. **Current branch**: commit onto <default branch>'
  ],
  currentFirst: [
    '1. **Current branch (Recommended)**: commit onto <default branch>',
    '2. **Branch**: a new branch here',
    '3. **Worktree**: a separate folder, checkout untouched'
  ]
};

/** The decision workspace.md would reach at `dir`: one of `stop`, `init`, `commit-here` or `ask`. */
export function decide({ dir = process.cwd(), planRepository = false, name, currentRecommended = false } = {}) {
  const toplevel = gitLine(dir, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) return outsideGitDecision(dir, planRepository);
  if (planRepository && realOrSelf(toplevel) !== realOrSelf(dir)) {
    return { kind: 'stop', reason: `${dir} sits inside ${toplevel}` };
  }
  const place = chosenPlace(dir);
  if (place) return place;
  const setting = settingValue('workspace');
  if (setting !== 'ask') {
    const where = applyPick(setting, { dir, name });
    return { kind: 'commit-here', where };
  }
  return { kind: 'ask', menu: currentRecommended ? MENU.currentFirst : MENU.branchFirst };
}

/** Whether `dir` already resolves without a question, per Rule 2's "asking again" overcorrection. */
function alreadyResolved(dir, planRepository) {
  const toplevel = gitLine(dir, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) return true;
  if (planRepository && realOrSelf(toplevel) !== realOrSelf(dir)) return true;
  return chosenPlace(dir) !== null;
}

export function formatDecision(result) {
  if (result.kind === 'stop') return `stop ${result.reason}`;
  if (result.kind === 'init') return 'init';
  if (result.kind === 'commit-here') return `commit-here ${result.where}`;
  return ['ask', ...result.menu].join('\n');
}

function main(argv) {
  let flags;
  try {
    flags = parseFlags(argv, { pick: 'string', name: 'string', repository: 'string', 'plan-repository': 'boolean', 'current-recommended': 'boolean' });
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
  const dir = flags.repository ?? process.cwd();
  // The `workspace` setting resolves from process.cwd() (lib/settings-store.mjs
  // walks up from there), so an explicit --repository moves the process there
  // first; every git command below still also passes `-C dir` explicitly.
  if (flags.repository) process.chdir(dir);
  if (flags.pick === undefined) {
    const result = decide({ dir, planRepository: flags['plan-repository'] === true, name: flags.name, currentRecommended: flags['current-recommended'] === true });
    process.stdout.write(`${formatDecision(result)}\n`);
    return 0;
  }
  if (!['branch', 'worktree', 'current'].includes(flags.pick)) {
    process.stderr.write(`invalid pick '${flags.pick}'; use branch, worktree or current\n`);
    return 1;
  }
  if (alreadyResolved(dir, flags['plan-repository'] === true)) {
    process.stderr.write(`--pick disallowed: ${dir} already resolves with no question\n`);
    return 1;
  }
  try {
    const where = applyPick(flags.pick, { dir, name: flags.name });
    const verb = flags.pick === 'current' ? 'staying on' : flags.pick === 'branch' ? 'switched to branch' : 'added worktree at';
    process.stdout.write(`${verb} ${where}\n`);
    return 0;
  } catch (error) {
    if (error instanceof WorkspaceError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
