import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseFlags, UsageError, isMain } from './script-flags.mjs';
import { createWorktree, worktreePath } from './checkout.mjs';
import { git, gitLine, originDefaultBranch } from './git.mjs';
import { settingValue } from './settings-store.mjs';
import { inRun, recordDecision } from './run-decision.mjs';

class WorkspaceError extends Error {}

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
  return originDefaultBranch(dir) ?? currentBranch;
}

function outsideGitDecision(dir, planRepository) {
  if (!planRepository) return { kind: 'stop', reason: `${dir} is not a git repository` };
  let entries;
  try {
    entries = fs.readdirSync(dir).filter((entry) => entry !== '.' && entry !== '..');
  } catch (error) {
    if (error.code === 'ENOENT') return { kind: 'stop', reason: `${dir} does not exist` };
    throw error;
  }
  if (entries.length === 0 || (entries.length === 1 && entries[0] === 'docs')) {
    return { kind: 'init' };
  }
  return { kind: 'stop', reason: `${dir} holds ${entries.sort().join(', ')}; an init would capture files the plan never named` };
}

function chosenPlace(dir) {
  const gitDir = gitLine(dir, ['rev-parse', '--git-dir']);
  const commonDir = gitLine(dir, ['rev-parse', '--git-common-dir']);
  if (realOrSelf(gitDir) !== realOrSelf(commonDir)) {
    return { kind: 'commit-here', where: gitLine(dir, ['rev-parse', '--show-toplevel']) };
  }
  const currentBranch = gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = defaultBranch(dir, currentBranch);
  if (currentBranch !== 'HEAD' && currentBranch !== branch && !prMerged(dir, currentBranch)) {
    return { kind: 'commit-here', where: currentBranch };
  }
  return null;
}

function pickBranch(dir, name) {
  const currentBranch = gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = defaultBranch(dir, currentBranch);
  const startsFromOrigin = currentBranch !== branch && prMerged(dir, currentBranch);
  if (startsFromOrigin) {
    const fetch = git(dir, ['fetch', 'origin']);
    if (fetch.status !== 0) throw new WorkspaceError(fetch.stderr.trim());
  }
  const switchArgs = startsFromOrigin ? ['switch', '-c', name, `origin/${branch}`] : ['switch', '-c', name];
  const switched = git(dir, switchArgs);
  if (switched.status !== 0) throw new WorkspaceError(switched.stderr.trim());
  return name;
}

function pickWorktree(dir, name) {
  const target = worktreePath(name.replace(/\//g, '-'), dir);
  const added = createWorktree(dir, target, [target, '-b', name]);
  if (!added.ok) throw new WorkspaceError(added.error);
  return target;
}

export function applyPick(value, { dir, name }) {
  if (value === 'current') return gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (name === undefined) throw new WorkspaceError(`--pick ${value} needs --name <branch-name>`);
  if (value === 'branch') return pickBranch(dir, name);
  if (value === 'worktree') return pickWorktree(dir, name);
  throw new WorkspaceError(`unknown pick '${value}'`);
}

function pickDecision(value, { dir, name }) {
  try {
    return { kind: 'commit-here', where: applyPick(value, { dir, name }) };
  } catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
    return { kind: 'stop', reason: error.message };
  }
}

function menuFor(branch, currentRecommended) {
  const heading = ['**Where should the commits go?**', `You are on ${branch} now.`, ''];
  return [
    ...heading,
    '- **(A) Branch**: a new branch here.',
    '- **(B) Worktree**: a separate folder, this one untouched.',
    `- **(C) Current branch**: commit onto ${branch}.`,
    '',
    currentRecommended ? 'Recommended: (C), because this work belongs there.' : 'Recommended: (A), because it keeps this work apart.'
  ];
}

function decide({ dir = process.cwd(), planRepository = false, name, currentRecommended = false, env = process.env } = {}) {
  const toplevel = gitLine(dir, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) return outsideGitDecision(dir, planRepository);
  if (planRepository && realOrSelf(toplevel) !== realOrSelf(dir)) {
    return { kind: 'stop', reason: `${dir} sits inside ${toplevel}` };
  }
  const place = chosenPlace(dir);
  if (place) return place;
  const setting = settingValue('workspace');
  if (setting !== 'ask') return pickDecision(setting, { dir, name });
  if (inRun(env)) {
    const decision = pickDecision('branch', { dir, name });
    if (decision.kind === 'commit-here') recordDecision({ source: 'workspace', choice: 'branch', reason: 'a run never asks where the commits go' }, env);
    return decision;
  }
  const currentBranch = gitLine(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return { kind: 'ask', menu: menuFor(defaultBranch(dir, currentBranch), currentRecommended) };
}

function alreadyResolved(dir, planRepository) {
  const toplevel = gitLine(dir, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) return true;
  if (planRepository && realOrSelf(toplevel) !== realOrSelf(dir)) return true;
  return chosenPlace(dir) !== null;
}

function formatDecision(result) {
  if (result.kind === 'stop') return `stop ${result.reason}`;
  if (result.kind === 'init') return 'init';
  if (result.kind === 'commit-here') return `commit-here ${result.where}`;
  return ['ask', ...result.menu].join('\n');
}

function runPick(flags, dir) {
  try {
    const where = applyPick(flags.pick, { dir, name: flags.name });
    const verb = flags.pick === 'current' ? 'staying on' : flags.pick === 'branch' ? 'switched to branch' : 'added worktree at';
    process.stdout.write(`${verb} ${where}\n`);
    return 0;
  } catch (error) {
    if (!(error instanceof WorkspaceError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

function enterRepository(dir) {
  try {
    process.chdir(dir);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    process.stdout.write(`stop ${dir} does not exist\n`);
    return false;
  }
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
  if (flags.repository && !enterRepository(dir)) return 0;
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
  return runPick(flags, dir);
}

if (isMain(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
