import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { failingLine } from '#attempt-fingerprint';
import { ruledOutText } from '../../../lib/ruled-out.mjs';
import { landedTasks } from '#plan-landed';
import { environmentMs } from '#script-flags';
import { SCRATCH_FOLDER } from '#scratch-path';
import { landChangelogTask } from './changelog-task.mjs';
import { clip, idleLine, landedLine, planLandedLine, planSessionLine, scriptLandedLine, taskSubject } from './run-report.mjs';
import { appendLog } from './run-session.mjs';
import { SCRIPT } from './run-session-paths.mjs';
import { gitOut } from './run-worktree.mjs';
import { isDocTask } from './run-plan-provider.mjs';
import { noteStep, noteTask } from './run-plan-notes.mjs';
import { handoffFile } from './run-plan-session.mjs';

export function markNow() {
  return { wall: Date.now(), mono: performance.now() };
}

export function sayIdle(ctx, started) {
  const line = idleLine(Date.now() - started.wall, performance.now() - started.mono, environmentMs('EXO_IDLE_MS', 60_000));
  if (line !== null) ctx.say(line);
}

export function noRedProofLine(output) {
  return output.split('\n').find((line) => line.includes('no red proof'))?.trim();
}

export function markLanded(ctx, n, record, startedTask) {
  const { root, say, run, plan, passes } = ctx;
  ctx.lastLandOutput = '';
  ctx.fingerprints.delete(n);
  ctx.retryNote = '';
  run.landings.set(n, { sha: gitOut(root, ['rev-parse', '--short=12', 'HEAD']), record });
  passes.add(n);
  noteStep({ kind: 'commit', task: n, sha: run.landings.get(n).sha });
  fs.rmSync(handoffFile(ctx, n), { force: true });
  ctx.writeTasks();
  const sha = run.landings.get(n).sha;
  if (record.byScript) {
    say(scriptLandedLine({ number: n, sha }));
  } else if (startedTask === null) {
    ctx.planLandedCount += 1;
    say(planLandedLine({ number: n, sha }));
  } else {
    const ms = Math.round(performance.now() - startedTask.mono);
    ctx.landedStats.push({ count: 1, ms, turns: record.turns, weightedTokens: record.weightedTokens, cost: record.cost });
    say(landedLine({ number: n, sha, ms, turns: record.turns, weightedTokens: record.weightedTokens, cost: record.cost }));
  }
  noteTask({ n, subject: taskSubject(plan.tasks.find((entry) => entry.number === n).title), landed: passes.size, total: plan.tasks.length });
  for (const line of (gitOut(root, ['status', '--porcelain'], { trim: false }) ?? '').split('\n').filter(Boolean)) {
    const file = line.slice(3);
    if (!file.startsWith(`${SCRATCH_FOLDER}/`)) run.uncommitted.add(file);
  }
}

export function landByScript(ctx, n) {
  const { root, planPath, planId, plan } = ctx;
  const log = path.join(ctx.logDir, `land-task-${n}.log`);
  const answer = spawnSync(process.execPath, [SCRIPT.landTask, '--plan', planPath, '--task', String(n), '--root', root], {
    cwd: root, env: { ...process.env, EXO_RUN_TASK: `${planId}/${n}` }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: ctx.timeoutMs
  });
  const output = `${answer.stdout ?? ''}${answer.stderr ?? ''}`;
  appendLog(log, output);
  ctx.lastLandOutput = output;
  ctx.lastLandTask = n;
  const landed = answer.status === 0 && landedTasks(plan.tasks, root, planId).includes(n);
  noteStep({ kind: 'check', task: n, passed: landed, line: landed ? '' : failingLine(output) });
  return { landed, output, log };
}

export function landedByChangelogScript(ctx, task) {
  if (!isDocTask(task) || ctx.scriptTried.has(task.number)) return false;
  ctx.scriptTried.add(task.number);
  return landChangelogTask({ root: ctx.root, task, land: () => landByScript(ctx, task.number).landed });
}

export function failedAttemptNote({ root, task, last, proofEnd, log, fallback }) {
  const lines = [
    `The previous attempt did not land task ${task}. Its last result line: ${last}`,
    ...(proofEnd === undefined ? [] : [`The script's proof and land output ended: ${proofEnd}`]),
    `Its log: ${log}`,
    ...(fallback ? [`That attempt ran on ${fallback.to} instead of ${fallback.from} because the provider was overloaded.`] : []),
    ...[ruledOutText(root, task).trimEnd()].filter((text) => text !== '')
  ];
  return `\n${lines.join('\n')}`;
}

export function landInOrder(ctx, numbers, record, started) {
  for (const n of numbers) {
    const attempt = landedTasks(ctx.plan.tasks, ctx.root, ctx.planId).includes(n) ? { landed: true } : landByScript(ctx, n);
    if (attempt.landed) {
      markLanded(ctx, n, record, started);
      continue;
    }
    ctx.say(`task ${n} not landed by the script: ${clip(failingLine(attempt.output), 80)}`);
    const noRed = noRedProofLine(attempt.output);
    if (noRed !== undefined) return { n, reason: noRed };
    ctx.retryNote = failedAttemptNote({ root: ctx.root, task: n, last: failingLine(attempt.output), log: attempt.log, fallback: ctx.sessionFallback });
    return;
  }
}

export function notePlanSession(ctx, record, startedPlan) {
  if (ctx.planLandedCount === 0) return;
  const entry = { count: ctx.planLandedCount, ms: Math.round(performance.now() - startedPlan.mono), turns: record.turns, weightedTokens: record.weightedTokens, cost: record.cost };
  ctx.landedStats.push(entry);
  ctx.say(planSessionLine(entry));
}
