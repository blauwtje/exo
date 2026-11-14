import fs from 'node:fs';
import path from 'node:path';
import { attemptFingerprint } from '#attempt-fingerprint';
import { decide, formatLine, recordRound, roundCap } from '../../../lib/loop-budget.mjs';
import { SCRATCH_FOLDER } from '#scratch-path';
import { isFileOnDisk } from './run-session-claude.mjs';
import { gitOut } from './run-worktree.mjs';
import { ledgerDirOf } from './run-state.mjs';

export function recordAttempt(ctx, n, check, line) {
  const seen = ctx.fingerprints.get(n) ?? new Set();
  const paths = (gitOut(ctx.root, ['status', '--porcelain'], { trim: false }) ?? '').split('\n').filter(Boolean).map((entry) => entry.slice(3)).filter((file) => !file.startsWith(`${SCRATCH_FOLDER}/`));
  const fingerprint = attemptFingerprint({ check, line, paths });
  if (seen.has(fingerprint)) return true;
  ctx.fingerprints.set(n, seen.add(fingerprint));
  return false;
}

export function attemptsLeft(ctx) {
  return Math.max(0, roundCap('attempt') - ctx.failedAttempts);
}

export function settleAttempt(ctx, { wallMs }) {
  const dir = ledgerDirOf(ctx.root, ctx.planPath);
  const open = ctx.plan.tasks.length - ctx.run.landings.size;
  const costUsd = ctx.spent - (ctx.ledgeredUsd ?? 0);
  ctx.ledgeredUsd = ctx.spent;
  const openAfter = Math.max(1, open);
  recordRound(dir, { kind: 'attempt', openBefore: ctx.openAfterRound, openAfter, wallMs, costUsd });
  ctx.openAfterRound = openAfter;
  const decision = decide(dir, 'attempt');
  return { stop: decision.verdict === 'STOP', line: formatLine('attempt', decision), reason: decision.reason };
}

export function proofNotRun(ctx, n) {
  const report = path.join(ctx.root, SCRATCH_FOLDER, `implementer-${n}.md`);
  return isFileOnDisk(report) && /\bnot run\b/i.test(fs.readFileSync(report, 'utf8'));
}

export function writeReplyReport(ctx, n, reply) {
  const report = path.join(ctx.root, SCRATCH_FOLDER, `implementer-${n}.md`);
  const lines = reply.split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1).trim() === '') lines.pop();
  lines.pop();
  const body = lines.join('\n').trim();
  if (body === '' || isFileOnDisk(report)) return;
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, `${body}\n`);
}
