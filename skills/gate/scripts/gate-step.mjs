#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { CHECK_LINE } from './gate-command.mjs';

const USAGE = `Usage: node gate-step.mjs --plan <path> --root <checkout> --base <ref> [--after review|fix] [--report <file> ...]
       [--pre-fix-sha <sha> --findings <path> --findings-sha256 <hash>]
Without --after: runs gate.mjs --reviews-only, then the full gate run.
--after review: runs merge-reviews.mjs on each --report.
--after fix: runs gate.mjs --repair and run-probes.mjs.
Prints one STEP <name> ok|fail line per step, the step output lines, a LOG <step> digest of the first failing lines,
NEXT lines with the handling a reference page would give, and DECIDE <reason> where the model decides.
It decides no repair or retry. Exits 1 when a step fails.`;

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const FAILING = /^(?:FAIL|UNPLANNED|BLOCKED|STOP)\b|^\s*not ok\b|Error\b/;
const DIGEST_LINES = 3;
const DIGEST_CHARS = 300;

export function spawnScript(script, args) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function checkLines(output) {
  return output.split('\n').filter((line) => CHECK_LINE.test(line)).map((line) => line.trim());
}

function digest(output) {
  const failing = output.split('\n').filter((line) => FAILING.test(line)).slice(0, DIGEST_LINES).map((line) => line.trim()).join(' | ').slice(0, DIGEST_CHARS);
  return [...checkLines(output), failing].filter((part) => part !== '').join(' | ');
}

function step(name, run, script, args) {
  const { status, stdout } = run(script, args);
  const body = stdout.split('\n').filter((line) => line !== '');
  const lines = [`STEP ${name} ${status === 0 ? 'ok' : 'fail'}`, ...body];
  if (status !== 0) lines.push(`LOG ${name} ${digest(stdout) || 'no failing line'}`);
  return { status, lines, body };
}

const NEXT_BY_PREFIX = [
  [/^(?:WARN|FIX-ONLY|SELF-HOSTED|DOCS)\b/, 'NEXT put this line in the report; it ends no turn'],
  [/^SKIP\b/, 'NEXT accept the cached pass; do not rerun it'],
  [/^FLAKY\b/, 'NEXT list the file in the report; it ends no turn'],
  [/^SESSION\b/, 'NEXT call the named mcp tool with its args, record PASS or FAIL, or UNRUN when no such tool exists'],
  [/^DISPATCH\b/, 'NEXT add 3-5 questions from Goal and each task Data, Risk and Acceptance; dispatch exo:review-branch per line, one message']
];

function nextLines(body) {
  return NEXT_BY_PREFIX.flatMap(([pattern, text]) => (body.some((line) => pattern.test(line)) ? [text] : []));
}

function startStage(flags, run) {
  const common = ['--plan', flags.plan, '--root', flags.root, '--base', flags.base];
  const reviews = step('reviews-only', run, 'gate.mjs', [...common, '--reviews-only']);
  const full = step('gate', run, 'gate.mjs', common);
  const lines = [...reviews.lines, ...full.lines, ...nextLines([...reviews.body, ...full.body])];
  if (reviews.body.some((line) => line.startsWith('DISPATCH'))) lines.push('DECIDE dispatch the reviews');
  if (full.body.some((line) => line.startsWith('UNPLANNED'))) lines.push('DECIDE UNPLANNED ends the turn with the report');
  if (full.status !== 0 && !full.body.some((line) => line.startsWith('UNPLANNED'))) lines.push('DECIDE FAIL ends the turn with the report');
  if (full.body.some((line) => line.startsWith('SESSION'))) lines.push('DECIDE session check');
  return { lines, status: reviews.status || full.status };
}

const BLOCKED_CLEARS = [
  [/^UNREAD-FILE\b/, 'rerun the reviewer that did not read the UNREAD-FILE files, then merge again'],
  [/^BLOCKED: report missing/, 'rerun the reviewer whose report is missing, then merge again'],
  [/^BLOCKED recurring\b/, 'end the turn with the recurring finding in the report; fixing code does not clear it']
];

function blockedNext(body) {
  const actions = BLOCKED_CLEARS.filter(([pattern]) => body.some((line) => pattern.test(line))).map(([, action]) => action);
  return `NEXT the merged review is blocked; dispatch nothing until it clears: ${actions.join('; ') || 'rerun the reviewers that did not finish, then merge again'}`;
}

function reviewStage(flags, run) {
  const reportArgs = flags.reports.flatMap((report) => ['--report', report]);
  const merged = step('merge', run, 'merge-reviews.mjs', ['--root', flags.root, '--base', flags.base, ...reportArgs]);
  const lines = [...merged.lines];
  const verdict = merged.body.find((line) => line.startsWith('verdict=')) ?? '';
  const count = (name) => Number(verdict.match(new RegExp(`\\b${name}=(\\d+)`))?.[1] ?? 0);
  const blocked = verdict.startsWith('verdict=BLOCKED');
  if (blocked) lines.push(blockedNext(merged.body));
  const repairable = !blocked && (count('fix') > 0 || count('concern') > 0);
  if (repairable) lines.push('NEXT dispatch one exo:fix-review per CLUSTER line, in parallel, each with only its findings; record git rev-parse HEAD as pre-fix-sha first');
  if (repairable) lines.push('DECIDE repair dispatch');
  if (merged.body.some((line) => line.startsWith('BLOCKED'))) lines.push('DECIDE BLOCKED');
  if (merged.body.some((line) => line.startsWith('FINDING') && /\bquestion\b/.test(line))) lines.push('DECIDE question findings');
  if (merged.body.some((line) => line === 'CODEX offer')) lines.push('DECIDE CODEX offer');
  return { lines, status: merged.status };
}

function fixStage(flags, run) {
  const repair = step('repair', run, 'gate.mjs', ['--repair', '--plan', flags.plan, '--root', flags.root, '--pre-fix-sha', flags.preFixSha, '--findings', flags.findings, '--findings-sha256', flags.findingsSha256]);
  const probes = step('probes', run, 'run-probes.mjs', ['--report', flags.findings, '--root', flags.root]);
  const lines = [...repair.lines, ...probes.lines];
  if (repair.status !== 0 || probes.status !== 0) lines.push('DECIDE FAIL ends the turn with the report');
  if (repair.body.some((line) => /^LOOP next=(?:fix|stop)\b/.test(line))) lines.push('DECIDE loop');
  return { lines, status: repair.status || probes.status };
}

const STAGES = { start: startStage, review: reviewStage, fix: fixStage };

export function runStage(stage, flags, run = spawnScript) {
  return STAGES[stage](flags, run);
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', base: 'value', after: 'value', report: 'list', 'pre-fix-sha': 'value', findings: 'value', 'findings-sha256': 'value' }, { usage: USAGE });
  for (const name of ['plan', 'root', 'base']) {
    if (flags[name] === undefined) throw new UsageError(`flag '--${name}' is required`);
  }
  const stage = flags.after ?? 'start';
  if (!(stage in STAGES)) throw new UsageError("flag '--after' takes review or fix");
  if (stage === 'review' && !flags.report?.length) throw new UsageError("flag '--report' is required with --after review");
  for (const name of ['pre-fix-sha', 'findings', 'findings-sha256']) {
    if (stage === 'fix' && flags[name] === undefined) throw new UsageError(`flag '--${name}' is required with --after fix`);
  }
  const { lines, status } = runStage(stage, { ...flags, reports: flags.report ?? [], preFixSha: flags['pre-fix-sha'], findingsSha256: flags['findings-sha256'] });
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = status;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`gate-step: ${error.message}\n`);
    process.exitCode = 2;
  }
}
