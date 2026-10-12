#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';

const USAGE_EXIT = 2;

function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const output = result.status === 0 ? result.stdout : result.stderr || result.stdout;
  return { ok: result.status === 0, text: (output ?? '').trim() };
}

function firstLine(text) {
  return text.split('\n').find((line) => line.trim() !== '')?.trim() ?? 'no output';
}

function mainCheckout(dir) {
  const list = git(dir, ['worktree', 'list', '--porcelain']);
  const entry = list.ok ? list.text.split('\n').find((line) => line.startsWith('worktree ')) : undefined;
  return entry === undefined ? null : entry.slice('worktree '.length);
}

function defaultBranch(dir) {
  const remote = git(dir, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  if (remote.ok) return remote.text.replace(/^origin\//, '');
  return ['main', 'master'].find((name) => git(dir, ['rev-parse', '-q', '--verify', `refs/heads/${name}`]).ok) ?? null;
}

export function returnToDefault({ dir = process.cwd(), base = null, merged = [] } = {}) {
  const root = mainCheckout(dir);
  if (root === null) return { pulled: false, line: `${dir} not moved: no git checkout` };
  const target = base ?? defaultBranch(root);
  const current = git(root, ['branch', '--show-current']).text;
  const here = current === '' ? 'a detached HEAD' : current;
  if (target === null) return { pulled: false, line: `${root} stays on ${here}: default branch unknown` };
  if (current !== target && !merged.includes(current)) {
    return { pulled: false, line: `${root} stays on ${here}: not a merged branch` };
  }

  const changes = git(root, ['status', '--porcelain', '--untracked-files=no']);
  if (!changes.ok) return { pulled: false, line: `${root} stays on ${here}: ${firstLine(changes.text)}` };
  if (changes.text !== '') return { pulled: false, line: `${root} stays on ${here}: uncommitted changes` };

  if (current !== target) {
    const switched = git(root, ['switch', target]);
    if (!switched.ok) return { pulled: false, line: `${root} stays on ${here}: ${firstLine(switched.text)}` };
  }
  const pull = git(root, ['pull', '--ff-only']);
  if (!pull.ok) return { pulled: false, line: `${root} on ${target}, not pulled: ${firstLine(pull.text)}` };
  return { pulled: true, line: `${root} on ${target}, pulled` };
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { merged: 'list' });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: return-to-default.mjs [--merged <branch>]...: ${error.message}`);
    process.exitCode = USAGE_EXIT;
    return;
  }
  const outcome = returnToDefault({ merged: flags.merged ?? [] });
  console.log(outcome.line);
  process.exitCode = outcome.pulled ? 0 : 1;
}

if (isMain(import.meta.url)) {
  main();
}
