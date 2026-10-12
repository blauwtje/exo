import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseFlags, UsageError, isMain } from './script-flags.mjs';
import { settingValue } from './settings-store.mjs';
import { inRun, recordDecision } from './run-decision.mjs';

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

export function decide({ dir = process.cwd(), planRepository = false, name, currentRecommended = false, env = process.env } = {}) {
  const toplevel = gitLine(dir, ['rev-parse', '--show-toplevel']);
  if (toplevel === null) return outsideGitDecision(dir, planRepository);
  if (planRepository && realOrSelf(toplevel) !== realOrSelf(dir)) {
    return { kind: 'stop', reason: `${dir} sits inside ${toplevel}` };
  }
  const place = chosenPlace(dir);
  if (place) return place;
  const setting = settingValue('workspace');
  if (setting !== 'ask') {
    try {
      const where = applyPick(setting, { dir, name });
      return { kind: 'commit-here', where };
    } catch (error) {
      if (error instanceof WorkspaceError) return { kind: 'stop', reason: error.message };
      throw error;
    }
  }
  if (inRun(env)) {
    try {
      const where = applyPick('branch', { dir, name });
      recordDecision('workspace', 'branch', 'a run never asks where the commits go', env);
      return { kind: 'commit-here', where };
    } catch (error) {
      if (error instanceof WorkspaceError) return { kind: 'stop', reason: error.message };
      throw error;
    }
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
  if (flags.repository) {
    try {
      process.chdir(dir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      process.stdout.write(`stop ${dir} does not exist\n`);
      return 0;
    }
  }
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

if (isMain(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
