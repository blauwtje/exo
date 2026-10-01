#!/usr/bin/env node
// Wrapper a PreToolUse rewrite runs a heavy Bash command through:
//   node heavy-run.mjs --session <id> -- <command>
// The command runs once per code state across sessions. A green run is stored
// under its code-state hash and answers the same command on the same code for
// 24 hours; a lock per command and repository makes a second session wait for
// the first and take its result. The command runs via bash in the current
// directory with inherited stdio, and the wrapper exits with its code.
// Cache root: $EXO_HEAVY_CACHE, else $XDG_CACHE_HOME/exo/heavy, else
// ~/.cache/exo/heavy. A failed, interrupted or signalled run is never stored.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GREEN_VALID_MS = 24 * 60 * 60 * 1000;
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const POLL_MS = 200;
// A lock directory with no owner file yet is a holder mid-write; past this age it is stale.
const OWNERLESS_GRACE_MS = 10_000;
// Longest a waiter waits for a live holder before giving up; EXO_HEAVY_WAIT_MS overrides it.
const DEFAULT_WAIT_MS = 2 * 60 * 60 * 1000;
// A lock older than this is stale even if its pid is alive, since a dead holder's pid may be reused.
const HOLDER_CEILING_MS = 12 * 60 * 60 * 1000;

function cacheRoot() {
  if (process.env.EXO_HEAVY_CACHE) return process.env.EXO_HEAVY_CACHE;
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(base, 'exo', 'heavy');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, maxBuffer: 1 << 30 });
  if (result.status !== 0) return null;
  return result.stdout;
}

// Repository facts, or null outside a git repository.
function repositoryOf(cwd) {
  const top = git(['rev-parse', '--show-toplevel'], cwd);
  const common = git(['rev-parse', '--git-common-dir'], cwd);
  if (!top || !common) return null;
  return { top: top.toString().trim(), common: path.resolve(cwd, common.toString().trim()) };
}

// Hash of HEAD, the tracked diff, untracked unignored files, the command and the directory.
function codeStateHash(repository, command, cwd) {
  const hash = createHash('sha256');
  const head = git(['rev-parse', 'HEAD'], repository.top);
  hash.update(head ?? 'no-head');
  hash.update('\0diff\0');
  const diff = git(['diff', 'HEAD', '--binary', '--no-ext-diff', '--no-textconv'], repository.top);
  const listed = git(['ls-files', '--others', '--exclude-standard', '-z'], repository.top);
  // A failed git read must not hash like a clean tree: no hash means no cached result.
  if (diff === null || listed === null) return null;
  hash.update(diff);
  hash.update('\0untracked\0');
  const untracked = listed.toString().split('\0').filter(Boolean).sort();
  for (const relative of untracked) {
    const file = path.join(repository.top, relative);
    let content = '';
    try {
      const stat = fs.lstatSync(file);
      content = stat.isSymbolicLink() ? 'link:' + fs.readlinkSync(file) : stat.isFile() ? sha256(fs.readFileSync(file)) : 'other';
    } catch {
      content = 'unreadable';
    }
    hash.update(relative + '\0' + content + '\0');
  }
  hash.update('\0command\0' + command);
  hash.update('\0cwd\0' + path.relative(repository.top, cwd));
  return hash.digest('hex');
}

function resultPath(root, hash) {
  return path.join(root, 'results', hash + '.json');
}

function readGreen(root, hash) {
  try {
    const result = JSON.parse(fs.readFileSync(resultPath(root, hash), 'utf8'));
    const age = Date.now() - Date.parse(result.finishedAt);
    return result.code === 0 && age >= 0 && age < GREEN_VALID_MS ? result : null;
  } catch {
    return null;
  }
}

function storeGreen(root, hash, command, session) {
  const target = resultPath(root, hash);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  const result = { code: 0, command, session, finishedAt: new Date().toISOString() };
  fs.writeFileSync(temporary, JSON.stringify(result));
  fs.renameSync(temporary, target);
}

function pruneResults(root) {
  const directory = path.join(root, 'results');
  let names = [];
  try {
    names = fs.readdirSync(directory);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(directory, name);
    try {
      if (Date.now() - fs.statSync(file).mtimeMs > PRUNE_AFTER_MS) fs.rmSync(file, { force: true });
    } catch {
      // Another wrapper pruned it first.
    }
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readOwner(lockDirectory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDirectory, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

function isStale(lockDirectory) {
  const owner = readOwner(lockDirectory);
  if (owner) {
    if (Date.now() - Date.parse(owner.startedAt) > HOLDER_CEILING_MS) return true;
    // The command can outlive a killed wrapper, so either process keeps the lock live.
    return !alive(owner.pid) && !(owner.childPid && alive(owner.childPid));
  }
  try {
    return Date.now() - fs.statSync(lockDirectory).mtimeMs > OWNERLESS_GRACE_MS;
  } catch {
    return false;
  }
}

// Move a stale lock aside; the rename is atomic, so one taker wins.
// Another taker may have replaced the stale lock between the check and the rename, so
// the renamed copy is checked again and a live one is put back.
// Limit: if the put-back finds the path taken again, the live holder loses its lock; lift it with a takeover lock.
function removeStale(lockDirectory) {
  const aside = `${lockDirectory}.stale.${process.pid}`;
  try {
    fs.renameSync(lockDirectory, aside);
    if (!isStale(aside)) {
      fs.renameSync(aside, lockDirectory);
      return;
    }
    fs.rmSync(aside, { recursive: true, force: true });
  } catch {
    // Another wrapper took it over first.
  }
}

function tryLock(lockDirectory, session) {
  try {
    fs.mkdirSync(lockDirectory);
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
  fs.writeFileSync(path.join(lockDirectory, 'owner.json'), JSON.stringify({ pid: process.pid, session, startedAt: new Date().toISOString() }));
  return true;
}

function recordChild(lockDirectory, childPid) {
  const owner = readOwner(lockDirectory);
  if (owner?.pid !== process.pid) return;
  fs.writeFileSync(path.join(lockDirectory, 'owner.json'), JSON.stringify({ ...owner, childPid }));
}

function release(lockDirectory) {
  if (readOwner(lockDirectory)?.pid !== process.pid) return;
  fs.rmSync(lockDirectory, { recursive: true, force: true });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseArguments(argv) {
  const separator = argv.indexOf('--');
  const options = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? '' : argv.slice(separator + 1).join(' ');
  const at = options.indexOf('--session');
  return { session: at === -1 ? 'unknown' : options[at + 1] ?? 'unknown', command };
}

// Takes the lock, waiting for a live holder; returns false when the wait deadline passes.
async function acquire(lockDirectory, session) {
  const deadline = Date.now() + Number(process.env.EXO_HEAVY_WAIT_MS || DEFAULT_WAIT_MS);
  let announced = false;
  fs.mkdirSync(path.dirname(lockDirectory), { recursive: true });
  while (Date.now() < deadline) {
    if (tryLock(lockDirectory, session)) return true;
    if (isStale(lockDirectory)) {
      removeStale(lockDirectory);
      continue;
    }
    if (!announced) {
      const holder = readOwner(lockDirectory)?.session ?? 'unknown';
      console.error(`exo heavy: waiting for session ${holder} to finish the same command`);
      announced = true;
    }
    await sleep(POLL_MS);
  }
  return false;
}

function runCommand(command, onChild) {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { stdio: 'inherit' });
    onChild(child);
    child.on('error', () => resolve({ code: 127, signal: null }));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  const { session, command } = parseArguments(process.argv.slice(2));
  if (!command) {
    console.error('exo heavy: no command given after --');
    return 2;
  }
  const cwd = process.cwd();
  const root = cacheRoot();
  pruneResults(root);
  const repository = repositoryOf(cwd);
  const lockKey = sha256(command + '\0' + (repository ? repository.common : cwd)).slice(0, 32);
  const lockDirectory = path.join(root, 'locks', lockKey);
  let signalName = null;
  let child = null;
  let holding = false;
  const forward = (name) => {
    signalName = name;
    if (child) return child.kill(name);
    if (holding) release(lockDirectory);
    process.exit(128 + os.constants.signals[name]);
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));
  process.on('SIGHUP', () => forward('SIGHUP'));

  // Hashes the code state and reports a fresh green result for it, if any.
  function lookup() {
    const hash = repository ? codeStateHash(repository, command, cwd) : null;
    const result = hash ? readGreen(root, hash) : null;
    if (result) console.error(`exo heavy: same code and command already ran green at ${result.finishedAt}; skipped`);
    return { hash, result };
  }

  if (lookup().result) return 0;
  if (!(await acquire(lockDirectory, session))) {
    console.error('exo heavy: gave up waiting for the holder of this command; run it with an EXO_HEAVY_FORCE=1 prefix to skip the wrapper');
    return 1;
  }
  holding = true;
  try {
    // The holder may have finished a green run for this very code while this wrapper waited.
    const { hash, result } = lookup();
    if (result) return 0;
    const { code, signal } = await runCommand(command, (spawned) => {
      child = spawned;
      if (spawned.pid) recordChild(lockDirectory, spawned.pid);
    });
    if (signalName || signal) return 128 + os.constants.signals[signalName ?? signal];
    if (code === 0 && hash) storeGreen(root, hash, command, session);
    return code ?? 1;
  } finally {
    release(lockDirectory);
  }
}

process.exitCode = await main();
