import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { exitWithParent } from '#lifetime';
import { sessionWait } from '../../../harnesses/coordination-contract.mjs';
import { parseFlags, UsageError, isMain, environmentMs } from '#script-flags';

const DEFAULT_TIMEOUT_MS = 540000;
const POLL_INTERVAL_MS = 5000;
const USAGE = [
  'usage: wait-report.mjs --since <epoch seconds> [--since ...] --report <path> [--report <path>...] [--any] [--timeout <seconds>]',
  '--since is given once for all reports or once per --report, paired in order;',
  'a report counts once it is fresh and holds a verdict line (GREEN, BLOCKED, PLAN DRIFT, FAIL or Unresolved:), with no stamp file;',
  '--any returns as soon as one report is fresh and prints only the fresh paths.',
  'Exit 0 prints each report path, then a `final` line: do not wait again; exit 2 prints `waiting <paths>` at the EXO_WAIT_REPORT_MS deadline (default 540000); exit 1 is a bad argument, also a --since later than now.',
].join('\n');

function isFresh(reportPath, sinceMs) {
  if (!fs.existsSync(reportPath)) return false;
  const stats = fs.statSync(reportPath);
  return stats.size > 0 && stats.mtimeMs >= sinceMs;
}

const BLOCKING_LINE = /^\s*(?:[-*]\s+)?(?:Task \d+:\s*)?(?:BLOCKED|PLAN DRIFT|FAIL)\b/;
const UNRESOLVED_LINE = /^\s*(?:[-*]\s+)?Unresolved:\s*(.*?)\s*$/;

const VERDICT_LINE = /^\s*(?:[-*]\s+)?(?:Task \d+:\s*)?GREEN\b/;

function hasVerdict(reportPath) {
  const lines = fs.readFileSync(reportPath, 'utf8').split('\n');
  return lines.some((line) => VERDICT_LINE.test(line) || BLOCKING_LINE.test(line) || UNRESOLVED_LINE.test(line));
}

function isDone(reportPath, sinceMs) {
  return isFresh(reportPath, sinceMs) && hasVerdict(reportPath);
}

export async function waitForReports({ reports, sinceSeconds, timeoutMs, any = false }) {
  const sinceMs = reports.map((_, index) => 1000 * (Array.isArray(sinceSeconds) ? sinceSeconds[index] : sinceSeconds));
  const pendingNow = () => reports.filter((reportPath, index) => !isDone(reportPath, sinceMs[index]));
  const deadline = Date.now() + timeoutMs;
  const done = (pending) => (any ? pending.length < reports.length : pending.length === 0);
  let pending = pendingNow();
  while (!done(pending) && Date.now() < deadline) {
    await delay(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    pending = pendingNow();
  }
  return pending;
}

function timeoutMsFrom(timeout) {
  if (timeout === undefined) return environmentMs('EXO_WAIT_REPORT_MS', DEFAULT_TIMEOUT_MS);
  const seconds = Number(timeout);
  if (!(seconds > 0) || !Number.isFinite(seconds)) {
    throw new UsageError(`flag '--timeout' needs a positive number of seconds, got '${timeout}'`);
  }
  return seconds * 1000;
}

async function main(argv) {
  exitWithParent('wait-report');
  if (sessionWait() !== 'wait-report') throw new UsageError('runs only in a run session (EXO_RUN_SESSION=1); end your turn for the notification');
  const flags = parseFlags(argv, { since: 'list', report: 'list', any: 'boolean', timeout: 'value' }, { usage: USAGE });
  if (flags.since === undefined || !flags.since.every((text) => /^\d+$/.test(text))) {
    throw new UsageError("flag '--since' needs epoch seconds");
  }
  if (flags.report === undefined) throw new UsageError("flag '--report' names a report path");
  if (flags.since.length !== 1 && flags.since.length !== flags.report.length) {
    throw new UsageError("flag '--since' is given once or once per '--report'");
  }
  const sinceSeconds = flags.since.map(Number);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const late = sinceSeconds.find((seconds) => seconds > nowSeconds);
  if (late !== undefined) {
    throw new UsageError(`flag --since ${late} is later than now ${nowSeconds}, so no report can count as fresh; pass the printed Since: or Wait: value, else \`date +%s\` taken before the dispatch`);
  }
  const pending = await waitForReports({
    reports: flags.report,
    sinceSeconds: sinceSeconds.length === 1 ? sinceSeconds[0] : sinceSeconds,
    timeoutMs: timeoutMsFrom(flags.timeout),
    any: flags.any === true,
  });
  const fresh = flags.report.filter((reportPath) => !pending.includes(reportPath));
  if (flags.any ? fresh.length === 0 : pending.length > 0) {
    process.stdout.write(`waiting ${pending.join(' ')}\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${fresh.join('\n')}\nfinal\n`);
}

async function runCli() {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`ERROR wait-report: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) await runCli();
