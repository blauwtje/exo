#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { CHECK_LINE } from './gate-command.mjs';
import { blockedNext, decide } from './gate-decide.mjs';
import { parkQuestion } from '../../../lib/run-outcomes.mjs';
import { ledgerDirOf, recordReviewRound, startGateClock, takePending } from './repair-round.mjs';
import { settleFixDiff } from './fix-diff-settle.mjs';
import { completeMerge, recordReview } from './review-record.mjs';
import { fullFailLines } from './gate-repair.mjs';
import { nextLines } from './gate-next.mjs';
import { FULL_NEXT, gateArgs, logProgress } from './gate-progress.mjs';

const USAGE = `Usage: node gate-step.mjs --plan <path> --root <checkout> --base <ref> [--full] [--after review|fix] [--report <file> ...]
       [--pre-fix-sha <sha> --findings <path> --findings-sha256 <hash>]
Without --after: runs gate.mjs --reviews-only and names the --full call to background.
--full: runs the full gate run and appends timestamped lines to .exo/gate-progress.log.
--after review: runs merge-reviews.mjs on each --report.
--after fix: runs gate.mjs --repair and run-probes.mjs.
Prints one STEP <name> ok|fail line per step, its output lines, a LOG <step> digest of the failing lines,
NEXT lines for the handling and DECIDE <reason> where the model decides. Exits 1 when a step fails.`;

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

function startStage(flags, run) {
  const reviews = step('reviews-only', run, 'gate.mjs', [...gateArgs(flags), '--reviews-only']);
  const lines = [...reviews.lines, ...nextLines(reviews.body), FULL_NEXT];
  if (reviews.body.some((line) => line.startsWith('DISPATCH'))) lines.push('DECIDE dispatch the reviews');
  return { lines, status: reviews.status };
}

function fullStage(flags, run) {
  startGateClock(ledgerDirOf(flags.root, flags.plan));
  logProgress(flags.root, 'gate start');
  const full = step('gate', run, 'gate.mjs', gateArgs(flags));
  logProgress(flags.root, full.lines.filter((line) => line.startsWith('STEP ')).join(' '));
  const lines = [...full.lines, ...nextLines(full.body)];
  const unplanned = full.body.some((line) => line.startsWith('UNPLANNED'));
  if (unplanned) lines.push(decide('UNPLANNED', 'outside Files'));
  if (full.status !== 0 && !unplanned) lines.push(...fullFailLines(flags.root, flags.plan));
  if (full.body.some((line) => line.startsWith('SESSION'))) lines.push('DECIDE session check');
  return { lines, status: full.status };
}

function reviewStage(flags, run) {
  const reportArgs = flags.reports.flatMap((r) => ['--report', r]);
  const pending = takePending(ledgerDirOf(flags.root, flags.plan));
  const fixBase = pending === null ? [] : ['--fix-base', pending.preFixSha];
  const ran = step('merge', run, 'merge-reviews.mjs', ['--root', flags.root, '--base', flags.base, ...reportArgs, ...fixBase]);
  const merged = pending === null ? ran : settleFixDiff(pending, ran, { root: flags.root, planPath: flags.plan });
  const lines = [...merged.lines];
  if (completeMerge(merged.body)) recordReview(flags.root, flags.reports);
  const verdict = merged.body.find((line) => line.startsWith('verdict=')) ?? '';
  const count = (name) => Number(verdict.match(new RegExp(`\\b${name}=(\\d+)`))?.[1] ?? 0);
  if (completeMerge(merged.body)) recordReviewRound(ledgerDirOf(flags.root, flags.plan), count('fix') + count('concern'));
  const blocked = verdict.startsWith('verdict=BLOCKED');
  if (blocked) lines.push(blockedNext(merged.body));
  const repairable = !blocked && (count('fix') > 0 || count('concern') > 0);
  if (repairable) lines.push('NEXT dispatch one exo:build-task with exo-kind: fix-review per CLUSTER line, in parallel, each with only its findings; record git rev-parse HEAD as pre-fix-sha first');
  if (repairable) lines.push('DECIDE repair dispatch');
  if (merged.body.some((line) => line.startsWith('BLOCKED'))) lines.push('DECIDE BLOCKED');
  const questions = merged.body.filter((line) => line.startsWith('FINDING') && /\bquestion\b/.test(line));
  questions.forEach((question, i) => parkQuestion({ root: flags.root, task: i + 1, question }));
  if (questions.length > 0) lines.push('DECIDE question findings');
  if (merged.body.some((line) => line === 'CODEX offer')) lines.push('DECIDE CODEX offer');
  return { lines, status: merged.status };
}

function fixStage(flags, run) {
  const repair = step('repair', run, 'gate.mjs', ['--repair', '--plan', flags.plan, '--root', flags.root, '--pre-fix-sha', flags.preFixSha, '--findings', flags.findings, '--findings-sha256', flags.findingsSha256]);
  const probes = step('probes', run, 'run-probes.mjs', ['--report', flags.findings, '--root', flags.root]);
  const lines = [...repair.lines, ...probes.lines];
  if (repair.status !== 0 || probes.status !== 0) lines.push(decide('FAIL', 'gate fail'));
  if (repair.body.some((line) => /^LOOP next=(?:fix|stop)\b/.test(line))) lines.push('DECIDE loop');
  return { lines, status: repair.status || probes.status };
}

const STAGES = { start: startStage, full: fullStage, review: reviewStage, fix: fixStage };

export function runStage(stage, flags, run = spawnScript) {
  return STAGES[flags.full ? 'full' : stage](flags, run);
}

function main(argv) {
  const flags = parseFlags(argv, { full: 'boolean', plan: 'value', root: 'value', base: 'value', after: 'value', report: 'list', 'pre-fix-sha': 'value', findings: 'value', 'findings-sha256': 'value' }, { usage: USAGE });
  for (const name of ['plan', 'root', 'base']) {
    if (flags[name] === undefined) throw new UsageError(`flag '--${name}' is required`);
  }
  const stage = flags.after ?? 'start';
  if (!['start', 'review', 'fix'].includes(stage)) throw new UsageError("flag '--after' takes review or fix");
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
