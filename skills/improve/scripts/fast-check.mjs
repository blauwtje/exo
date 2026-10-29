#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coveringTests } from '../../../lib/covering-tests.mjs';
import { isMain, parseFlags, UsageError } from '../../../lib/script-flags.mjs';

const TEST_TIMEOUT_MS = 60_000;
const USAGE = 'usage: node fast-check.mjs --root <repo root> --tag <tag>';

function gitLines(worktree, args) {
  const run = spawnSync('git', args, { cwd: worktree, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args[0]} failed: ${run.stderr.trim()}`);
  return run.stdout.split('\n').filter(Boolean);
}

function touchedPaths(worktree) {
  const changed = gitLines(worktree, ['diff', '--name-only', 'HEAD']);
  const untracked = gitLines(worktree, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([...changed, ...untracked])];
}

function runFastCommand(worktree, command) {
  const run = spawnSync(command, { cwd: worktree, shell: true, encoding: 'utf8' });
  return run.status === 0 ? null : command;
}

function runCoveringTests(worktree, tests, timeoutMs) {
  const command = `node --test ${tests.join(' ')}`;
  const env = { ...process.env };
  // why: a NODE_TEST_CONTEXT inherited from an outer `node --test` makes the nested runner skip its own run and exit 0.
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync('node', ['--test', ...tests], { cwd: worktree, env, encoding: 'utf8', timeout: timeoutMs });
  return run.status === 0 ? null : command;
}

export function fastCheck({ worktree, fastCheck: command }, timeoutMs = TEST_TIMEOUT_MS) {
  const failedCommand = command ? runFastCommand(worktree, command) : null;
  if (failedCommand) return { ok: false, command: failedCommand };
  const tests = coveringTests(worktree, touchedPaths(worktree));
  if (tests.length === 0) return { ok: true };
  const failedTests = runCoveringTests(worktree, tests, timeoutMs);
  return failedTests ? { ok: false, command: failedTests } : { ok: true };
}

function main() {
  let flags;
  try {
    flags = parseFlags(process.argv.slice(2), { root: 'string', tag: 'string' }, { usage: USAGE });
    for (const name of ['root', 'tag']) if (!flags[name]) throw new UsageError(`--${name} is required`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const root = path.resolve(flags.root);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '.exo', 'improve', `${flags.tag}.json`), 'utf8'));
  const outcome = fastCheck({ worktree: path.resolve(root, cfg.worktree), fastCheck: cfg.fastCheck });
  process.stdout.write(outcome.ok ? 'FAST-CHECK pass\n' : `FAST-CHECK fail ${outcome.command}\n`);
  process.exit(outcome.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
