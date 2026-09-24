#!/usr/bin/env node
// Waits on a pull request's checks with `gh pr checks --watch`, bounded, so a
// stuck CI never holds the session that ships it. `--watch` reprints the
// whole check table every ten seconds; that table goes to a log under the
// git directory instead of this script's own stdout, which prints one
// verdict line. A watch still running at the limit is stopped and exits 124.
// Checks that have not registered yet are asked for again until the grace
// period ends, because CI starts a few seconds after a pull request opens;
// after that the script exits 0 with a note, and the merge gate reads the
// API for itself.
//
//   node wait-checks.mjs --pr <number> [--minutes <n>] [--grace-seconds <n>]
//
// --minutes defaults to 20 and --grace-seconds to 120.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { UsageError, parseFlags } from '#script-flags';

// shipping's SKILL.md states these two figures; the shared contracts check pins
// that text to these exports.
export const DEFAULT_MINUTES = 20;
const DEFAULT_GRACE_SECONDS = 120;
const RETRY_MS = 15_000;
export const TIMEOUT_EXIT = 124;
const NO_CHECKS = /no checks reported/i;
const FAIL_STATUS = /^fail(ing|ed)?$/i;

function positiveNumber(text, fallback, name, allowZero) {
  if (text === undefined) return fallback;
  const number = Number(text);
  const valid = Number.isFinite(number) && (allowZero ? number >= 0 : number > 0);
  if (!valid) throw new UsageError(`${name} needs a ${allowZero ? 'non-negative' : 'positive'} number, got '${text}'`);
  return number;
}

function readFlags(argv) {
  const flags = parseFlags(argv, { pr: 'value', minutes: 'value', 'grace-seconds': 'value' });
  if (!/^[1-9][0-9]*$/.test(flags.pr ?? '')) throw new UsageError('--pr needs a pull request number');
  const minutes = positiveNumber(flags.minutes, DEFAULT_MINUTES, '--minutes', false);
  const graceSeconds = positiveNumber(flags['grace-seconds'], DEFAULT_GRACE_SECONDS, '--grace-seconds', true);
  return { pr: flags.pr, minutes, graceMs: graceSeconds * 1000 };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// The log lives beside the repository's own git metadata, one per worktree,
// so a rerun overwrites it rather than growing without bound.
function openLog(cwd) {
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, encoding: 'utf8' }).trim();
  const logPath = path.join(gitDirectory, 'exo', 'wait-checks.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return fs.createWriteStream(logPath, { flags: 'w' });
}

// gh's watch table is columnar, either tab- or space-padded; a row whose
// status field reads "fail" names a failed check.
function failingChecks(text) {
  const names = new Set();
  for (const line of text.split('\n')) {
    const fields = line.split(/\t| {2,}/).map((field) => field.trim()).filter(Boolean);
    if (fields.length >= 2 && fields.slice(1).some((field) => FAIL_STATUS.test(field))) names.add(fields[0]);
  }
  return [...names];
}

function watchChecks(pr, track, log) {
  return new Promise((resolve) => {
    const child = spawn('gh', ['pr', 'checks', pr, '--watch', '--fail-fast'], { stdio: ['ignore', 'pipe', 'pipe'] });
    track(child);
    let outText = '';
    let errorText = '';
    child.stdout.on('data', (chunk) => {
      outText += chunk;
      log.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      errorText += chunk;
      log.write(chunk);
    });
    child.on('error', (error) => resolve({ code: 127, outText: '', errorText: `gh did not start: ${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, outText, errorText }));
  });
}

async function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`usage: wait-checks.mjs --pr <number> [--minutes <n>] [--grace-seconds <n>]: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const log = openLog(process.cwd());
  let running = null;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    running?.kill('SIGTERM');
  }, flags.minutes * 60_000);
  const track = (child) => { running = child; };
  const graceEnds = Date.now() + flags.graceMs;
  let outcome = await watchChecks(flags.pr, track, log);
  while (!timedOut && NO_CHECKS.test(outcome.errorText) && Date.now() + RETRY_MS <= graceEnds) {
    await sleep(RETRY_MS);
    if (timedOut) break;
    outcome = await watchChecks(flags.pr, track, log);
  }
  clearTimeout(deadline);
  log.end();
  if (timedOut) {
    console.log('checks: timeout');
    process.exitCode = TIMEOUT_EXIT;
    return;
  }
  if (outcome.code === 0) {
    console.log('checks: pass');
    process.exitCode = 0;
    return;
  }
  if (NO_CHECKS.test(outcome.errorText)) {
    console.log('checks: none');
    process.exitCode = 0;
    return;
  }
  const failed = failingChecks(outcome.outText);
  if (failed.length > 0) console.log(`checks: fail ${failed.join(', ')}`);
  process.exitCode = outcome.code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main();
}
