import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { planIdOf } from '#plan-landed';
import { readLedger, recordRound } from '../../../lib/loop-budget.mjs';
import { runDir } from '../../build/scripts/run-state.mjs';
import { outcome, outcomeLine } from '../../../lib/run-outcomes.mjs';
import { gitOutput } from './gate-command.mjs';

const COMMIT_SEPARATOR = '\u001e';

const FIELD_SEPARATOR = '\u001f';

const GUARD_WITHOUT_REASON = /^none(?!\s*\(\s*[^\s)])/i;

function bodyField(body, name) {
  return body.match(new RegExp(`^${name}: (.+)$`, 'm'))?.[1].trim().replace(/^`|`$/g, '') ?? null;
}

export function repairCommits(root, preFixSha) {
  const log = gitOutput(root, ['log', `--format=%h${FIELD_SEPARATOR}%B${COMMIT_SEPARATOR}`, `${preFixSha}..HEAD`]);
  return log.split(COMMIT_SEPARATOR).map((entry) => entry.trim()).filter((entry) => entry !== '').map((entry) => {
    const [sha, body] = entry.split(FIELD_SEPARATOR);
    return { sha, guard: bodyField(body, 'Guard') };
  });
}

function lacksGuard({ guard }) {
  return guard === null || GUARD_WITHOUT_REASON.test(guard);
}

export function namedGuards(commits) {
  return commits.map(({ guard }) => guard).filter((guard) => guard !== null && !/^none\b/i.test(guard));
}

export function guardLines(commits, diffFiles) {
  const incomplete = commits.filter(lacksGuard);
  const crowded = commits.filter((commit) => new Set(namedGuards([commit]).flatMap((guard) => guard.split(/[\s,]+/))).size > 1);
  const manyGuards = crowded.map((commit) => `FAIL fixer-many-guards (commit ${commit.sha} names more than one guard, at most 1 per fixed cause)`);
  return [
    ...incomplete.map((commit) => `FAIL fixer-no-guard (commit ${commit.sha} lacks Guard:)`),
    ...manyGuards,
    ...namedGuards(commits).filter((guard) => !diffFiles.includes(guard)).map((guard) => `FAIL fixer-guard-not-in-diff (${guard} is not in the repair diff)`)
  ];
}

const CLOCK_FILE = 'gate-wall-mark';

export function startGateClock(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, CLOCK_FILE), String(Date.now()));
}

export function lapMs(dir) {
  const file = path.join(dir, CLOCK_FILE);
  const now = Date.now();
  const mark = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : now;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, String(now));
  return Math.max(0, now - mark);
}

export function roundsRun(dir, kind) {
  return readLedger(dir).filter((row) => row.kind === kind).length;
}

export function recordReviewRound(dir, openAfter) {
  const prior = readLedger(dir).filter((row) => row.kind === 'review').at(-1);
  return recordRound(dir, { kind: 'review', openBefore: prior === undefined ? undefined : Number(prior.open_after), openAfter, wallMs: lapMs(dir) });
}

export function ledgerDirOf(root, planPath) {
  return runDir(path.resolve(root), planIdOf(planPath));
}

export function keepFix({ checksGreen, newFixInDiff, judgeTouched = false, fixBefore, fixAfter }) {
  if (judgeTouched) return false;
  return checksGreen && newFixInDiff === 0 && Number(fixAfter) < Number(fixBefore);
}

export function settleRound({ root, planPath, round, commits, checksGreen, newFixInDiff = 0, judgeTouched = false, fixBefore, fixAfter }) {
  const kept = keepFix({ checksGreen, newFixInDiff, judgeTouched, fixBefore, fixAfter });
  if (!kept) execFileSync('git', ['-C', root, 'revert', '--no-edit', ...commits], { stdio: 'ignore' });
  recordRound(ledgerDirOf(root, planPath), { kind: 'fix', openBefore: fixBefore, openAfter: kept ? fixAfter : fixBefore, wallMs: lapMs(ledgerDirOf(root, planPath)) });
  if (kept) return [];
  return [`DISCARDED round ${round} (${commits.join(',')}) ${outcome('fix discarded').action}: ${outcomeLine('fix discarded')}`];
}

const PENDING_FILE = 'review-round-pending.json';

export function writePending(dir, pending) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PENDING_FILE), JSON.stringify(pending));
}

export function takePending(dir) {
  const file = path.join(dir, PENDING_FILE);
  if (!fs.existsSync(file)) return null;
  const pending = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.rmSync(file);
  return pending;
}
