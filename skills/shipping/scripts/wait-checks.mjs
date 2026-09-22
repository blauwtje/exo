#!/usr/bin/env node
// Waits on a pull request's checks with `gh pr checks --watch`, bounded, so a
// stuck CI never holds the session that ships it. gh's exit code passes
// through: 0 when every check passed, 1 when one failed. A watch still running
// at the limit is stopped and exits 124. Checks that have not registered yet
// are asked for again until the grace period ends, because CI starts a few
// seconds after a pull request opens; after that the script exits 0 with a
// note, and the merge gate reads the API for itself.
//
//   node wait-checks.mjs --pr <number> [--minutes <n>] [--grace-seconds <n>]
//
// --minutes defaults to 20 and --grace-seconds to 120.

import { spawn } from 'node:child_process';
import process from 'node:process';
import { UsageError, parseFlags } from '#script-flags';

const DEFAULT_MINUTES = 20;
const DEFAULT_GRACE_SECONDS = 120;
const RETRY_MS = 15_000;
const TIMEOUT_EXIT = 124;
const NO_CHECKS = /no checks reported/i;

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

function watchChecks(pr, track) {
  return new Promise((resolve) => {
    const child = spawn('gh', ['pr', 'checks', pr, '--watch', '--fail-fast'], { stdio: ['ignore', 'inherit', 'pipe'] });
    track(child);
    let errorText = '';
    child.stderr.on('data', (chunk) => {
      errorText += chunk;
      process.stderr.write(chunk);
    });
    child.on('error', (error) => resolve({ code: 127, errorText: `gh did not start: ${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, errorText }));
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
  let running = null;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    running?.kill('SIGTERM');
  }, flags.minutes * 60_000);
  const track = (child) => { running = child; };
  const graceEnds = Date.now() + flags.graceMs;
  let outcome = await watchChecks(flags.pr, track);
  while (!timedOut && NO_CHECKS.test(outcome.errorText) && Date.now() + RETRY_MS <= graceEnds) {
    await sleep(RETRY_MS);
    if (timedOut) break;
    outcome = await watchChecks(flags.pr, track);
  }
  clearTimeout(deadline);
  if (timedOut) {
    console.log(`wait-checks: no verdict after ${flags.minutes} minutes; the pull request stays open`);
    process.exitCode = TIMEOUT_EXIT;
    return;
  }
  if (outcome.code !== 0 && NO_CHECKS.test(outcome.errorText)) {
    console.log('wait-checks: no checks reported; the merge gate reads the API');
    process.exitCode = 0;
    return;
  }
  process.exitCode = outcome.code;
}

await main();
