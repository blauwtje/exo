#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { USAGE_EXIT, UsageError, parseFlags, isMain } from '#script-flags';
import { exitWithParent } from '#lifetime';
import { pollUntil } from '../../../lib/loop-budget.mjs';
import { GH_ERROR_EXIT, PR_NUMBER } from './gh-run.mjs';

export const WAIT_MINUTES = 20;
const USAGE = 'usage: wait-checks.mjs --pr <number>';
const GRACE_SECONDS = 120;
const RETRY_MS = 15_000;
const TIMEOUT_EXIT = 124;
const NO_CHECKS = /no checks reported/i;
const FAIL_STATUS = /^fail(ing|ed)?$/i;

function readFlags(argv) {
  const flags = parseFlags(argv, { pr: 'value' }, { usage: USAGE });
  if (!PR_NUMBER.test(flags.pr ?? '')) throw new UsageError(`--pr needs a pull request number, got '${flags.pr ?? ''}'`);
  return { pr: flags.pr };
}

function openLog(cwd) {
  const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, encoding: 'utf8' }).trim();
  const logPath = path.join(gitDirectory, 'exo', 'wait-checks.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  return fs.createWriteStream(logPath, { flags: 'w' });
}

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

function parseArguments() {
  try {
    return readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = USAGE_EXIT;
    return null;
  }
}

async function watchUntilSettled(flags, log) {
  let running = null;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    running?.kill('SIGTERM');
  }, WAIT_MINUTES * 60_000);
  const track = (child) => { running = child; };
  let outcome = await watchChecks(flags.pr, track, log);
  const checksReady = async () => {
    outcome = await watchChecks(flags.pr, track, log);
    return !NO_CHECKS.test(outcome.errorText);
  };
  if (NO_CHECKS.test(outcome.errorText)) {
    await pollUntil(checksReady, { intervalMs: RETRY_MS, wallMs: GRACE_SECONDS * 1000, giveUp: () => timedOut });
  }
  clearTimeout(deadline);
  return { outcome, timedOut };
}

function reportOutcome(outcome, timedOut) {
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
  if (failed.length > 0) {
    console.log(`checks: fail ${failed.join(', ')}`);
    process.exitCode = outcome.code;
    return;
  }
  const firstErrorLine = outcome.errorText.split('\n').find((line) => line.trim() !== '') ?? '';
  console.log(`checks: error ${firstErrorLine.trim()}`);
  process.exitCode = GH_ERROR_EXIT;
}

async function main() {
  exitWithParent('wait-checks');
  const flags = parseArguments();
  if (flags === null) return;
  const log = openLog(process.cwd());
  const { outcome, timedOut } = await watchUntilSettled(flags, log);
  log.end();
  reportOutcome(outcome, timedOut);
}

if (isMain(import.meta.url)) {
  await main();
}
