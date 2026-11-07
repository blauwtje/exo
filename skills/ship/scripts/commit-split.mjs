#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { attributionProblem, subjectProblem } from '#commit-text';
import { UsageError, isMain, parseFlags } from '#script-flags';
import { git } from '#git';

const USAGE = 'usage: commit-split.mjs --list | --plan <file> [--apply] [--dir <path>]';
const USAGE_EXIT = 2;
const FLAGS = { dir: 'string', list: 'boolean', plan: 'string', apply: 'boolean' };

export class SplitError extends Error {}

function gitStrict(root, args, env = {}) {
  const result = git(root, args, { env: { ...process.env, ...env } });
  if (result.status !== 0) throw new SplitError(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

export function repositoryRoot(dir) {
  return gitStrict(dir, ['rev-parse', '--show-toplevel']).trim();
}

export function dirtyFiles(root) {
  const output = gitStrict(root, ['status', '--porcelain=v1', '-z', '-uall', '--no-renames']);
  return output
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => ({ status: entry.slice(0, 2).trim() || '?', file: entry.slice(3) }));
}

function readPlan(file) {
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new SplitError(`plan ${file} is not readable JSON: ${error.message}`);
  }
  if (!Array.isArray(plan?.groups) || plan.groups.length === 0) throw new SplitError('plan needs a non-empty "groups" array');
  return plan.groups;
}

function groupProblems(group, index) {
  const label = `group ${index + 1}`;
  if (typeof group?.subject !== 'string') return [`${label} has no subject`];
  const text = `${group.subject}\n${group.body ?? ''}`;
  const problems = [subjectProblem(group.subject), attributionProblem(text)].filter(Boolean).map((problem) => `${label}: ${problem}`);
  if (!Array.isArray(group.files) || group.files.length === 0) problems.push(`${label} lists no files`);
  return problems;
}

function coverageProblems(groups, dirty) {
  const wanted = new Set(dirty.map((entry) => entry.file));
  const seen = new Map();
  const problems = [];
  groups.forEach((group, index) => {
    for (const file of Array.isArray(group?.files) ? group.files : []) {
      if (!wanted.has(file)) problems.push(`group ${index + 1} lists ${file}, which is not a changed file`);
      else if (seen.has(file)) problems.push(`${file} is in group ${seen.get(file)} and group ${index + 1}`);
      else seen.set(file, index + 1);
    }
  });
  for (const file of wanted) if (!seen.has(file)) problems.push(`${file} is changed but in no group`);
  return problems;
}

export function planProblems(groups, dirty) {
  if (dirty.length === 0) return ['the tree has no changes to split'];
  return [...groups.flatMap(groupProblems), ...coverageProblems(groups, dirty)];
}

function workingTreeHash(root) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-split-'));
  const env = { GIT_INDEX_FILE: path.join(directory, 'index') };
  try {
    gitStrict(root, ['read-tree', 'HEAD'], env);
    gitStrict(root, ['add', '-A'], env);
    return gitStrict(root, ['write-tree'], env).trim();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function stagedFiles(root) {
  const output = gitStrict(root, ['diff', '--cached', '--name-only', '-z', '--no-renames']);
  return output.split('\0').filter((name) => name !== '');
}

function commitGroup(root, group) {
  gitStrict(root, ['add', '-A', '--', ...group.files]);
  const stray = stagedFiles(root).filter((file) => !group.files.includes(file));
  if (stray.length > 0) throw new SplitError(`group "${group.subject}" would also commit ${stray.join(', ')}`);
  const message = group.body ? ['-m', group.subject, '-m', group.body] : ['-m', group.subject];
  gitStrict(root, ['commit', '-q', ...message]);
}

export function applySplit(root, groups) {
  const expected = workingTreeHash(root);
  gitStrict(root, ['reset', '-q']);
  let made = 0;
  for (const group of groups) {
    try {
      commitGroup(root, group);
    } catch (error) {
      throw new SplitError(`${error.message}; ${made} of ${groups.length} commits made, the rest stay in the tree`);
    }
    made += 1;
  }
  const actual = gitStrict(root, ['rev-parse', 'HEAD^{tree}']).trim();
  if (actual !== expected) throw new SplitError(`final tree ${actual} differs from the original ${expected}`);
  return { commits: made, tree: actual };
}

export function formatProposal(groups) {
  return groups.map((group, index) => [`${index + 1}. ${group.subject}`, ...group.files.map((file) => `   ${file}`)].join('\n')).join('\n');
}

function run(flags) {
  const root = repositoryRoot(flags.dir ?? process.cwd());
  const dirty = dirtyFiles(root);
  if (flags.list) {
    process.stdout.write(dirty.map((entry) => `${entry.status} ${entry.file}\n`).join(''));
    return;
  }
  if (!flags.plan) throw new UsageError('needs --list or --plan <file>');
  const groups = readPlan(flags.plan);
  const problems = planProblems(groups, dirty);
  if (problems.length > 0) throw new SplitError(`plan refused, nothing committed:\n- ${problems.join('\n- ')}`);
  process.stdout.write(`${formatProposal(groups)}\n`);
  if (!flags.apply) {
    process.stdout.write('proposal only: nothing committed; rerun with --apply after the yes\n');
    return;
  }
  const result = applySplit(root, groups);
  process.stdout.write(`applied ${result.commits} commits; final tree ${result.tree} equals the original\n`);
}

if (isMain(import.meta.url)) {
  try {
    run(parseFlags(process.argv.slice(2), FLAGS, { usage: USAGE }));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error instanceof UsageError ? USAGE_EXIT : 1;
  }
}
